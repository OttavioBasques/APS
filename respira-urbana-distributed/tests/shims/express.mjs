// Mini-express para testes offline (sem npm install). Cobre o que o projeto usa:
// Router/app com get/post/patch/delete/use, parametros (:id), middlewares com
// cadeia e tratamento de erro (4 argumentos), express.json() e res.status/json/send/set.
import http from 'node:http';

function compile(path) {
  const keys = [];
  const src = path.replace(/:([A-Za-z_]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; });
  return { re: new RegExp('^' + src + '/?$'), keys };
}

function runChain(handlers, req, res, err, done) {
  let i = 0;
  const next = (e) => {
    const h = handlers[i++];
    if (!h) return done(e);
    const isErrHandler = h.length === 4;
    if (e && !isErrHandler) return next(e);
    if (!e && isErrHandler) return next();
    try { isErrHandler ? h(e, req, res, next) : h(req, res, next); } catch (ex) { next(ex); }
  };
  next(err);
}

export function Router() {
  const layers = [];
  const router = (req, res, next) => router.handle(req, res, next);
  for (const m of ['GET', 'POST', 'PATCH', 'DELETE', 'PUT', 'OPTIONS']) {
    router[m.toLowerCase()] = (path, ...handlers) => {
      layers.push({ method: m, ...compile(path), handlers: handlers.flat() });
      return router;
    };
  }
  router.use = (...args) => {
    const prefix = typeof args[0] === 'string' ? args.shift() : '';
    layers.push({ use: true, prefix, handlers: args.flat() });
    return router;
  };
  router.handle = (req, res, done) => {
    let li = 0;
    const nextLayer = (err) => {
      const layer = layers[li++];
      if (!layer) return done(err);
      if (layer.use) {
        const p = layer.prefix;
        if (p && !(req.path === p || req.path.startsWith(p + '/'))) return nextLayer(err);
        const saved = req.path;
        if (p) req.path = saved.slice(p.length) || '/';
        return runChain(layer.handlers, req, res, err, (e) => { req.path = saved; nextLayer(e); });
      }
      if (err || layer.method !== req.method) return nextLayer(err);
      const m = layer.re.exec(req.path);
      if (!m) return nextLayer(err);
      req.params = Object.fromEntries(layer.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      return runChain(layer.handlers, req, res, undefined, nextLayer);
    };
    nextLayer();
  };
  return router;
}

export function json({ limit = '100kb' } = {}) {
  const m = /^(\d+)\s*(kb|mb)?$/i.exec(String(limit));
  const max = m ? Number(m[1]) * (m[2]?.toLowerCase() === 'mb' ? 1048576 : m[2] ? 1024 : 1) : 102400;
  return (req, res, next) => {
    const hasBody = ['POST', 'PUT', 'PATCH'].includes(req.method);
    if (!hasBody || !(req.headers['content-type'] || '').includes('application/json')) { req.body = req.body ?? {}; return next(); }
    const chunks = [];
    let size = 0;
    req.on('data', (c) => { size += c.length; chunks.push(c); });
    req.on('end', () => {
      if (size > max) { const e = new Error('too large'); e.type = 'entity.too.large'; return next(e); }
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text) { req.body = {}; return next(); }
      try { req.body = JSON.parse(text); next(); } catch (ex) { ex.type = 'entity.parse.failed'; next(ex); }
    });
  };
}

export default function express() {
  const app = Router();
  app.set = () => app;
  app.listen = (port, cb) => {
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://localhost');
      req.path = u.pathname;
      req.query = Object.fromEntries(u.searchParams);
      req.ip = req.socket.remoteAddress;
      req.params = {};
      res.status = (c) => { res.statusCode = c; return res; };
      res.set = (k, v) => { res.setHeader(k, v); return res; };
      res.json = (o) => {
        if (!res.getHeader('content-type')) res.setHeader('content-type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(o));
        return res;
      };
      res.send = (t) => { res.end(typeof t === 'string' ? t : JSON.stringify(t)); return res; };
      app.handle(req, res, (err) => {
        if (err) { res.statusCode = 500; return res.end('erro'); }
        res.statusCode = 404;
        res.setHeader('content-type', 'text/html');
        res.end(`<pre>Cannot ${req.method} ${req.path}</pre>`);
      });
    });
    server.listen(port, cb);
    return server;
  };
  return app;
}
express.Router = Router;
express.json = json;
