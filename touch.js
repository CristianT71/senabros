// Controles táctiles para celular: cruceta + botones. Cada botón simula la tecla equivalente,
// así el juego (menú, mapa, niveles y pantalla de gloria) funciona igual que con teclado.
// Incluye una ventana de ajustes para mover, agrandar y transparentar los controles (se guarda en el celular).
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
const pad = document.getElementById('tPad'), knob = document.getElementById('tKnob');
const btns = { A: document.querySelector('.tb-a'), B: document.querySelector('.tb-b'), J: document.querySelector('.tb-j') };

// ================= Ajustes guardados =================
const KEY = 'senabros_controls';
const DEFAULTS = { pad: [13, 72], A: [91, 76], B: [79, 87], J: [81, 60], padS: 1, btnS: 1, op: 0.88, vib: true, swap: false };
let cfg = load();
function load() {
  try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (_) { return Object.assign({}, DEFAULTS); }
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (_) {} }
const mirror = ([x, y]) => [100 - x, y];
function pos(name) { const p = cfg[name]; return cfg.swap ? mirror(p) : p; }
function apply() {
  const place = (el, [x, y], s) => { el.style.setProperty('--x', x + '%'); el.style.setProperty('--y', y + '%'); el.style.setProperty('--s', s); el.style.setProperty('--op', cfg.op); };
  place(pad, pos('pad'), cfg.padS);
  for (const k in btns) place(btns[k], pos(k), cfg.btnS);
}
apply();

// ================= Cruceta (una sola zona: se puede deslizar el dedo entre direcciones) =================
let padId = null; const held = new Set(), heldBtns = new Set();
let editing = false;
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
  const k = 0.55 / (cfg.padS || 1);   // el pomo se mueve en coordenadas sin escalar
  knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
  const dirs = new Set(), dead = R * 0.28;
  if (dx < -dead) dirs.add('ArrowLeft'); else if (dx > dead) dirs.add('ArrowRight');
  if (dy > dead * 1.3) dirs.add('ArrowDown');
  else if (dy < -dead * 1.3 && (inMap() || inMenu())) dirs.add('ArrowUp');   // arriba solo en el mapa (en el nivel saltar es el botón A)
  setDirs(dirs);
}
pad.addEventListener('pointerdown', e => { if (editing) return; padId = e.pointerId; pad.setPointerCapture(e.pointerId); padMove(e); e.preventDefault(); });
pad.addEventListener('pointermove', e => { if (!editing && e.pointerId === padId) padMove(e); });
const padEnd = e => { if (e.pointerId !== padId) return; padId = null; knob.style.transform = ''; setDirs(new Set()); };
pad.addEventListener('pointerup', padEnd); pad.addEventListener('pointercancel', padEnd);

// ================= Botones =================
document.querySelectorAll('[data-key]').forEach(b => {
  const code = b.dataset.key;
  const press = e => {
    if (editing) return;
    e.preventDefault(); b.classList.add('on'); b.setPointerCapture(e.pointerId);
    if (code === 'Space' && inMenu()) { tap('Enter'); return; }   // A en el menú = JUGAR
    down(code); heldBtns.add(code);
    if (cfg.vib && navigator.vibrate) navigator.vibrate(12);
  };
  const release = () => { b.classList.remove('on'); if (heldBtns.delete(code)) up(code); };
  b.addEventListener('pointerdown', press);
  b.addEventListener('pointerup', release); b.addEventListener('pointercancel', release);
});
function releaseAll() {
  padId = null; knob.style.transform = ''; setDirs(new Set());
  for (const c of [...heldBtns]) { heldBtns.delete(c); up(c); }
  document.querySelectorAll('.tb.on').forEach(b => b.classList.remove('on'));
}

// ================= Ventana de ajustes =================
const $ = id => document.getElementById(id);
const panel = $('tSettings');
const sliders = [['sPad', 'vPad', 'padS'], ['sBtn', 'vBtn', 'btnS'], ['sOp', 'vOp', 'op']];
function syncUI() {
  for (const [s, v, k] of sliders) { $(s).value = Math.round(cfg[k] * 100); $(v).textContent = Math.round(cfg[k] * 100) + '%'; }
  $('sVib').checked = cfg.vib; $('sSwap').checked = cfg.swap;
}
function openSettings() { releaseAll(); syncUI(); panel.classList.add('show'); window.SENA_PAUSED = true; }
function closeSettings() { panel.classList.remove('show'); save(); if (!editing) window.SENA_PAUSED = false; }
$('tGear').addEventListener('click', e => { e.stopPropagation(); openSettings(); });
for (const [s, v, k] of sliders) $(s).addEventListener('input', () => { cfg[k] = $(s).value / 100; $(v).textContent = $(s).value + '%'; apply(); });
$('sVib').addEventListener('change', () => { cfg.vib = $('sVib').checked; if (cfg.vib && navigator.vibrate) navigator.vibrate(30); });
$('sSwap').addEventListener('change', () => { cfg.swap = $('sSwap').checked; apply(); });
$('sReset').addEventListener('click', () => { cfg = Object.assign({}, DEFAULTS); apply(); syncUI(); save(); });
$('sClose').addEventListener('click', closeSettings);
panel.addEventListener('pointerdown', e => { if (e.target === panel) closeSettings(); });

// ---- modo mover: arrastrar cada control ----
$('sMove').addEventListener('click', () => {
  editing = true; panel.classList.remove('show'); document.body.classList.add('tedit'); window.SENA_PAUSED = true;
});
$('sEditDone').addEventListener('click', () => {
  editing = false; document.body.classList.remove('tedit'); save(); openSettings();
});
const draggables = [['pad', pad], ...Object.entries(btns)];
draggables.forEach(([name, el]) => {
  let id = null;
  el.addEventListener('pointerdown', e => {
    if (!editing) return;
    e.preventDefault(); e.stopPropagation(); id = e.pointerId; el.setPointerCapture(id); el.classList.add('drag');
  });
  el.addEventListener('pointermove', e => {
    if (!editing || e.pointerId !== id) return;
    let x = e.clientX / innerWidth * 100, y = e.clientY / innerHeight * 100;
    x = Math.min(97, Math.max(3, x)); y = Math.min(95, Math.max(8, y));
    cfg[name] = cfg.swap ? [100 - x, y] : [x, y];   // se guarda en coordenadas "diestro"
    apply();
  });
  const end = e => { if (e.pointerId === id) { id = null; el.classList.remove('drag'); } };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
});

// ================= Pantalla completa + horizontal =================
async function goFull() {
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape');
  } catch (_) { /* iPhone no permite bloquear la orientación: se muestra el aviso de girar */ }
}
$('tFull').addEventListener('click', goFull);
// el primer toque en cualquier parte pide pantalla completa y horizontal
window.addEventListener('pointerdown', function first() { goFull(); window.removeEventListener('pointerdown', first); }, { once: true });
// evitar zoom con doble toque y el menú contextual al mantener presionado
document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
document.addEventListener('contextmenu', e => e.preventDefault());
})();
