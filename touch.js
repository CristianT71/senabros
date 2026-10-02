// Controles táctiles para celular: cruceta + botones. Cada botón simula la tecla equivalente,
// así el juego (menú, mapa, niveles y pantalla de gloria) funciona igual que con teclado.
(() => {
'use strict';
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (!isTouch) return;
document.body.classList.add('touch');

const send = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true }));
const down = code => send('keydown', code), up = code => send('keyup', code);
const tap = code => { down(code); setTimeout(() => up(code), 60); };
const inMenu = () => document.body.classList.contains('menu');
const inMap = () => document.body.classList.contains('map');

// ---------- Cruceta (una sola zona: se puede deslizar el dedo entre direcciones) ----------
const pad = document.getElementById('tPad'), knob = document.getElementById('tKnob');
let padId = null; const held = new Set();
function setDirs(dirs) {
  for (const c of [...held]) if (!dirs.has(c)) { held.delete(c); up(c); }
  for (const c of dirs) if (!held.has(c)) {
    held.add(c);
    // en el menú y en el mapa cada toque mueve una vez; en el nivel se mantiene presionada
    if (inMenu() || inMap()) tap(c); else down(c);
  }
}
function padMove(e) {
  const r = pad.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  let dx = e.clientX - cx, dy = e.clientY - cy; const R = r.width / 2, d = Math.hypot(dx, dy);
  if (d > R) { dx *= R / d; dy *= R / d; }
  knob.style.transform = `translate(${dx * 0.55}px, ${dy * 0.55}px)`;
  const dirs = new Set(), dead = R * 0.28;
  if (dx < -dead) dirs.add('ArrowLeft'); else if (dx > dead) dirs.add('ArrowRight');
  if (dy > dead * 1.3) dirs.add('ArrowDown');
  else if (dy < -dead * 1.3 && (inMap() || inMenu())) dirs.add('ArrowUp');   // arriba solo en el mapa (en el nivel saltar es el botón A)
  setDirs(dirs);
}
pad.addEventListener('pointerdown', e => { padId = e.pointerId; pad.setPointerCapture(e.pointerId); padMove(e); e.preventDefault(); });
pad.addEventListener('pointermove', e => { if (e.pointerId === padId) padMove(e); });
const padEnd = e => { if (e.pointerId !== padId) return; padId = null; knob.style.transform = ''; setDirs(new Set()); };
pad.addEventListener('pointerup', padEnd); pad.addEventListener('pointercancel', padEnd);

// ---------- Botones ----------
document.querySelectorAll('[data-key]').forEach(b => {
  const code = b.dataset.key;
  const press = e => {
    e.preventDefault(); b.classList.add('on'); b.setPointerCapture(e.pointerId);
    if (code === 'Space' && inMenu()) { tap('Enter'); return; }   // A en el menú = JUGAR
    down(code);
    if (navigator.vibrate) navigator.vibrate(12);
  };
  const release = e => { b.classList.remove('on'); up(code); };
  b.addEventListener('pointerdown', press);
  b.addEventListener('pointerup', release); b.addEventListener('pointercancel', release);
});

// ---------- Pantalla completa + horizontal ----------
async function goFull() {
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape');
  } catch (_) { /* iPhone no permite bloquear la orientación: se muestra el aviso de girar */ }
}
document.getElementById('tFull').addEventListener('click', goFull);
// el primer toque en cualquier parte pide pantalla completa y horizontal
window.addEventListener('pointerdown', function first() { goFull(); window.removeEventListener('pointerdown', first); }, { once: true });
// evitar zoom con doble toque y el menú contextual al mantener presionado
document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
document.addEventListener('contextmenu', e => e.preventDefault());
})();
