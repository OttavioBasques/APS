# Respira Urbana — app Android (Capacitor)

O app Android é o **mesmo client web** (`../client/index.html`) empacotado com o [Capacitor](https://capacitorjs.com),
mais uma tela para informar o endereço do servidor e a permissão de localização nativa. A versão web
continua igual: `mobile/` não altera o `client/` (o `build:web` só copia e injeta `mobile.js`).

```
mobile/
├── src/mobile.js            # endereço do servidor (⚙️), teste de conexão, permissão de GPS
├── scripts/build-web.mjs    # client/ → www/ (+ mobile.js)
├── scripts/patch-android.mjs# libera http e garante permissões no AndroidManifest
├── scripts/apk.mjs          # gradlew assembleDebug
└── capacitor.config.json
```

## O que instalar (uma vez)

| Item | Versão |
|---|---|
| Node.js | 20 ou mais novo |
| Android Studio | recente (traz o SDK e o JDK 21 embutido) |
| Celular com **Depuração USB** ligada, ou um emulador criado no Android Studio | Android 7+ |

## Passo a passo

```bash
# 1) servidor no PC (pasta raiz do projeto)
docker-compose up --build

# 2) app (pasta mobile/)
cd mobile
npm install
npm run setup      # cria a pasta android/ (npx cap add android) e ajusta o manifesto
npm run sync       # copia o client web para o app
npm run open       # abre no Android Studio → botão ▶ Run
```

Depois de qualquer mudança no `client/`, rode `npm run sync` e execute de novo no Android Studio.

Atalhos: `npm run run:device` (compila e instala no aparelho/emulador conectado) e `npm run apk`
(gera `android/app/build/outputs/apk/debug/app-debug.apk`, que você pode enviar ao celular).

## Conectando ao servidor

1. Celular e PC na **mesma rede Wi‑Fi**.
2. No PC, descubra o IP: `ipconfig` (Windows, "Endereço IPv4") ou `ip a` / `ifconfig`.
3. Na primeira abertura o app pede o endereço: digite só o IP (ex.: `192.168.0.10` — a porta 3000 é assumida) e
   toque em **Testar** e **Salvar**. Depois dá para mudar pela engrenagem ⚙️ na barra do mapa.
4. **Emulador:** use o botão "Usar emulador" (`10.0.2.2` é o PC visto de dentro do emulador).
5. **Windows:** na primeira vez, permita a porta **3000** no Firewall (Segurança do Windows → Firewall →
   Regras de entrada → Nova regra → Porta TCP 3000), senão o celular não alcança o servidor.

O endereço fica salvo no aparelho. Para um servidor publicado na internet, use o endereço com `https://`.

## Notificações push (Firebase)

O servidor envia os alertas pelo **Firebase Cloud Messaging (FCM)**. Configuração única (gratuita):

1. Em [console.firebase.google.com](https://console.firebase.google.com) crie um projeto (pode desativar o Analytics).
2. **Adicionar app → Android**, com o nome do pacote **`br.respiraurbana.app`**. Baixe o **`google-services.json`** e coloque em
   `mobile/android/app/google-services.json` (a pasta `android/` existe depois de `npm run setup`). O arquivo é ignorado pelo Git.
3. Ainda no Firebase: **Configurações do projeto → Contas de serviço → Gerar nova chave privada**. Salve o `.json` **fora do Git**.
4. Converta a chave para o `.env` do servidor e cole a linha gerada em `.env` (e em `deploy/.env` na VPS):
   ```bash
   node scripts/fcm-env.mjs caminho/para/chave.json
   # FCM_SERVICE_ACCOUNT_B64=eyJ0eXBl...
   ```
5. Reinicie o servidor (`docker-compose up -d --build`) e rode `npm run sync` no `mobile/` e execute o app de novo
   (o `npm install` já traz o plugin `@capacitor/push-notifications`).
6. No app: ⚙️ → **Receber alertas no celular**. Escolha **Nível** (todos / só os graves) e **Área** (todas as cidades
   monitoradas / perto de mim, 100 km). O Android 13+ pede a permissão de notificações.

Como funciona: o `alert-service` publica cada alerta novo; o `push-service` escolhe os aparelhos pelo nível, tipo e distância
e envia via FCM. Tocar na notificação abre o local do alerta no mapa; com o app aberto, o aviso aparece como faixa no topo.
Aparelhos com token inválido são removidos automaticamente. O servidor guarda a posição **arredondada (~1 km)** e só
quando você escolhe "perto de mim". Sem a chave do FCM no servidor, o app avisa que as notificações não estão configuradas.

## Observações

- O app usa tráfego `http` (o gateway local não tem HTTPS); por isso o manifesto recebe
  `usesCleartextTraffic` e o Capacitor usa o esquema `http`. Em produção, publique o gateway com HTTPS.
- As chaves (OpenWeatherMap) vêm do servidor via `/api/config`; a da TomTom nunca sai dele.
- Ícone e splash são os padrões do Capacitor; para personalizar, use `@capacitor/assets`.
- Versões usadas: Capacitor 7 (exige Node 20+, JDK 21 e Android Studio recente). Se o Android Studio pedir
  para atualizar o Gradle/plugin, aceite.
- Não foi possível compilar o APK no ambiente onde este projeto foi escrito (sem Android SDK nem acesso ao npm);
  os scripts e a lógica do app são testados com `npm test`, mas o build do Android é feito na sua máquina.
