// Editor de niveles: se pinta una cuadrícula de 14 filas, se prueba al instante, se guarda en el navegador
// y se publica con un código (NV-XXXXX) para que cualquiera lo juegue desde "Comunidad".
// El formato y la conversión a nivel jugable están en game.js (SENA_CUSTOM.toSpec).
(() => {
'use strict';
const $ = id => document.getElementById(id);
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'class') e.className = v; else if (k.startsWith('on')) e[k] = v; else if (k === 'html') e.innerHTML = v; else e.setAttribute(k, v); }
  e.append(...kids.filter(k => k != null)); return e;
};
const H = 14, MINW = 30, MAXW = 240, KEY = 'senabros_editor';
const SVG = d => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

// ---------- herramientas ----------
const TOOLS = [
  { c: '.', name: 'Borrar', group: 'Básico' }, { c: 'pan', name: 'Mover vista', group: 'Básico' },
  { c: '#', name: 'Suelo', group: 'Bloques' }, { c: 'B', name: 'Ladrillo', group: 'Bloques' }, { c: '?', name: 'Bloque ?', group: 'Bloques' },
  { c: 'M', name: 'Bloque hongo', group: 'Bloques' }, { c: 'Q', name: 'Bloque pregunta', group: 'Bloques' }, { c: 'S', name: 'Piedra', group: 'Bloques' }, { c: 'p', name: 'Tubo', group: 'Bloques' },
  { c: 'o', name: 'Moneda', group: 'Cosas' }, { c: '^', name: 'Trampolín', group: 'Cosas' },
  { c: '1', name: 'Robot 404', group: 'Bugs' }, { c: '2', name: 'Entrega tardía', group: 'Bugs' }, { c: '3', name: 'Archivo volador', group: 'Bugs' },
  { c: 'K', name: 'Cañón', group: 'Bugs' }, { c: 'f', name: 'Bola de fuego', group: 'Bugs' }, { c: 'z', name: 'Rayo', group: 'Bugs' },
  { c: '=', name: 'Plataforma ida y vuelta', group: 'Plataformas' }, { c: '|', name: 'Ascensor', group: 'Plataformas' }, { c: '_', name: 'Plataforma que cae', group: 'Plataformas' },
  { c: '>', name: 'Cinta a la derecha', group: 'Plataformas' }, { c: '<', name: 'Cinta a la izquierda', group: 'Plataformas' },
  { c: 'I', name: 'Inicio', group: 'Meta' }, { c: 'C', name: 'Checkpoint', group: 'Meta' }, { c: 'F', name: 'Bandera (meta)', group: 'Meta' },
];
const PAINT = new Set(['.', '#', 'B', '?', 'S', 'o', '<', '>', 'M', 'Q']);   // se pueden pintar arrastrando
const UNIQUE = new Set(['I', 'C', 'F']);
const SNAP = { '^': 2, 'I': 2, 'C': 2, 'F': 2, 'f': 0, 'z': 13 };   // fila fija para algunas piezas
const GROUND = {
  yamboro: ['#58c048', '#c8743a'], laguna: ['#3fae8a', '#d9c48a'], selva: ['#3a9a30', '#a0602a'], cueva: ['#6b7487', '#3c404b'],
  volcan: ['#6a3a2a', '#3a1e18'], nube: ['#ffffff', '#c9def5'], hielo: ['#d8f3ff', '#7cc4e8'], datos: ['#39e6ff', '#1e2740'], tormenta: ['#c9cde8', '#5a5e88'],
};
const SKY = {
  yamboro: ['#7ec8ff', '#d8f0ff'], laguna: ['#5ab8e0', '#c8ecf8'], selva: ['#8fd08a', '#e2f5d6'], cueva: ['#10202a', '#2c3440'],
  volcan: ['#2a0a08', '#8a2a0a'], nube: ['#4aa8ff', '#e6f6ff'], hielo: ['#7fb8e8', '#f4fbff'], datos: ['#060a1e', '#2a5ac8'], tormenta: ['#0c0e1e', '#4a4e78'],
};

