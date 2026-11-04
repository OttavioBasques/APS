#!/usr/bin/env node
// Cria a chave da GFW Data API (alertas de desmatamento) e imprime a linha pronta para o .env.
//
// Antes: crie uma conta em https://www.globalforestwatch.org (botao "Sign up", NAO o login com
// Google/Facebook, porque aqui e preciso ter senha) e confirme o e-mail.
//
// Uso:
//   node scripts/gfw-key.mjs                      (pergunta e-mail, senha e organizacao)
//   GFW_EMAIL=voce@x.com GFW_PASSWORD=... node scripts/gfw-key.mjs
//
// A chave vale 1 ano e so e aceita para o dominio cadastrado ("localhost" por padrao).
import readline from 'node:readline/promises';
import { stdin, stdout, env } from 'node:process';

const API = env.GFW_API_URL || 'https://data-api.globalforestwatch.org';

async function ask(rl, label, envName, secret = false) {
  if (env[envName]) return env[envName];
  if (secret) stdout.write('(a senha aparece enquanto voce digita)\n');
  return (await rl.question(label)).trim();
}

async function main() {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const email = await ask(rl, 'E-mail da conta GFW: ', 'GFW_EMAIL');
  const password = await ask(rl, 'Senha: ', 'GFW_PASSWORD', true);
  const org = (await ask(rl, 'Organizacao [UNIP]: ', 'GFW_ORG')) || 'UNIP';
  const domain = (await ask(rl, 'Dominio permitido [localhost]: ', 'GFW_DOMAIN')) || 'localhost';
  rl.close();
  if (!email || !password) throw new Error('e-mail e senha sao obrigatorios');

  const tokenRes = await fetch(`${API}/auth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username: email, password })
  });
  const tokenJson = await tokenRes.json().catch(() => ({}));
  const token = tokenJson?.data?.access_token;
  if (!tokenRes.ok || !token) {
    throw new Error(`nao consegui entrar (HTTP ${tokenRes.status}). Confira e-mail/senha e se a conta foi confirmada por e-mail.`);
  }

  const keyRes = await fetch(`${API}/auth/apikey`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ alias: 'respira-urbana', email, organization: org, domains: [domain] })
  });
  const keyJson = await keyRes.json().catch(() => ({}));
  const data = Array.isArray(keyJson?.data) ? keyJson.data[0] : keyJson?.data;
  if (!keyRes.ok || !data?.api_key) throw new Error(`nao consegui criar a chave (HTTP ${keyRes.status}): ${JSON.stringify(keyJson).slice(0, 200)}`);

  console.log('\nChave criada' + (data.expires_on ? ` (expira em ${String(data.expires_on).slice(0, 10)})` : '') + '. Cole no seu .env:\n');
  console.log(`GFW_API_KEY=${data.api_key}`);
  console.log(`GFW_ORIGIN=${domain.startsWith('http') ? domain : 'http://' + domain}`);
  console.log('\nDepois: docker-compose up -d --build geodata-service alert-service');
}

main().catch((e) => { console.error('Erro: ' + e.message); process.exit(1); });
