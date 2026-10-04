// Copia el juego web (sin service worker) a apps/www: de ahí lo toman la app de Windows y la de Android.
import { cpSync, rmSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..'), out = join(root, 'apps', 'www');
rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
for (const f of ['index.html', 'manifest.json', 'css', 'js', 'assets']) cpSync(join(root, f), join(out, f), { recursive: true });
console.log('apps/www listo');
