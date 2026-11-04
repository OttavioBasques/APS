# Hospedando o servidor numa VPS (Docker Compose + HTTPS)

Estrutura de produção: **Caddy** (portas 80/443, HTTPS automático) serve o site e encaminha `/api/*` para o
`api-gateway`; Redis e todos os microsserviços ficam numa rede interna, sem portas abertas. O app Android passa a usar
`https://seu-dominio`.

```
Internet ──443──▶ Caddy ──▶ client/ (site)
                        └─▶ api-gateway ──▶ geocoding · weather · air-quality · risk · geodata · traffic · alert · push ──▶ Redis
```

## O que você precisa

| Item | Observação |
|---|---|
| VPS Linux (Ubuntu 22.04/24.04) | **2 GB de RAM** recomendado (são 9 processos Node + Redis + Caddy; a construção das imagens pede mais memória que a execução). Qualquer provedor serve: Hetzner, DigitalOcean, Vultr, Oracle Cloud, etc. |
| Domínio | Um registro **A** apontando para o IP da VPS (ex.: `respira.seudominio.com`). Subdomínios gratuitos como DuckDNS também funcionam. |
| Chaves | OpenWeatherMap, TomTom e (para push) a conta de serviço do Firebase — as mesmas do desenvolvimento. |

## Passo a passo

```bash
# 1) na VPS (como root): Docker + firewall (só 22, 80 e 443)
git clone https://github.com/OttavioBasques/APS.git && cd APS/respira-urbana-distributed
sudo bash deploy/bootstrap.sh

# 2) configuração
cp deploy/.env.example deploy/.env
nano deploy/.env            # DOMAIN, chaves, FCM_SERVICE_ACCOUNT_B64...
chmod 600 deploy/.env

# 3) subir
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env up -d --build
```

Em 1–2 minutos o Caddy obtém o certificado. Teste: `https://seu-dominio/health` deve responder `{"status":"ok",...}` e
`https://seu-dominio/` abre o app web.

**Sem domínio ainda?** Use `DOMAIN=:80` e acesse `http://IP-DA-VPS` só para testar (o navegador exige HTTPS para a
geolocalização; o app Android não).

## No app Android

Abra a engrenagem ⚙️, informe `https://seu-dominio` e salve. Não é preciso recompilar o app.

## Operação

| Tarefa | Comando (na pasta do projeto) |
|---|---|
| Ver logs | `docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env logs -f api-gateway` |
| Estado dos serviços | `docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env ps` |
| Atualizar para o código novo | `bash deploy/update.sh` |
| Parar | `docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env down` |

Os containers reiniciam sozinhos (`restart: unless-stopped`) após falha ou reboot da VPS.

## Dados e backup

Quase tudo no Redis é cache e se refaz sozinho. O que persiste (volume `redisdata`, AOF ligado): **aparelhos
registrados para push** e **alertas recentes**. Se perder o volume, os aparelhos voltam a se cadastrar na próxima vez
que o app for aberto. Para copiar: `docker run --rm -v APS_redisdata:/d -v "$PWD":/b alpine tar czf /b/redis-backup.tgz -C /d .`
(o nome do volume é `<pasta-do-projeto>_redisdata`; confira com `docker volume ls`).

## Segurança — o que está e o que não está coberto

- Só 80/443 expostos; Redis e serviços internos inacessíveis de fora.
- `deploy/.env` e a chave do Firebase **nunca** devem ir para o Git (o `.gitignore` da raiz ignora `deploy/.env`; confira com `git status`).
- A API é pública e **sem login** (os dados são públicos e somente leitura). O cadastro de push tem limite por IP
  (20 por 10 min) e por tamanho de corpo. Para uso aberto à internet, considere um limite de requisições no Caddy
  (módulo `rate_limit`) ou um CDN/WAF na frente.
- A chave da OpenWeatherMap é enviada ao navegador (os tiles vêm direto de lá): use a chave gratuita.
- Cotas: TomTom e OpenWeatherMap têm limites no plano gratuito; o cache do Redis reduz o consumo, mas muitos usuários
  podem esgotá-los.

## Outros provedores

O mesmo `docker-compose.prod.yml` roda em qualquer host com Docker. Plataformas que exigem um serviço por container
(Render, Railway) precisariam de um blueprint próprio por serviço — não incluído nesta versão.
