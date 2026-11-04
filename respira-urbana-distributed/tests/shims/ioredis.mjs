// Redis em memoria, compartilhado pelo processo (inclui Pub/Sub, listas e SET ... EX ... NX).
const store = new Map();
const lists = new Map();
const channels = new Map();

export function resetRedis() { store.clear(); lists.clear(); }

export default class Redis {
  constructor(url, opts = {}) {
    this.status = opts.lazyConnect ? 'wait' : 'ready';
    this.handlers = {};
  }
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this; }
  async connect() { this.status = 'ready'; }
  async get(k) {
    const e = store.get(k);
    if (!e) return null;
    if (e.exp && e.exp < Date.now()) { store.delete(k); return null; }
    return e.v;
  }
  async set(k, v, ...args) {
    let ttl = 0; let nx = false;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === 'EX') ttl = args[++i];
      else if (args[i] === 'NX') nx = true;
    }
    if (nx && (await this.get(k)) !== null) return null;
    store.set(k, { v, exp: ttl ? Date.now() + ttl * 1000 : 0 });
    return 'OK';
  }
  async lpush(k, v) { const l = lists.get(k) || []; l.unshift(v); lists.set(k, l); return l.length; }
  async ltrim(k, a, b) { lists.set(k, (lists.get(k) || []).slice(a, b + 1)); return 'OK'; }
  async lrange(k, a, b) { const l = lists.get(k) || []; return l.slice(a, b === -1 ? undefined : b + 1); }
  async publish(ch, msg) {
    const subs = channels.get(ch) || new Set();
    for (const c of subs) setImmediate(() => (c.handlers.message || []).forEach((f) => f(ch, msg)));
    return subs.size;
  }
  subscribe(...args) {
    const cb = typeof args[args.length - 1] === 'function' ? args.pop() : null;
    for (const ch of args) {
      if (!channels.has(ch)) channels.set(ch, new Set());
      channels.get(ch).add(this);
    }
    if (cb) cb(null, args.length);
  }
}
