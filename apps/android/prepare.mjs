// Se ejecuta después de `npx cap add android`: mete el actualizador, el ícono, la versión y la firma en el proyecto generado.
import { readFileSync, writeFileSync, cpSync, rmSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
const here = dirname(fileURLToPath(import.meta.url));
const A = join(here, 'android', 'app'), SRC = join(A, 'src', 'main');
const version = (process.env.APP_VERSION || '1.0.0').replace(/^v/, ''), [ma, mi, pa] = version.split('.').map(n => parseInt(n) || 0);
const code = ma * 10000 + mi * 100 + pa;
const edit = (f, fn) => { const s = readFileSync(f, 'utf8'), r = fn(s); if (r === s) throw new Error('sin cambios: ' + f); writeFileSync(f, r); };

// 1) Plugin y actividad principal
const pkgDir = join(SRC, 'java', 'com', 'senabros', 'game'); mkdirSync(pkgDir, { recursive: true });
cpSync(join(here, 'native', 'ApkUpdaterPlugin.java'), join(pkgDir, 'ApkUpdaterPlugin.java'));
cpSync(join(here, 'native', 'MainActivity.java'), join(pkgDir, 'MainActivity.java'));

// 2) Permisos y pantalla horizontal
edit(join(SRC, 'AndroidManifest.xml'), s => {
  if (!s.includes('REQUEST_INSTALL_PACKAGES')) s = s.replace('</manifest>', '    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />\n</manifest>');
  return s.replace('<activity', '<activity\n            android:screenOrientation="sensorLandscape"');
});

// 3) Versión y firma (el mismo .keystore en cada versión, para que Android deje actualizar encima)
edit(join(A, 'build.gradle'), s => {
  s = s.replace(/versionCode\s*=?\s*\d+/, 'versionCode ' + code).replace(/versionName\s*=?\s*"[^"]*"/, 'versionName "' + version + '"');
  s = s.replace(/android\s*\{/, 'android {\n    signingConfigs {\n        release {\n            storeFile file("../../senabros.keystore")\n            storePassword "senabros2026"\n            keyAlias "senabros"\n            keyPassword "senabros2026"\n        }\n    }');
  return s.replace(/(buildTypes\s*\{\s*release\s*\{)/, '$1\n            signingConfig signingConfigs.release');
});

// 4) Ícono de la app
const res = join(SRC, 'res'); rmSync(join(res, 'mipmap-anydpi-v26'), { recursive: true, force: true });
const icon = join(here, '..', '..', 'assets', 'icons', 'icono-512.png');
for (const [d, px] of Object.entries({ mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 })) {
  const dir = join(res, 'mipmap-' + d); mkdirSync(dir, { recursive: true });
  for (const n of ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png']) await sharp(icon).resize(px, px).png().toFile(join(dir, n));
}
console.log('Android listo, versión ' + version + ' (' + code + ')');
