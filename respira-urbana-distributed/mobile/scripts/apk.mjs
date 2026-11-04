// Gera o APK de debug (precisa de JDK 21 e Android SDK; o Android Studio instala os dois).
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const android = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../android');
const win = process.platform === 'win32';
const r = spawnSync(win ? 'gradlew.bat' : './gradlew', ['assembleDebug'], { cwd: android, stdio: 'inherit', shell: win });
if (r.status === 0) console.log('\nAPK: mobile/android/app/build/outputs/apk/debug/app-debug.apk');
process.exit(r.status ?? 1);