// ---------- dibujo de cada pieza (sin imágenes: formas simples) ----------
function drawTile(g, c, x, y, s, theme) {
  const r = (col, a, b, w, h) => { g.fillStyle = col; g.fillRect(x + a * s, y + b * s, w * s, h * s); };
  const circ = (col, cx, cy, rad) => { g.fillStyle = col; g.beginPath(); g.arc(x + cx * s, y + cy * s, rad * s, 0, 7); g.fill(); };
  const line = (col, w, pts) => { g.strokeStyle = col; g.lineWidth = Math.max(1, w * s); g.beginPath(); pts.forEach(([a, b], i) => i ? g.lineTo(x + a * s, y + b * s) : g.moveTo(x + a * s, y + b * s)); g.stroke(); };
  switch (c) {
    case '#': { const [top, fill] = GROUND[theme] || GROUND.yamboro; r(fill, 0, 0, 1, 1); r(top, 0, 0, 1, 0.22); break; }
    case 'B': r('#c4572a', 0, 0, 1, 1); r('#3d1a0c', 0, 0.46, 1, 0.07); r('#3d1a0c', 0.48, 0, 0.07, 0.46); r('#3d1a0c', 0.2, 0.5, 0.07, 0.5); r('#e07a45', 0, 0, 1, 0.07); break;
    case '?': r('#f7b500', 0, 0, 1, 1); r('#8a5200', 0.04, 0.04, 0.92, 0.06); g.fillStyle = '#fff6d0'; g.font = `bold ${Math.round(s * 0.72)}px monospace`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', x + s / 2, y + s * 0.55); break;
    case 'M': r('#f7b500', 0, 0, 1, 1); circ('#e8344a', 0.5, 0.55, 0.3); circ('#fff', 0.38, 0.48, 0.07); circ('#fff', 0.62, 0.5, 0.07); r('#f4e6c8', 0.38, 0.62, 0.24, 0.22); break;
    case 'Q': r('#1d4fd8', 0, 0, 1, 1); r('#0a1f6a', 0.04, 0.04, 0.92, 0.06); g.fillStyle = '#7ff0ff'; g.font = `bold ${Math.round(s * 0.36)}px monospace`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('</>', x + s / 2, y + s * 0.55); break;
    case 'S': r('#b0703c', 0, 0, 1, 1); r('#e0a070', 0, 0, 1, 0.1); r('#5a3418', 0, 0.9, 1, 0.1); break;
    case 'K': r('#222', 0.1, 0.35, 0.8, 0.65); circ('#111', 0.5, 0.35, 0.3); circ('#d4a020', 0.5, 0.35, 0.12); break;
    case 'p': r('#2fbf3a', 0.04, 0, 0.92, 1); r('#7be07f', 0.14, 0, 0.12, 1); break;
    case 'o': circ('#c98a00', 0.5, 0.5, 0.34); circ('#ffd23f', 0.5, 0.5, 0.27); r('#c98a00', 0.46, 0.32, 0.08, 0.36); break;
    case '1': circ('#151515', 0.5, 0.58, 0.36); circ('#ff3a3a', 0.38, 0.52, 0.07); circ('#ff3a3a', 0.62, 0.52, 0.07); line('#151515', 0.06, [[0.35, 0.25], [0.3, 0.1]]); line('#151515', 0.06, [[0.65, 0.25], [0.7, 0.1]]); break;
    case '2': circ('#5a1010', 0.5, 0.58, 0.36); circ('#ffd23f', 0.38, 0.52, 0.07); circ('#ffd23f', 0.62, 0.52, 0.07); r('#ffd23f', 0.3, 0.8, 0.4, 0.06); break;
    case '3': r('#e8eef8', 0.22, 0.12, 0.56, 0.76); r('#3a8dff', 0.22, 0.12, 0.56, 0.16); r('#ff3a55', 0.3, 0.42, 0.4, 0.06); r('#ff3a55', 0.3, 0.58, 0.3, 0.06); line('#9ad7ff', 0.05, [[0.05, 0.5], [0.2, 0.4]]); line('#9ad7ff', 0.05, [[0.95, 0.5], [0.8, 0.4]]); break;
    case '^': r('#333a44', 0.08, 0.86, 0.84, 0.14); line('#cfd6e0', 0.07, [[0.3, 0.84], [0.7, 0.72], [0.3, 0.6], [0.7, 0.48]]); r('#39a900', 0.06, 0.36, 0.88, 0.12); break;
    case '=': r('#8a5a2a', 0, 0.3, 3, 0.4); line('#ffd23f', 0.08, [[0.4, 0.5], [2.6, 0.5]]); line('#ffd23f', 0.08, [[0.6, 0.35], [0.4, 0.5], [0.6, 0.65]]); line('#ffd23f', 0.08, [[2.4, 0.35], [2.6, 0.5], [2.4, 0.65]]); break;
    case '|': r('#8a5a2a', 0, 0.3, 3, 0.4); line('#ffd23f', 0.08, [[1.5, -0.6], [1.5, 1.6]]); line('#ffd23f', 0.08, [[1.35, -0.4], [1.5, -0.6], [1.65, -0.4]]); break;
    case '_': r('#b07a3a', 0, 0.3, 2, 0.4); line('#5a3418', 0.05, [[0.5, 0.75], [0.4, 0.95]]); line('#5a3418', 0.05, [[1.5, 0.75], [1.6, 0.95]]); break;
    case 'f': circ('#ff6a1a', 0.5, 0.55, 0.32); circ('#ffd23f', 0.5, 0.6, 0.16); break;
    case '>': case '<': { r('#2b2f3a', 0, 0.15, 1, 0.7); const d = c === '>' ? 1 : -1; for (let k = 0; k < 2; k++) line('#ffd23f', 0.09, [[0.5 - d * 0.18 + k * 0.32 - 0.16, 0.3], [0.5 + d * 0.0 + k * 0.32 - 0.16 + d * 0.16, 0.5], [0.5 - d * 0.18 + k * 0.32 - 0.16, 0.7]]); break; }
    case 'z': circ('#4a4e78', 0.5, 0.35, 0.35); line('#fff36a', 0.1, [[0.55, 0.35], [0.4, 0.65], [0.6, 0.65], [0.45, 0.98]]); break;
    case 'I': r('#ffffff', 0.1, 0.1, 0.8, 0.8); r('#39a900', 0.18, 0.18, 0.64, 0.64); g.fillStyle = '#fff'; g.font = `bold ${Math.round(s * 0.5)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('I', x + s / 2, y + s * 0.53); break;
    case 'C': r('#ddd', 0.45, 0.1, 0.08, 0.9); g.fillStyle = '#3a8dff'; g.beginPath(); g.moveTo(x + 0.53 * s, y + 0.12 * s); g.lineTo(x + 0.95 * s, y + 0.28 * s); g.lineTo(x + 0.53 * s, y + 0.44 * s); g.fill(); break;
    case 'F': r('#eee', 0.45, -2, 0.1, 3); circ('#39a900', 0.5, -2, 0.14); g.fillStyle = '#2ecc40'; g.beginPath(); g.moveTo(x + 0.45 * s, y - 1.7 * s); g.lineTo(x - 0.35 * s, y - 1.4 * s); g.lineTo(x + 0.45 * s, y - 1.1 * s); g.fill(); break;
    case '.': line('#ff5a6a', 0.1, [[0.25, 0.25], [0.75, 0.75]]); line('#ff5a6a', 0.1, [[0.75, 0.25], [0.25, 0.75]]); break;
    case 'pan': line('#fff', 0.08, [[0.5, 0.1], [0.5, 0.9]]); line('#fff', 0.08, [[0.1, 0.5], [0.9, 0.5]]); [[0.5, 0.1, 0.38, 0.22, 0.62, 0.22], [0.5, 0.9, 0.38, 0.78, 0.62, 0.78], [0.1, 0.5, 0.22, 0.38, 0.22, 0.62], [0.9, 0.5, 0.78, 0.38, 0.78, 0.62]].forEach(([a, b, c1, d1, e1, f1]) => line('#fff', 0.08, [[c1, d1], [a, b], [e1, f1]])); break;
  }
}

// ---------- estado ----------
const ed = { lv: null, tool: '#', scroll: 0, cell: 32, undo: [], dirty: false, painting: false, pointers: new Map(), panStart: null, saveT: 0 };
const readStore = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (_) { return {}; } };
const writeStore = st => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (_) {} };
function blankLevel(W = 80) {
  const rows = Array.from({ length: H }, (_, y) => (y < 2 ? '#' : '.').repeat(W).split(''));
  rows[2][2] = 'I'; rows[2][W - 6] = 'F';
  return { id: 'b' + Date.now().toString(36), v: 1, title: '', theme: 'yamboro', W, rows: rows.map(r => r.join('')) };
}
const grid = () => ed.lv.rows;
const at = (x, y) => (x >= 0 && x < ed.lv.W && y >= 0 && y < H) ? ed.lv.rows[y][x] : '.';
function setCell(x, y, c) { if (x < 0 || x >= ed.lv.W || y < 0 || y >= H) return; const r = ed.lv.rows[y]; if (r[x] === c) return; ed.lv.rows[y] = r.slice(0, x) + c + r.slice(x + 1); ed.dirty = true; }
function pushUndo() { ed.undo.push(JSON.stringify(ed.lv.rows)); if (ed.undo.length > 60) ed.undo.shift(); }
function undo() { const s = ed.undo.pop(); if (!s) return; ed.lv.rows = JSON.parse(s); changed(); }
function changed() { ed.dirty = true; draw(); clearTimeout(ed.saveT); ed.saveT = setTimeout(() => { const st = readStore(); st.cur = ed.lv; writeStore(st); }, 600); }

// pone la pieza elegida en (x, y) aplicando las reglas de cada una
function place(x, y, c) {
  if (c in SNAP) y = SNAP[c];
  if (UNIQUE.has(c)) for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < ed.lv.W; xx++) if (at(xx, yy) === c) setCell(xx, yy, '.');
  if (c === 'p') {   // tubo de 2 de ancho desde el suelo hasta donde tocaste
    y = Math.max(2, Math.min(9, y)); x = Math.min(x, ed.lv.W - 2);
    for (const xx of [x, x + 1]) { for (let yy = 2; yy < H; yy++) if (at(xx, yy) === 'p') setCell(xx, yy, '.'); for (let yy = 2; yy <= y; yy++) setCell(xx, yy, 'p'); }
    return;
  }
  if (c === 'f') { setCell(x, 1, '.'); }   // el fuego salta desde un hueco
  setCell(x, y, c);
}

// ---------- dibujo ----------
const cv = $('edCanvas'), g = cv.getContext('2d');
function resize() {
  const wrap = cv.parentElement, w = wrap.clientWidth, h = wrap.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
  ed.cell = Math.max(14, Math.floor(h / H));
  cv.width = w * dpr; cv.height = ed.cell * H * dpr; cv.style.width = w + 'px'; cv.style.height = ed.cell * H + 'px';
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  clampScroll(); draw();
}
const viewCols = () => Math.floor(cv.clientWidth / ed.cell);
function clampScroll() { ed.scroll = Math.max(0, Math.min(ed.scroll, Math.max(0, ed.lv.W - viewCols() + 1))); const sb = $('edScroll'); sb.max = Math.max(0, ed.lv.W - viewCols() + 1); sb.value = ed.scroll; }
function draw() {
  if (!ed.lv) return;
  const s = ed.cell, W = cv.clientWidth, Hh = s * H, th = ed.lv.theme, [sk0, sk1] = SKY[th] || SKY.yamboro;
  const gr = g.createLinearGradient(0, 0, 0, Hh); gr.addColorStop(0, sk0); gr.addColorStop(1, sk1); g.fillStyle = gr; g.fillRect(0, 0, W, Hh);
  const x0 = Math.floor(ed.scroll), cols = viewCols() + 2;
  // fin del nivel
  const endX = (ed.lv.W - ed.scroll) * s; if (endX < W) { g.fillStyle = '#0009'; g.fillRect(endX, 0, W - endX, Hh); }
  g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1;
  for (let i = 0; i <= cols; i++) { const px = (x0 + i - ed.scroll) * s + 0.5; g.beginPath(); g.moveTo(px, 0); g.lineTo(px, Hh); g.stroke(); }
  for (let j = 0; j <= H; j++) { g.beginPath(); g.moveTo(0, j * s + 0.5); g.lineTo(W, j * s + 0.5); g.stroke(); }
  for (let pass = 0; pass < 2; pass++)   // primero bloques, luego cosas encima (banderas, plataformas)
    for (let i = -3; i < cols; i++) {
      const x = x0 + i; if (x < 0 || x >= ed.lv.W) continue;
      for (let y = 0; y < H; y++) {
        const c = at(x, y); if (c === '.') continue;
        const top = pass === 1 && 'F=|_C'.includes(c);
        if ((pass === 0) === top) continue;
        drawTile(g, c, (x - ed.scroll) * s, (H - 1 - y) * s, s, th);
      }
    }
  g.fillStyle = 'rgba(255,255,255,0.75)'; g.font = `bold ${Math.max(9, s * 0.32)}px sans-serif`; g.textAlign = 'left'; g.textBaseline = 'top';
  for (let x = Math.ceil(x0 / 10) * 10; x < x0 + cols; x += 10) g.fillText(String(x), (x - ed.scroll) * s + 3, 3);
  if (ed.hover && ed.tool !== 'pan') { g.strokeStyle = '#ffd23f'; g.lineWidth = 2; g.strokeRect((ed.hover[0] - ed.scroll) * s + 1, (H - 1 - (ed.tool in SNAP ? SNAP[ed.tool] : ed.hover[1])) * s + 1, s - 2, s - 2); }
  $('edWVal').textContent = ed.lv.W;
}

// ---------- entrada (ratón y dedo) ----------
function cellAt(e) { const r = cv.getBoundingClientRect(); return [Math.floor((e.clientX - r.left) / ed.cell + ed.scroll), H - 1 - Math.floor((e.clientY - r.top) / ed.cell)]; }
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId); ed.pointers.set(e.pointerId, e.clientX);
  if (ed.pointers.size > 1 || ed.tool === 'pan' || e.button === 1 || e.button === 2) { ed.panStart = { x: e.clientX, s: ed.scroll }; ed.painting = false; return; }
  const [x, y] = cellAt(e); pushUndo(); place(x, y, ed.tool); ed.painting = PAINT.has(ed.tool); changed();
});
cv.addEventListener('pointermove', e => {
  ed.hover = cellAt(e);
  if (ed.panStart) { ed.scroll = ed.panStart.s - (e.clientX - ed.panStart.x) / ed.cell; clampScroll(); draw(); return; }
  if (ed.painting) { const [x, y] = ed.hover; place(x, y, ed.tool); changed(); } else draw();
});
const endPtr = e => { ed.pointers.delete(e.pointerId); if (!ed.pointers.size) { ed.painting = false; ed.panStart = null; } };
cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr);
cv.addEventListener('pointerleave', () => { ed.hover = null; draw(); });
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('wheel', e => { e.preventDefault(); ed.scroll += (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) / ed.cell; clampScroll(); draw(); }, { passive: false });
$('edScroll').oninput = () => { ed.scroll = +$('edScroll').value; draw(); };
document.addEventListener('keydown', e => {
  if (!$('editorScreen').classList.contains('show') || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
  else if (e.key === 'ArrowRight') { ed.scroll += 3; clampScroll(); draw(); } else if (e.key === 'ArrowLeft') { ed.scroll -= 3; clampScroll(); draw(); }
});

// ---------- barra de herramientas ----------
function buildTools() {
  const box = $('edTools'); let group = '';
  box.replaceChildren();
  TOOLS.forEach(t => {
    if (t.group !== group) { group = t.group; box.append(el('div', { class: 'ed-group' }, group)); }
    const c = el('canvas', { width: 40, height: 40 }), cg = c.getContext('2d');
    const big = '=|'.includes(t.c) ? 3 : t.c === '_' ? 2 : 1, s = 36 / big;
    if (t.c === 'F') { cg.save(); cg.scale(0.5, 0.5); drawTile(cg, 'F', 36, 64, 34, ed.lv ? ed.lv.theme : 'yamboro'); cg.restore(); }
    else drawTile(cg, t.c, 2, 2 + (36 - s) / 2, s, ed.lv ? ed.lv.theme : 'yamboro');
    box.append(el('button', { type: 'button', class: 'ed-tool' + (t.c === ed.tool ? ' on' : ''), title: t.name, 'aria-label': t.name, onclick: () => { ed.tool = t.c; buildTools(); hint(); } }, c));
  });
}
function hint() { const t = TOOLS.find(x => x.c === ed.tool); $('edHint').textContent = t ? t.name + (ed.tool === 'pan' ? ': arrastra para moverte' : ed.tool === 'p' ? ': toca a qué altura llega' : PAINT.has(ed.tool) ? ': toca o arrastra para pintar' : ': toca para ponerlo') : ''; }

// ---------- tamaño, tema, nombre ----------
function setWidth(W) {
  W = Math.max(MINW, Math.min(MAXW, W)); if (W === ed.lv.W) return; pushUndo();
  ed.lv.rows = ed.lv.rows.map((r, y) => W > r.length ? r + (y < 2 ? '#' : '.').repeat(W - r.length) : r.slice(0, W));
  ed.lv.W = W; clampScroll(); changed();
}
$('edWMinus').onclick = () => setWidth(ed.lv.W - 10);
$('edWPlus').onclick = () => setWidth(ed.lv.W + 10);
$('edTitle').oninput = () => { ed.lv.title = $('edTitle').value.slice(0, 30); changed(); };
$('edTheme').onchange = () => { ed.lv.theme = $('edTheme').value; buildTools(); changed(); };
$('edUndo').onclick = undo;
function loadLevel(lv) {
  ed.lv = JSON.parse(JSON.stringify(lv)); ed.undo = []; ed.scroll = 0;
  $('edTitle').value = ed.lv.title || ''; $('edTheme').value = ed.lv.theme;
  buildTools(); hint(); resize();
}
$('edNew').onclick = () => { if (!confirm('¿Empezar un nivel nuevo? (el actual queda en tus borradores si lo guardaste)')) return; loadLevel(blankLevel()); changed(); };

const msg = (t, good) => { const m = $('edMsg'); m.textContent = t || ''; m.className = 'msg' + (good ? ' good' : ''); clearTimeout(msg.t); if (t) msg.t = setTimeout(() => { m.textContent = ''; }, 4000); };
function saveDraft() {
  const st = readStore(); st.drafts = st.drafts || [];
  const d = Object.assign({}, ed.lv, { title: ed.lv.title || 'Sin nombre', updated: Date.now() });
  const i = st.drafts.findIndex(x => x.id === d.id); if (i >= 0) st.drafts[i] = d; else st.drafts.unshift(d);
  st.drafts = st.drafts.slice(0, 30); st.cur = ed.lv; writeStore(st); msg('Guardado en este dispositivo', true);
}
$('edSave').onclick = saveDraft;

// ---------- probar ----------
function hasFlag(lv) { return lv.rows.some(r => r.includes('F')); }
$('edTest').onclick = () => {
  if (!hasFlag(ed.lv)) return msg('Pon la bandera de meta (herramienta Bandera) para poder terminar el nivel');
  const st = readStore(); st.cur = ed.lv; writeStore(st);
  closeEditor(); SENA_CUSTOM.play(ed.lv, { onExit: r => { openEditor(); if (r.won) msg('¡Lo superaste! Ya lo puedes publicar.', true); else if (r.lost) msg('Perdiste las 3 vidas. ¡Ajusta el nivel e inténtalo otra vez!'); } });
};

// ---------- publicar ----------
$('edPublish').onclick = async () => {
  if (!window.SenaOnline || !SenaOnline.user) return msg('Inicia sesión para publicar tu nivel');
  const title = (ed.lv.title || '').trim();
  if (title.length < 3) { $('edTitle').focus(); return msg('Ponle un nombre de al menos 3 letras'); }
  if (!hasFlag(ed.lv)) return msg('Pon la bandera de meta antes de publicar');
  if (!confirm(`¿Publicar "${title}" para que todos lo puedan jugar?`)) return;
  $('edPublish').disabled = true;
  const r = await SenaOnline.publishLevel(title, ed.lv.theme, { v: 1, W: ed.lv.W, rows: ed.lv.rows });
  $('edPublish').disabled = false;
  if (r.error) return msg(r.error);
  saveDraft(); openPanel('mine'); msg('¡Publicado! Código ' + r.code + ' (compártelo con tus amigos)', true);
};

// ---------- panel: borradores y comunidad ----------
const panel = { tab: 'top', q: '', seq: 0 };
const THEME_NAME = k => (window.SENA_CUSTOM && SENA_CUSTOM.themes[k] || {}).name || k;
function openPanel(tab) { if (tab) panel.tab = tab; $('edPanel').hidden = false; renderPanel(); }
$('edCommunity').onclick = () => openPanel();
$('edPanelClose').onclick = () => { $('edPanel').hidden = true; };
$('edPanelTabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { panel.tab = b.dataset.t; renderPanel(); } });
$('edSearch').addEventListener('keydown', e => { if (e.key === 'Enter') { panel.q = $('edSearch').value.trim(); if (panel.tab === 'drafts') panel.tab = 'top'; renderPanel(); } });
$('edSearchGo').onclick = () => { panel.q = $('edSearch').value.trim(); if (panel.tab === 'drafts') panel.tab = 'top'; renderPanel(); };
const heart = on => `<svg viewBox="0 0 24 24" width="18" height="18" fill="${on ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>`;
async function renderPanel() {
  document.querySelectorAll('#edPanelTabs button').forEach(b => b.classList.toggle('on', b.dataset.t === panel.tab));
  const box = $('edList'), seq = ++panel.seq;
  if (panel.tab === 'drafts') {
    const d = readStore().drafts || [];
    if (!d.length) return box.replaceChildren(el('div', { class: 'ed-empty' }, 'Aún no tienes borradores. Usa "Guardar" mientras editas.'));
    return box.replaceChildren(...d.map(x => el('div', { class: 'ed-row' },
      el('div', { class: 'ed-info' }, el('b', {}, x.title || 'Sin nombre'), el('small', {}, THEME_NAME(x.theme) + ' · ' + x.W + ' de largo · ' + new Date(x.updated).toLocaleDateString('es'))),
      el('button', { type: 'button', class: 'mini ok', onclick: () => { loadLevel(x); $('edPanel').hidden = true; msg('Borrador abierto', true); } }, 'Editar'),
      el('button', { type: 'button', class: 'mini danger', onclick: () => { if (!confirm('¿Borrar este borrador?')) return; const st = readStore(); st.drafts = (st.drafts || []).filter(y => y.id !== x.id); writeStore(st); renderPanel(); } }, 'Borrar'))));
  }
  if (!window.SenaOnline || !SenaOnline.user) return box.replaceChildren(el('div', { class: 'ed-empty' }, el('b', {}, 'Inicia sesión para ver y jugar los niveles de la comunidad.'),
    el('button', { type: 'button', class: 'mini ok big', onclick: () => { closeEditor(); SenaOnline.openAuth(); } }, 'Iniciar sesión')));
  box.replaceChildren(el('div', { class: 'ed-empty' }, 'Cargando...'));
  const r = await SenaOnline.listLevels(panel.tab, panel.q);
  if (seq !== panel.seq) return;
  if (r.error) return box.replaceChildren(el('div', { class: 'ed-empty' }, r.error));
  if (!r.rows.length) return box.replaceChildren(el('div', { class: 'ed-empty' }, panel.q ? 'No hay niveles con "' + panel.q + '".' : panel.tab === 'mine' ? 'Todavía no has publicado niveles.' : 'Aún no hay niveles. ¡Crea el primero!'));
  box.replaceChildren(...r.rows.map(x => {
    const img = el('img', { alt: '' }); img.src = (window.PORTRAITS && PORTRAITS[x.author_char]) || '';
    const like = el('button', { type: 'button', class: 'mini like' + (x.liked ? ' on' : ''), title: 'Me gusta', html: heart(x.liked) + ' ' + x.likes,
      onclick: async () => { const n = await SenaOnline.likeLevel(x.code, !x.liked); if (n != null) { x.liked = !x.liked; x.likes = n; like.className = 'mini like' + (x.liked ? ' on' : ''); like.innerHTML = heart(x.liked) + ' ' + n; } } });
    return el('div', { class: 'ed-row' },
      el('span', { class: 'ed-face' }, img),
      el('div', { class: 'ed-info' }, el('b', {}, x.title), el('small', {}, 'de ' + x.author + ' · ' + THEME_NAME(x.theme) + ' · ' + x.plays + ' partidas · ' + x.clears + ' lo superaron'), el('code', {}, x.code)),
      like,
      el('button', { type: 'button', class: 'mini ok', onclick: () => playCommunity(x.code) }, 'Jugar'),
      x.mine ? el('button', { type: 'button', class: 'mini danger', onclick: async () => { if (!confirm('¿Borrar "' + x.title + '" de la comunidad?')) return; const e = await SenaOnline.deleteLevel(x.code); if (e) msg(e); renderPanel(); } }, 'Borrar') : null);
  }));
}
async function playCommunity(code) {
  const r = await SenaOnline.getLevel(code);
  if (r.error || !r.level) return msg(r.error || 'Ese nivel ya no existe');
  const L = r.level, lv = Object.assign({ title: L.title, theme: L.theme }, L.data);
  closeEditor();
  SENA_CUSTOM.play(lv, { code, onExit: res => {
    openEditor(); openPanel();
    if (res.won) { SenaOnline.clearLevel(code); msg('¡Superaste "' + L.title + '" de ' + L.author + '! Si te gustó, dale corazón.', true); }
  } });
}
window.SenaEditor = { playCode: playCommunity };

// ---------- abrir / cerrar ----------
function openEditor() {
  $('editorScreen').classList.add('show'); document.body.classList.add('acct-open', 'editing');
  if (!ed.lv) { const st = readStore(); loadLevel(st.cur && st.cur.rows ? st.cur : blankLevel()); }
  requestAnimationFrame(resize);
}
function closeEditor() { $('editorScreen').classList.remove('show'); document.body.classList.remove('acct-open', 'editing'); $('edPanel').hidden = true; }
$('edBack').onclick = () => { const st = readStore(); st.cur = ed.lv; writeStore(st); closeEditor(); };
$('editorBtn').onclick = openEditor;
addEventListener('resize', () => { if ($('editorScreen').classList.contains('show')) resize(); });
const themeSel = $('edTheme');
Object.entries(window.SENA_CUSTOM ? SENA_CUSTOM.themes : {}).forEach(([k, v]) => themeSel.append(el('option', { value: k }, v.name)));
// enlace directo: index.html#nivel=NV-XXXXX abre ese nivel de la comunidad
const m = /nivel=(NV-[A-Z2-9]{5})/i.exec(location.hash);
if (m) { const tryOpen = (n = 0) => { if (window.SenaOnline && SenaOnline.user && document.getElementById('loading').classList.contains('done')) playCommunity(m[1].toUpperCase()); else if (n < 60) setTimeout(() => tryOpen(n + 1), 1000); }; tryOpen(); }
})();
