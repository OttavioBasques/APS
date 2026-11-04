#!/usr/bin/env node
// Converte o JSON da conta de servico do Firebase na linha FCM_SERVICE_ACCOUNT_B64=... do .env.
//   node scripts/fcm-env.mjs caminho/para/chave.json
import fs from 'node:fs';

const file = process.argv[2];
if (!file) { console.error('uso: node scripts/fcm-env.mjs caminho/para/chave.json'); process.exit(1); }
let json;
try { json = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.error(`nao consegui ler ${file}: ${e.message}`); process.exit(1); }
for (const k of ['type', 'project_id', 'private_key', 'client_email']) {
  if (!json[k]) { console.error(`o arquivo nao parece uma chave de conta de servico (falta "${k}")`); process.exit(1); }
}
if (json.type !== 'service_account') { console.error('type deve ser "service_account"'); process.exit(1); }
console.log(`FCM_SERVICE_ACCOUNT_B64=${Buffer.from(JSON.stringify(json)).toString('base64')}`);
console.error(`\nProjeto Firebase: ${json.project_id}. Cole a linha acima no .env e NAO versione a chave.`);
