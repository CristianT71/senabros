// Service worker de SENA Bros: guarda el juego en el celular para que abra rápido (y la pantalla de inicio sin internet).
// - Modelos, imágenes y librerías: se guardan la primera vez y después salen del celular (cambian de nombre con ASSET_V).
// - HTML, JS y CSS: se muestran desde el celular y se actualizan por detrás (la próxima vez ya está la versión nueva).
// - Supabase (cuentas, ranking, en línea): siempre por internet, nunca se guarda.
const VERSION = 'senabros-v1';
const CORE = ['./', 'index.html', 'css/style.css', 'js/config.js', 'js/assets.js', 'js/libs/meshopt_decoder.js', 'js/preguntas.js', 'js/game.js', 'js/touch.js',
  'js/online.js', 'js/multiplayer.js', 'js/premios.js', 'js/editor.js', 'js/perfil.js', 'manifest.json', 'assets/icons/icono-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.hostname.endsWith('supabase.co') || url.protocol === 'ws:' || url.protocol === 'wss:') return;
  const forever = url.pathname.includes('/assets/') || url.pathname.includes('/js/libs/') || /cdnjs|jsdelivr|unpkg|fonts\.(googleapis|gstatic)/.test(url.hostname);
  if (forever) {   // primero lo guardado
    e.respondWith(caches.open(VERSION).then(async c => (await c.match(req)) || fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; })));
    return;
  }
  if (url.origin !== location.origin) return;
  // lo guardado ya, y por detrás se trae la versión nueva
  e.respondWith(caches.open(VERSION).then(async c => {
    const hit = await c.match(req, { ignoreSearch: req.mode === 'navigate' });
    const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
