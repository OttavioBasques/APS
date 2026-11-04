import crypto from 'node:crypto';

// Cliente minimo do FCM HTTP v1, sem firebase-admin: autentica com a conta de servico
// (JWT RS256 -> token OAuth2) e envia mensagens. Ver:
// https://firebase.google.com/docs/cloud-messaging/send-message
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const b64url = (v) => Buffer.from(v).toString('base64url');

export function loadServiceAccount(env = process.env) {
  const raw = env.FCM_SERVICE_ACCOUNT_B64
    ? Buffer.from(env.FCM_SERVICE_ACCOUNT_B64, 'base64').toString('utf8')
    : env.FCM_SERVICE_ACCOUNT_JSON || '';
  if (!raw.trim()) return null;
  try {
    const sa = JSON.parse(raw);
    if (!sa.client_email || !sa.private_key || !sa.project_id) return null;
    return { clientEmail: sa.client_email, privateKey: sa.private_key, projectId: sa.project_id, tokenUri: sa.token_uri || 'https://oauth2.googleapis.com/token' };
  } catch { return null; }
}

export function signJwt(sa, nowSec = Math.floor(Date.now() / 1000)) {
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: sa.clientEmail, scope: SCOPE, aud: sa.tokenUri, iat: nowSec, exp: nowSec + 3600 }));
  const sig = crypto.createSign('RSA-SHA256').update(`${head}.${claims}`).sign(sa.privateKey).toString('base64url');
  return `${head}.${claims}.${sig}`;
}

// Erros que significam "este token nunca mais vai funcionar": remover o dispositivo.
export function isDeadToken(status, body) {
  const code = body?.error?.status;
  const detail = (body?.error?.details || []).map((d) => d.errorCode).join(',');
  return status === 404 || detail.includes('UNREGISTERED') || code === 'NOT_FOUND' ||
    (status === 400 && code === 'INVALID_ARGUMENT' && /registration token/i.test(body?.error?.message || ''));
}

export function createFcm(sa, fetchImpl = (...a) => fetch(...a)) {
  let cached = null;   // { token, exp }

  async function accessToken() {
    if (cached && cached.exp > Date.now() + 60000) return cached.token;
    const res = await fetchImpl(sa.tokenUri, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: signJwt(sa) }).toString()
    });
    if (!res.ok) throw new Error(`oauth respondeu ${res.status}`);
    const j = await res.json();
    cached = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
    return cached.token;
  }

  // Devolve { ok:true } | { ok:false, dead:true } | { ok:false, dead:false, error }
  async function send(payload) {
    try {
      const token = await accessToken();
      const res = await fetchImpl(`https://fcm.googleapis.com/v1/projects/${sa.projectId}/messages:send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      if (res.ok) return { ok: true };
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) cached = null;
      return { ok: false, dead: isDeadToken(res.status, body), error: `fcm ${res.status} ${body?.error?.status || ''}`.trim() };
    } catch (err) {
      return { ok: false, dead: false, error: err.message };
    }
  }
  return { send, accessToken };
}
