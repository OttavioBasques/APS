// Ajusta o AndroidManifest gerado pelo "npx cap add android": permite http (o gateway na rede
// local nao tem HTTPS) e garante internet + localizacao. Idempotente. Uso: node scripts/patch-android.mjs [manifest]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PERMISSIONS = ['android.permission.INTERNET', 'android.permission.ACCESS_COARSE_LOCATION', 'android.permission.ACCESS_FINE_LOCATION'];

export function patchManifest(xml) {
  let out = xml;
  if (!/<application\b/.test(out)) throw new Error('AndroidManifest sem <application>');
  if (/android:usesCleartextTraffic=/.test(out)) {
    out = out.replace(/android:usesCleartextTraffic="[^"]*"/, 'android:usesCleartextTraffic="true"');
  } else {
    out = out.replace(/<application\b/, '<application\n        android:usesCleartextTraffic="true"');
  }
  const missing = PERMISSIONS.filter((p) => !out.includes(`android:name="${p}"`));
  if (missing.length) {
    const lines = missing.map((p) => `    <uses-permission android:name="${p}" />`).join('\n');
    out = out.replace(/<\/manifest>/, `${lines}\n</manifest>`);
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const file = process.argv[2] || path.resolve(here, '../android/app/src/main/AndroidManifest.xml');
  if (!fs.existsSync(file)) {
    console.error(`[mobile] ${file} nao existe. Rode primeiro: npm run setup`);
    process.exit(1);
  }
  const before = fs.readFileSync(file, 'utf8');
  const after = patchManifest(before);
  if (after !== before) fs.writeFileSync(file, after);
  console.log(`[mobile] AndroidManifest ${after !== before ? 'ajustado' : 'ja estava ajustado'}`);
}
