(() => {
'use strict';
window.addEventListener('error', ev => console.error('JS_ERROR', ev.message, ev.filename + ':' + ev.lineno));
const T = THREE;

// ================= Config =================
let W = 160; const H = 14;             // tamaño del nivel en bloques (W cambia por nivel)
const GRAV = 42, MAXFALL = 24;
const WALK = 5.0, RUN = 8.6, JUMP = 19.5;   // salto ~4.5 bloques (más corriendo)
// tamaño del personaje: empieza pequeño, el hongo lo agranda
const SIZE = { small: { scale: 1.0, h: 0.95, hc: 0.62, hw: 0.28 }, big: { scale: 1.5, h: 1.42, hc: 0.9, hw: 0.38 } };
let FLAGX = 150;
const TIME_LIMIT = 300;
const WATER_TOP = 12.3;                     // superficie del agua en niveles acuáticos

// ================= Audio (beeps retro) =================
let actx = null, muted = false;
function beep(f = 440, d = 0.1, type = 'square', vol = 0.05, slide = 0) {
  if (!actx || muted) return;
  const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g).connect(actx.destination); o.start(t); o.stop(t + d);
}
const SFX = {
  jump: () => beep(380, 0.2, 'square', 0.035, 600),
  coin: () => { beep(988, 0.07, 'square', 0.035); setTimeout(() => beep(1319, 0.25, 'square', 0.035), 70); },
  stomp: () => beep(220, 0.12, 'triangle', 0.09, -150),
  bump: () => beep(140, 0.08, 'square', 0.05),
  brk: () => beep(110, 0.22, 'sawtooth', 0.05, -70),
  die: () => { [494, 466, 440, 392, 330, 262].forEach((f, i) => setTimeout(() => beep(f, 0.16, 'square', 0.045), i * 140)); },
  win: () => { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.16, 'square', 0.045), i * 130)); },
  pound: () => beep(80, 0.3, 'sawtooth', 0.08, -40),
  punch: () => beep(260, 0.07, 'triangle', 0.07, -160),
  boom: () => beep(70, 0.35, 'sawtooth', 0.09, -30),
  spring: () => beep(300, 0.25, 'square', 0.05, 900),
  fire: () => beep(160, 0.18, 'sawtooth', 0.03, 220),
  firework: () => { beep(900 + Math.random() * 600, 0.12, 'triangle', 0.03, -500); setTimeout(() => beep(120, 0.25, 'sawtooth', 0.04, -60), 140); },
  fanfare: () => { const tt = [0, 120, 240, 360, 600, 840, 960, 1080, 1320]; [523, 523, 523, 698, 880, 784, 698, 880, 1047].forEach((f, i) => setTimeout(() => beep(f, i === 8 ? 0.6 : 0.14, 'square', 0.045), tt[i])); },
  bosshit: () => { beep(140, 0.3, 'square', 0.08, -90); setTimeout(() => beep(90, 0.3, 'sawtooth', 0.06, -50), 120); },
  swim: () => beep(520, 0.09, 'sine', 0.05, 260),
  sprout: () => beep(200, 0.5, 'square', 0.04, 500),
  powerup: () => { [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => setTimeout(() => beep(f, 0.09, 'square', 0.04), i * 60)); },
  shrink: () => { [784, 659, 523, 392].forEach((f, i) => setTimeout(() => beep(f, 0.1, 'square', 0.045), i * 80)); },
  oneup: () => { [659, 784, 1319, 1047, 1175, 1568].forEach((f, i) => setTimeout(() => beep(f, 0.1, 'square', 0.04), i * 90)); },
};

// ================= Render =================
const renderer = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: /test=/.test(location.hash) });
const MOBILE = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
renderer.setPixelRatio(Math.min(devicePixelRatio, MOBILE ? 1.25 : 2));
renderer.outputEncoding = T.sRGBEncoding;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);
const scene = new T.Scene();
scene.fog = new T.Fog(0x9ccbf0, 30, 70);
const camera = new T.PerspectiveCamera(40, 1, 0.1, 200);
function resize() { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

const hemi = new T.HemisphereLight(0xdfefff, 0x6b8f3a, 0.75);
scene.add(hemi);
const sun = new T.DirectionalLight(0xfff4e0, 1.6);
sun.castShadow = true; sun.shadow.mapSize.set(MOBILE ? 1024 : 2048, MOBILE ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 12, bottom: -6, near: 1, far: 50 });
sun.shadow.bias = -0.0006;
scene.add(sun, sun.target);

// ================= Texturas pixeladas =================
function canvasTex(draw, size = 64) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new T.CanvasTexture(c); t.magFilter = T.NearestFilter; t.encoding = T.sRGBEncoding; t.anisotropy = 4;
  return t;
}
function dots(g, s, col, y0 = 0) { g.fillStyle = col; for (let i = 0; i < 16; i++) g.fillRect((i * 37 + 7) % (s - 6), y0 + ((i * 23 + 11) % (s - y0 - 6)), 6, 6); }
const TEX = {
  grass: canvasTex((g, s) => { g.fillStyle = '#c8743a'; g.fillRect(0, 0, s, s); dots(g, s, '#8f4c1c', 18); g.fillStyle = '#58c048'; g.fillRect(0, 0, s, 16); g.fillStyle = '#2f8f2a'; for (let x = 0; x < s; x += 8) g.fillRect(x, 13, 4, 7); }),
  dirt: canvasTex((g, s) => { g.fillStyle = '#c8743a'; g.fillRect(0, 0, s, s); dots(g, s, '#8f4c1c'); }),
  brick: canvasTex((g, s) => {
    g.fillStyle = '#c4572a'; g.fillRect(0, 0, s, s); g.fillStyle = '#e07a45'; g.fillRect(0, 0, s, 3);
    g.fillStyle = '#3d1a0c';
    for (let r = 0; r < 4; r++) { g.fillRect(0, r * 16 + 14, s, 2); for (let x = (r % 2 ? 16 : 0); x < s; x += 32) g.fillRect(x, r * 16, 2, 16); }
  }),
  question: canvasTex((g, s) => {
    g.fillStyle = '#f7b500'; g.fillRect(0, 0, s, s); g.strokeStyle = '#8a5200'; g.lineWidth = 4; g.strokeRect(2, 2, s - 4, s - 4);
    g.fillStyle = '#8a5200'; [[8, 8], [52, 8], [8, 52], [52, 52]].forEach(([x, y]) => g.fillRect(x, y, 4, 4));
    g.font = 'bold 42px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#8a5200'; g.fillText('?', 35, 36); g.fillStyle = '#fff6d0'; g.fillText('?', 32, 33);
  }),
  used: canvasTex((g, s) => { g.fillStyle = '#9b6a3c'; g.fillRect(0, 0, s, s); g.strokeStyle = '#4e3218'; g.lineWidth = 4; g.strokeRect(2, 2, s - 4, s - 4); g.fillStyle = '#4e3218'; [[8, 8], [52, 8], [8, 52], [52, 52]].forEach(([x, y]) => g.fillRect(x, y, 4, 4)); }),
  stone: canvasTex((g, s) => { g.fillStyle = '#b0703c'; g.fillRect(0, 0, s, s); g.fillStyle = '#e0a070'; g.fillRect(0, 0, s, 6); g.fillRect(0, 0, 6, s); g.fillStyle = '#5a3418'; g.fillRect(0, s - 6, s, 6); g.fillRect(s - 6, 0, 6, s); }),
};
// cueva: roca oscura y ladrillo azul (como el subterráneo de Mario)
TEX.caveTop = canvasTex((g, s) => { g.fillStyle = '#4a4f5c'; g.fillRect(0, 0, s, s); dots(g, s, '#2c303a', 14); g.fillStyle = '#6b7487'; g.fillRect(0, 0, s, 10); g.fillStyle = '#3fa8a0'; for (let x = 0; x < s; x += 12) g.fillRect(x, 8, 5, 4); });
TEX.caveRock = canvasTex((g, s) => { g.fillStyle = '#3c404b'; g.fillRect(0, 0, s, s); dots(g, s, '#272a32'); g.fillStyle = '#555b69'; for (let i = 0; i < 6; i++) g.fillRect((i * 23) % 56, (i * 37) % 56, 10, 4); });
TEX.caveBrick = canvasTex((g, s) => {
  g.fillStyle = '#2b5fa8'; g.fillRect(0, 0, s, s); g.fillStyle = '#4f86d0'; g.fillRect(0, 0, s, 3);
  g.fillStyle = '#0e2140';
  for (let r = 0; r < 4; r++) { g.fillRect(0, r * 16 + 14, s, 2); for (let x = (r % 2 ? 16 : 0); x < s; x += 32) g.fillRect(x, r * 16, 2, 16); }
});
TEX.waterTop = canvasTex((g, s) => { g.fillStyle = '#d9c48a'; g.fillRect(0, 0, s, s); dots(g, s, '#b8a06a', 12); g.fillStyle = '#3fae8a'; for (let x = 0; x < s; x += 10) g.fillRect(x, 0, 6, 8 + (x % 3) * 3); });
TEX.waterSand = canvasTex((g, s) => { g.fillStyle = '#c9b27a'; g.fillRect(0, 0, s, s); dots(g, s, '#a8915c'); });
TEX.volcTop = canvasTex((g, s) => { g.fillStyle = '#2b2226'; g.fillRect(0, 0, s, s); dots(g, s, '#1a1416', 12); g.fillStyle = '#4a3a3e'; g.fillRect(0, 0, s, 9); g.fillStyle = '#ff6a1a'; for (let x = 3; x < s; x += 17) g.fillRect(x, 9 + (x % 5) * 3, 3, 10 + (x % 4) * 4); });
TEX.volcRock = canvasTex((g, s) => { g.fillStyle = '#241c1f'; g.fillRect(0, 0, s, s); dots(g, s, '#151012'); g.fillStyle = '#c4400f'; for (let i = 0; i < 5; i++) g.fillRect((i * 29 + 5) % 58, (i * 17 + 9) % 58, 2, 9); });
TEX.deck = canvasTex((g, s) => { g.fillStyle = '#a8703a'; g.fillRect(0, 0, s, s); g.fillStyle = '#7a4c22'; for (let x = 0; x < s; x += 16) g.fillRect(x, 0, 2, s); g.fillStyle = '#c48a4c'; g.fillRect(0, 0, s, 6); g.fillStyle = '#3a2410'; [6, 22, 38, 54].forEach(x => g.fillRect(x, 14, 3, 3)); });
TEX.hull = canvasTex((g, s) => { g.fillStyle = '#5a3418'; g.fillRect(0, 0, s, s); g.fillStyle = '#3e220e'; for (let y = 0; y < s; y += 12) g.fillRect(0, y, s, 2); g.fillStyle = '#2a1608'; [10, 42].forEach(x => g.fillRect(x, 4, 4, 4)); });
TEX.castle = canvasTex((g, s) => { g.fillStyle = '#6d6a74'; g.fillRect(0, 0, s, s); g.fillStyle = '#4a4752'; for (let r = 0; r < 4; r++) { g.fillRect(0, r * 16 + 14, s, 2); for (let x = (r % 2 ? 16 : 0); x < s; x += 32) g.fillRect(x, r * 16, 2, 16); } g.fillStyle = '#8b8893'; g.fillRect(0, 0, s, 3); });
TEX.castleTop = canvasTex((g, s) => { g.fillStyle = '#5c5963'; g.fillRect(0, 0, s, s); dots(g, s, '#45424b', 12); g.fillStyle = '#8b8893'; g.fillRect(0, 0, s, 10); g.fillStyle = '#3a3740'; g.fillRect(0, 10, s, 2); });
TEX.redBrick = canvasTex((g, s) => { g.fillStyle = '#8a2a1a'; g.fillRect(0, 0, s, s); g.fillStyle = '#b8462a'; g.fillRect(0, 0, s, 3); g.fillStyle = '#2a0a04'; for (let r = 0; r < 4; r++) { g.fillRect(0, r * 16 + 14, s, 2); for (let x = (r % 2 ? 16 : 0); x < s; x += 32) g.fillRect(x, r * 16, 2, 16); } });
TEX.lava = canvasTex((g, s) => {
  g.fillStyle = '#ff5a0a'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 14; i++) { g.fillStyle = i % 2 ? '#ffb020' : '#ff8a10'; g.beginPath(); g.arc((i * 37) % s, (i * 23) % s, 5 + (i % 4) * 3, 0, 7); g.fill(); }
  g.fillStyle = '#c42a00'; for (let i = 0; i < 8; i++) g.fillRect((i * 41 + 7) % s, (i * 19 + 3) % s, 8, 3);
});
TEX.lava.wrapS = TEX.lava.wrapT = T.RepeatWrapping; TEX.lava.magFilter = T.LinearFilter;
const MAT = {};
for (const k in TEX) MAT[k] = new T.MeshStandardMaterial({ map: TEX[k], roughness: 0.85 });
MAT.lava = new T.MeshStandardMaterial({ map: TEX.lava, emissive: 0xffffff, emissiveMap: TEX.lava, emissiveIntensity: 0.9, roughness: 0.5 });
// materiales del nivel actual (cambian con el tipo de nivel)
const LM = { top: MAT.grass, fill: MAT.dirt, brick: MAT.brick, ceil: MAT.caveRock };
const GEO = { box: new T.BoxGeometry(1, 1, 1), ground: new T.BoxGeometry(1, 1, 4) };

// ================= Niveles =================
// Cada nivel es un objeto de datos. El 1-1 es el original; del 1-2 al 1-6 los arma un generador de secciones
// probadas (todas superables con el salto del personaje: abismos ≤ 3, plataformas a 3 de altura).
const THEMES = {
  day:    { sun: 0xfff4e0, sunI: 1.6, hemi: 0xdfefff, hemiI: 0.75, bg: 0xffffff, fog: 0x9ccbf0 },
  morning:{ sun: 0xfff2d6, sunI: 1.5, hemi: 0xe9f6ff, hemiI: 0.85, bg: 0xf4fbff, fog: 0xb9dcf5 },
  green:  { sun: 0xf4ffd8, sunI: 1.4, hemi: 0xd4f5c0, hemiI: 0.8, bg: 0xe2f5d6, fog: 0x9fd09a },
  sunset: { sun: 0xffb070, sunI: 1.45, hemi: 0xffd6b0, hemiI: 0.6, bg: 0xffc896, fog: 0xe6a47a },
  dusk:   { sun: 0xc8a8ff, sunI: 1.05, hemi: 0x8a7ab8, hemiI: 0.6, bg: 0x9086cc, fog: 0x5a4a8a },
  // temas con fondo propio (la imagen ya trae su luz, por eso bg blanco)
  water:  { sun: 0xd8f4ff, sunI: 1.15, hemi: 0x9fe0ff, hemiI: 0.9, bg: 0xffffff, fog: 0x4fb8d8 },
  jungle: { sun: 0xf6ffd8, sunI: 1.45, hemi: 0xd8f5c0, hemiI: 0.8, bg: 0xffffff, fog: 0x8fc98a },
  cave:   { sun: 0x9fc8ff, sunI: 0.35, hemi: 0x6a7fa8, hemiI: 0.45, bg: 0xffffff, fog: 0x10202a },
  evening:{ sun: 0xffb070, sunI: 1.5, hemi: 0xffd6b0, hemiI: 0.65, bg: 0xffffff, fog: 0xe6a47a },
  lava:   { sun: 0xffa060, sunI: 1.25, hemi: 0xff9a70, hemiI: 0.55, bg: 0xffffff, fog: 0x4a160c },
  sea:    { sun: 0xffd0a0, sunI: 1.5, hemi: 0xc8e0ff, hemiI: 0.8, bg: 0xffffff, fog: 0x8aa8d0 },
  lavacave:{ sun: 0xff8a50, sunI: 0.45, hemi: 0x9a5a4a, hemiI: 0.5, bg: 0xffa080, fog: 0x2a0a06 },
  fortress:{ sun: 0xff8a50, sunI: 0.55, hemi: 0x8a4a4a, hemiI: 0.55, bg: 0xffffff, fog: 0x1a0504 },
  lavamap:{ sun: 0xffc090, sunI: 1.35, hemi: 0xffb090, hemiI: 0.6, bg: 0xffffff, fog: 0x3a1a14 },
  mountain:{ sun: 0xfff4e0, sunI: 1.6, hemi: 0xdfefff, hemiI: 0.8, bg: 0xffffff, fog: 0xb5d6f0 },
};
function lvl1() {
  const solid = [];
  for (let i = 0; i < 4; i++) for (let h = 0; h <= i; h++) solid.push([131 + i, 2 + h]);
  for (let i = 0; i < 4; i++) for (let h = 0; h <= 3 - i; h++) solid.push([137 + i, 2 + h]);
  for (let i = 0; i < 6; i++) for (let h = 0; h <= i; h++) solid.push([142 + i, 2 + h]);
  for (let h = 0; h <= 5; h++) solid.push([148, 2 + h]);
  return { name: 'Yamboró', W: 160, flagX: 150, time: 300, checkpoint: 80, theme: 'day',
    gaps: [[44, 46], [86, 88], [111, 114]],
    blocks: [
      [16, 5, '?'], [20, 5, 'B'], [21, 5, 'M'], [22, 5, 'B'], [23, 5, '?'], [24, 5, 'B'], [22, 9, '?'],
      [64, 5, 'B'], [65, 5, '?'], [66, 5, 'B'],
      [68, 9, 'B'], [69, 9, 'B'], [70, 9, 'B'], [71, 9, 'B'], [72, 9, 'B'], [73, 9, 'B'], [74, 9, 'B'], [75, 9, 'B'],
      [79, 9, 'B'], [80, 9, 'B'], [81, 9, 'B'], [82, 9, 'M'], [82, 5, 'B'],
      [92, 5, 'B'], [93, 5, 'B'], [98, 5, '?'], [101, 5, '?'], [101, 9, 'M'], [104, 5, '?'],
      [109, 5, 'B'], [118, 9, 'B'], [119, 9, 'B'], [120, 9, 'B'],
      [125, 9, 'B'], [126, 9, '?'], [127, 9, '?'], [128, 9, 'B'], [126, 5, 'B'], [127, 5, 'B'],
    ],
    solid, pipes: [[29, 2], [39, 3], [48, 4], [58, 4], [116, 2]],
    coins: [[31, 35, 7], [52, 55, 8], [60, 63, 9], [95, 99, 8], [112, 114, 6], [70, 74, 11]],
    enemies: ENEMY_SPAWNS };
}
function genLevel(seed, diff, name, theme, opts = {}) {
  let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1)), pick = a => a[Math.floor(rnd() * a.length)];
  const L = { name, theme, bg: opts.bg, water: !!opts.water, cave: !!opts.cave, lava: !!opts.lava, ship: !!opts.ship, style: opts.style || (opts.cave ? 'cave' : opts.water ? 'water' : 'grass'),
    noStal: !!opts.noStal, gaps: [], blocks: [], solid: [], pipes: [], coins: [], enemies: [], plats: [], springs: [], fires: [], cannons: [] };
  const W404 = 'robot-404', CHG = 'robot-entrega-tardia', FLY = 'archivo-corrupto';
  const enemyChance = 0.35 + diff * 0.5;
  let x = 14, mushrooms = 0;
  const nSeg = 10 + Math.round(diff * 6);
  const kinds = opts.kinds ? opts.kinds : opts.water ? ['floating', 'coinsRun', 'blocks', 'highroad', 'gap', 'swimRun', 'swimRun']
    : opts.cliffs ? ['gap', 'gap', 'floating', 'stairs', 'blocks', 'highroad', 'enemyRun', 'pipes']
    : ['blocks', 'gap', 'pipes', 'stairs', 'floating', 'coinsRun', 'highroad', 'enemyRun'];
  for (let i = 0; i < nSeg; i++) {
    const k = i === 0 ? 'blocks' : (i === Math.floor(nSeg / 2) ? 'blocks' : opts.kinds ? kinds[(i - 1) % kinds.length] : pick(kinds));
    if (k === 'blocks') {
      const pats = ['B?B?B', '?B?', 'BB?BB', 'B?BB?B', '??'];
      let p = pick(pats);
      if (mushrooms < 2 && (i === 0 || i === Math.floor(nSeg / 2))) { p = 'B?MB?'.slice(0, Math.max(3, p.length)); mushrooms++; }
      [...p].forEach((c, j) => L.blocks.push([x + 2 + j, 5, c]));
      if (rnd() < 0.5) L.blocks.push([x + 2 + Math.floor(p.length / 2), 9, '?']);
      if (rnd() < enemyChance) L.enemies.push([x + 3 + p.length, 2, W404]);
      x += p.length + 6;
    } else if (k === 'gap') {
      const w = Math.min(3, ri(2, 2 + Math.round(diff * 1.5)));
      L.gaps.push([x + 2, x + 1 + w]); L.coins.push([x + 2, x + 1 + w, 7]);
      if (diff > 0.25 && rnd() < 0.55) L.enemies.push([x + 2 + w / 2, 6, FLY]);
      x += w + 5;
    } else if (k === 'pipes') {
      const n = ri(1, 2);
      for (let j = 0; j < n; j++) L.pipes.push([x + 2 + j * 6, ri(2, diff > 0.45 ? 4 : 3)]);
      if (n === 2 && rnd() < enemyChance) L.enemies.push([x + 5, 2, rnd() < diff ? CHG : W404]);
      x += n * 6 + 3;
    } else if (k === 'stairs') {
      const hole = diff > 0.4 && rnd() < 0.7;
      for (let j = 0; j < 4; j++) for (let h = 0; h <= j; h++) L.solid.push([x + 1 + j, 2 + h]);
      const d0 = x + 5 + (hole ? 2 : 0);
      if (hole) L.gaps.push([x + 5, x + 6]);
      for (let j = 0; j < 4; j++) for (let h = 0; h <= 3 - j; h++) L.solid.push([d0 + j, 2 + h]);
      x = d0 + 7;
    } else if (k === 'floating') {
      const g = ri(6, 8), p0 = x + 2 + Math.floor(g / 2) - 2;
      L.gaps.push([x + 2, x + 1 + g]);
      for (let j = 0; j < 4; j++) L.blocks.push([p0 + j, 4, j === 1 ? '?' : 'S']);
      L.coins.push([p0, p0 + 3, 7]);
      if (diff > 0.35 && rnd() < 0.5) L.enemies.push([p0 + 2, 8, FLY]);
      x += g + 5;
    } else if (k === 'coinsRun') {
      L.coins.push([x + 2, x + 6, ri(4, 5)]);
      const n = ri(0, 1 + Math.round(diff * 2));
      for (let j = 0; j < n; j++) L.enemies.push([x + 4 + j * 2, 2, W404]);
      x += 10;
    } else if (k === 'highroad') {
      for (let j = 0; j < 6; j++) L.blocks.push([x + 2 + j, 6, j === 3 ? '?' : 'B']);
      L.coins.push([x + 3, x + 6, 8]);
      if (rnd() < enemyChance) L.enemies.push([x + 5, 7, W404]);
      x += 11;
    } else if (k === 'movers') {      // abismo ancho con plataforma que va y viene
      const g = ri(7, 9);
      L.gaps.push([x + 2, x + 1 + g]);
      L.plats.push({ x: x + 2, y: 2, w: 3, type: 'h', range: g - 3, speed: 1.7 });
      L.coins.push([x + 3, x + g, 5]);
      if (diff > 0.4 && rnd() < 0.5) L.enemies.push([x + 2 + g / 2, 7, FLY]);
      x += g + 5;
    } else if (k === 'vmovers') {     // ascensor vertical hasta una cornisa alta
      const g = ri(5, 6), px = x + 2 + Math.floor((g - 3) / 2);
      L.gaps.push([x + 2, x + 1 + g]);
      L.plats.push({ x: px, y: 1, w: 3, type: 'v', range: 5, speed: 1.6 });
      for (let j = 0; j < 3; j++) for (let h = 0; h < 4; h++) L.solid.push([x + 2 + g + j, 2 + h]);
      L.coins.push([x + 2 + g, x + 4 + g, 7]);
      x += g + 8;
    } else if (k === 'fallers') {     // plataformas que se caen al pisarlas
      const g = ri(7, 9), n = Math.floor(g / 3);
      L.gaps.push([x + 2, x + 1 + g]);
      for (let j = 0; j < n; j++) L.plats.push({ x: x + 2.5 + j * 3, y: 2 + (j % 2), w: 2, type: 'f' });
      L.coins.push([x + 3, x + 1 + g, 6]);
      x += g + 5;
    } else if (k === 'springs') {     // trampolín para saltar un muro alto
      const wallH = L.cave ? 5 : 6;
      L.springs.push(x + 3.5);
      for (let j = 0; j < 2; j++) for (let h = 0; h < wallH; h++) L.solid.push([x + 6 + j, 2 + h]);
      L.coins.push([x + 4, x + 8, L.cave ? 9 : 10]);
      if (rnd() < enemyChance) L.enemies.push([x + 10, 2, W404]);
      x += 13;
    } else if (k === 'lavaPit') {     // pozo de lava con bola de fuego saltando
      const w = ri(2, 3);
      L.gaps.push([x + 2, x + 1 + w]); L.fires.push(x + 2 + w / 2);
      L.coins.push([x + 2, x + 1 + w, 7]);
      x += w + 5;
    } else if (k === 'lavaLake') {    // lago de lava con pilares de piedra
      const g = ri(10, 12);
      L.gaps.push([x + 2, x + 1 + g]);
      for (let px = x + 4, n = 0; px < x + g; px += 3, n++) { for (let h = 0; h < 3; h++) L.solid.push([px, h]); if (n % 2) L.fires.push(px + 1.5); }
      L.coins.push([x + 4, x + g, 6]);
      x += g + 5;
    } else if (k === 'cannons') {     // cañones que disparan al jugador
      L.solid.push([x + 3, 2]); L.blocks.push([x + 3, 3, 'K']);
      L.solid.push([x + 9, 2]); L.solid.push([x + 9, 3]); L.blocks.push([x + 9, 4, 'K']);
      L.enemies.push([x + 6, 2, W404]); L.coins.push([x + 4, x + 8, 6]);
      x += 13;
    } else if (k === 'shipGap') {     // hueco entre cubiertas (agua abajo)
      L.gaps.push([x + 2, x + 4]); L.coins.push([x + 2, x + 4, 6]);
      if (rnd() < 0.5) L.enemies.push([x + 3, 6, FLY]);
      x += 8;
    } else if (k === 'swimRun') {   // agua: monedas altas y archivos corruptos nadando
      L.coins.push([x + 2, x + 7, ri(7, 10)]);
      L.enemies.push([x + 4, ri(5, 8), FLY]);
      if (rnd() < 0.5) L.enemies.push([x + 8, 2, W404]);
      x += 12;
    } else if (k === 'enemyRun') {
      L.enemies.push([x + 8, 2, CHG]);
      if (diff > 0.5) L.enemies.push([x + 5, 2, W404]);
      L.coins.push([x + 3, x + 5, 5]);
      x += 12;
    }
  }
  x += 2;
  if (opts.boss) {
    // arena del jefe: suelo plano, muro que se abre al vencerlo, luego la bandera
    const a0 = x + 2;
    L.arena = a0; L.bossWall = a0 + 24;
    for (let h = 0; h <= 8; h++) L.solid.push([L.bossWall, 2 + h]);
    L.enemies.push([a0 + 17, 2, 'boss']);
    L.flagX = a0 + 28; L.W = L.flagX + 14;
    L.checkpoint = a0 - 3;
  } else {
    // final: escalera grande + bandera + castillo
    for (let i = 0; i < 6; i++) for (let h = 0; h <= i; h++) L.solid.push([x + i, 2 + h]);
    for (let h = 0; h <= 5; h++) L.solid.push([x + 6, 2 + h]);
    L.flagX = x + 8; L.W = L.flagX + 14;
    L.checkpoint = Math.round(L.W * 0.5);
  }
  L.time = Math.round(300 - diff * 60);
  L.deathY = L.lava ? 0.85 : L.ship ? 0.3 : -3;
  if (opts.cave) L.ceilingEnd = L.flagX - 12;   // techo de roca hasta antes de la bandera
  return L;
}
let LEVELS = null;
function levelSpec(i, w = game.world) {
  if (!LEVELS) LEVELS = [[
    lvl1(),
    genLevel(1207, 0.3, 'La Laguna', 'water', { bg: 'agua', water: true }),
    genLevel(4409, 0.45, 'La Selva', 'jungle', { bg: 'selva', kinds: ['movers', 'blocks', 'springs', 'movers', 'gap', 'highroad', 'enemyRun', 'movers', 'pipes'] }),
    genLevel(7741, 0.6, 'La Cueva', 'cave', { bg: 'cueva', cave: true }),
    genLevel(9133, 0.8, 'Atardecer en Yamboró', 'evening', { bg: 'atardecer', kinds: ['springs', 'fallers', 'enemyRun', 'blocks', 'coinsRun', 'fallers', 'springs', 'highroad', 'gap'] }),
    genLevel(3301, 1.0, 'Montaña de los Bugs', 'mountain', { bg: 'montana', kinds: ['vmovers', 'fallers', 'gap', 'movers', 'vmovers', 'stairs', 'fallers', 'blocks', 'floating'] }),
  ], [
    genLevel(5101, 0.55, 'Faldas del Volcán', 'lava', { bg: 'volcano', lava: true, style: 'volcano', kinds: ['lavaPit', 'blocks', 'lavaPit', 'pipes', 'enemyRun', 'lavaPit', 'stairs', 'fallers', 'highroad'] }),
    genLevel(5203, 0.65, 'El Barco de los Bugs', 'sea', { bg: 'ocean', ship: true, style: 'ship', kinds: ['cannons', 'shipGap', 'movers', 'cannons', 'blocks', 'enemyRun', 'shipGap', 'cannons', 'highroad'] }),
    genLevel(5307, 0.8, 'Puente de Lava', 'lava', { bg: 'volcano', lava: true, style: 'volcano', kinds: ['lavaLake', 'movers', 'fallers', 'vmovers', 'lavaPit', 'lavaLake', 'movers'] }),
    genLevel(5409, 0.9, 'Mina de Datos', 'lavacave', { bg: 'cueva', lava: true, cave: true, style: 'lavacave', kinds: ['lavaPit', 'blocks', 'fallers', 'enemyRun', 'springs', 'lavaPit', 'highroad', 'movers'] }),
    genLevel(5511, 1.0, 'Fortaleza del Bug Rey', 'fortress', { bg: 'fortress', lava: true, cave: true, noStal: true, style: 'fortress', boss: true, kinds: ['lavaPit', 'fallers', 'cannons', 'lavaPit', 'vmovers', 'enemyRun'] }),
  ]];
  return LEVELS[w][i];
}
function applyTheme(name) {
  const th = THEMES[name] || THEMES.day;
  sun.color.set(th.sun); sun.intensity = th.sunI; hemi.color.set(th.hemi); hemi.intensity = th.hemiI;
  scene.fog.color.set(th.fog); BG.tint = th.bg;
  if (BG.mesh) BG.mesh.material.color.set(th.bg);
}

let grid, levelGroup, blockMesh, coins, enemies, flag;
function makeGrid(L) {
  W = L.W; FLAGX = L.flagX;
  grid = Array.from({ length: W }, () => new Array(H).fill(null));
  const set = (x, y, c) => { x = Math.round(x); if (x >= 0 && x < W && y >= 0 && y < H) grid[x][y] = c; };
  for (let x = 0; x < W; x++) if (!L.gaps.some(([a, b]) => x >= a && x <= b)) { set(x, 0, 'G'); set(x, 1, 'G'); }
  L.blocks.forEach(([x, y, c]) => set(x, L.cave ? Math.min(y, 8) : y, c));   // en la cueva, debajo del techo
  L.solid.forEach(([x, y]) => set(x, y, 'S'));
  set(FLAGX, 2, 'S');
  L.pipes.forEach(([x, h]) => { for (let y = 2; y < 2 + h; y++) { set(x, y, 'P'); set(x + 1, y, 'P'); } });
  if (L.cave) for (let x = 0; x < L.ceilingEnd; x++) { set(x, 11, 'C'); set(x, 12, 'C'); set(x, 13, 'C'); }
  return L.pipes;
}

function buildLevel() {
  if (levelGroup) scene.remove(levelGroup);
  levelGroup = new T.Group(); scene.add(levelGroup);
  blockMesh = {}; coins = []; enemies = []; powerups = []; coinIdx = 0;
  const L = levelSpec(game.level);
  applyTheme(L.theme); setBackdrop(L.bg || 'yamboro');
  const ST = {
    grass:    [MAT.grass, MAT.dirt, MAT.brick, MAT.caveRock],
    water:    [MAT.waterTop, MAT.waterSand, MAT.brick, MAT.caveRock],
    cave:     [MAT.caveTop, MAT.caveRock, MAT.caveBrick, MAT.caveRock],
    volcano:  [MAT.volcTop, MAT.volcRock, MAT.redBrick, MAT.volcRock],
    ship:     [MAT.deck, MAT.hull, MAT.brick, MAT.hull],
    lavacave: [MAT.volcTop, MAT.volcRock, MAT.redBrick, MAT.volcRock],
    fortress: [MAT.castleTop, MAT.castle, MAT.castle, MAT.castle],
  }[L.style] || [MAT.grass, MAT.dirt, MAT.brick, MAT.caveRock];
  [LM.top, LM.fill, LM.brick, LM.ceil] = ST;
  plats = []; springs = []; fires = []; cannons = []; bossE = null; bossBar.classList.remove('on');
  const pipes = makeGrid(L);
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
    const c = grid[x][y]; if (!c || c === 'P') continue;
    let m;
    if (c === 'G') {
      m = new T.Mesh(GEO.ground, grid[x][y + 1] === 'G' ? LM.fill : LM.top);
      m.position.set(x + 0.5, y + 0.5, -0.8);
    } else if (c === 'C') {
      m = new T.Mesh(GEO.ground, LM.ceil);
      m.position.set(x + 0.5, y + 0.5, -0.8);
    } else if (c === 'K') {
      m = makeCannon(); m.position.set(x + 0.5, y, 0);
      blockMesh[x + ',' + y] = m;
      cannons.push({ x: x + 0.5, y: y + 0.55, t: 1.2 + Math.random() * 1.5, barrel: m.userData.barrel });
    } else {
      m = new T.Mesh(GEO.box, c === 'B' ? LM.brick : (c === '?' || c === 'M') ? MAT.question : c === 'S' ? MAT.stone : MAT.used);
      m.position.set(x + 0.5, y + 0.5, 0);
      blockMesh[x + ',' + y] = m;
    }
    m.castShadow = c !== 'G' && c !== 'C'; m.receiveShadow = true; levelGroup.add(m);
  }
  if (L.cave && !L.noStal) {   // estalactitas
    const stal = new T.MeshStandardMaterial({ color: 0x4a4f5c, roughness: 0.9 });
    for (let x = 3; x < L.ceilingEnd - 1; x += 3 + (x * 7) % 4) {
      const h = 0.6 + ((x * 13) % 5) * 0.18, c = new T.Mesh(new T.ConeGeometry(0.28, h, 7), stal);
      c.rotation.x = Math.PI; c.position.set(x + 0.5, 11 - h / 2, -0.4); levelGroup.add(c);
    }
  }
  if (L.cave) {   // antorchas
    const torchM = new T.MeshBasicMaterial({ color: 0xffb040 });
    for (let x = 10; x < L.ceilingEnd; x += 18) {
      const f = new T.Mesh(new T.SphereGeometry(0.16, 10, 8), torchM); f.position.set(x + 0.5, 6.5, -2.2); levelGroup.add(f);
      const l = new T.PointLight(0xff9a3a, 1.4, 9, 1.6); l.position.set(x + 0.5, 6.5, -1.6); levelGroup.add(l);
    }
  }
  if (L.lava) {    // lava en todos los huecos
    L.gaps.forEach(([a, b]) => {
      const m = new T.Mesh(new T.BoxGeometry(b - a + 1, 0.8, 4), MAT.lava);
      m.position.set((a + b + 1) / 2, 0.4, -0.8); levelGroup.add(m);
      const l = new T.PointLight(0xff6a1a, 1.2, 7, 1.8); l.position.set((a + b + 1) / 2, 1.6, 1); levelGroup.add(l);
    });
  }
  if (L.ship) {    // mar bajo la cubierta, mástiles con velas y barandas
    // mar: detrás del barco y en los huecos entre cubiertas (no delante, para no tapar la cubierta)
    const seaMat = new T.MeshBasicMaterial({ map: canvasTex((g, s2) => { g.fillStyle = '#1b4f8f'; g.fillRect(0, 0, s2, s2); g.fillStyle = '#3b78b8'; for (let i = 0; i < 9; i++) g.fillRect((i * 23) % s2, (i * 13) % s2, 14, 2); g.fillStyle = '#123a6e'; for (let i = 0; i < 6; i++) g.fillRect((i * 31 + 9) % s2, (i * 19 + 5) % s2, 10, 2); }), fog: false });
    seaMat.map.wrapS = seaMat.map.wrapT = T.RepeatWrapping; seaMat.map.repeat.set(60, 10);
    const sea = new T.Mesh(new T.PlaneGeometry(W + 80, 30), seaMat);
    sea.rotation.x = -Math.PI / 2; sea.position.set(W / 2, 0.6, -18); levelGroup.add(sea);
    L.gaps.forEach(([a, b]) => { const w2 = new T.Mesh(new T.BoxGeometry(b - a + 1, 0.2, 4), seaMat); w2.position.set((a + b + 1) / 2, 0.5, -0.8); levelGroup.add(w2); });
    const woodM = new T.MeshStandardMaterial({ color: 0x6a3e1a, roughness: 0.8 }), sailM = new T.MeshStandardMaterial({ color: 0xc9b896, roughness: 0.9, side: T.DoubleSide });
    for (let x = 12; x < W - 15; x += 26) {
      const mast = new T.Mesh(new T.CylinderGeometry(0.18, 0.24, 12, 10), woodM); mast.position.set(x, 8, -2.4); levelGroup.add(mast);
      [9.5, 6.2].forEach((y, k) => {
        const yard = new T.Mesh(new T.CylinderGeometry(0.08, 0.08, 5 - k, 8), woodM); yard.rotation.z = Math.PI / 2; yard.position.set(x, y + 1.2, -2.3); levelGroup.add(yard);
        const sail = new T.Mesh(new T.PlaneGeometry(4.6 - k, 2.6, 6, 3), sailM);
        const pos = sail.geometry.attributes.position; for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin((pos.getX(i) / 4.6 + 0.5) * Math.PI) * 0.5);
        sail.geometry.computeVertexNormals(); sail.position.set(x, y, -2.1); levelGroup.add(sail);
      });
      const flagM = new T.Mesh(new T.PlaneGeometry(1.2, 0.7), new T.MeshBasicMaterial({ map: canvasTex((g, s2) => { g.fillStyle = '#111'; g.fillRect(0, 0, s2, s2); g.fillStyle = '#ff2a55'; g.font = 'bold 30px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('404', s2 / 2, s2 / 2); }), side: T.DoubleSide }));
      flagM.position.set(x + 0.6, 14.2, -2.4); levelGroup.add(flagM);
    }
    const rail = new T.Mesh(new T.BoxGeometry(W, 0.12, 0.12), woodM); rail.position.set(W / 2, 3.0, -2.6); levelGroup.add(rail);
    for (let x = 0; x < W; x += 2) { if (!grid[x] || grid[x][1] !== 'G') continue; const post = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 1, 6), woodM); post.position.set(x + 0.5, 2.5, -2.6); levelGroup.add(post); }
  }
  // plataformas, trampolines y bolas de fuego
  (L.plats || []).forEach(d => addPlat(d, L));
  (L.springs || []).forEach(x => addSpring(x));
  (L.fires || []).forEach((x, i) => addFire(x, i));
  if (L.water) {   // superficie del agua y velo azul delante de la escena
    const surf = new T.Mesh(new T.PlaneGeometry(W + 40, 0.25), new T.MeshBasicMaterial({ color: 0xbff4ff, transparent: true, opacity: 0.55 }));
    surf.position.set(W / 2, WATER_TOP, 0.6); levelGroup.add(surf);
    const veil = new T.Mesh(new T.PlaneGeometry(W + 40, WATER_TOP + 6), new T.MeshBasicMaterial({ color: 0x1a8fd0, transparent: true, opacity: 0.16, depthWrite: false }));
    veil.position.set(W / 2, (WATER_TOP - 6) / 2, 1.6); veil.renderOrder = 5; levelGroup.add(veil);
  }
  // tubos
  const pipeMat = new T.MeshStandardMaterial({ color: 0x2fbf3a, roughness: 0.35, metalness: 0.1 });
  pipes.forEach(([x, h]) => {
    const body = new T.Mesh(new T.CylinderGeometry(0.88, 0.88, h - 0.45, 28), pipeMat);
    body.position.set(x + 1, 2 + (h - 0.45) / 2, 0); body.castShadow = body.receiveShadow = true;
    const lip = new T.Mesh(new T.CylinderGeometry(1.0, 1.0, 0.45, 28), pipeMat);
    lip.position.set(x + 1, 2 + h - 0.225, 0); lip.castShadow = true;
    levelGroup.add(body, lip);
  });
  // monedas
  L.coins.forEach(([a, b, y]) => { for (let x = a; x <= b; x++) if (!grid[x] || !grid[x][y]) addCoin(x + 0.5, y + 0.5); });
  // enemigos
  L.enemies.forEach(([x, y, type]) => addEnemy(x + 0.5, y, type));
  // bandera
  flag = new T.Group();
  const pole = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, 9, 12), new T.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.6, roughness: 0.3 }));
  pole.position.y = 3 + 4.5; flag.add(pole);
  const ball = new T.Mesh(new T.SphereGeometry(0.2, 16, 12), new T.MeshStandardMaterial({ color: 0x2fbf3a })); ball.position.y = 12.1; flag.add(ball);
  const fShape = new T.Shape(); fShape.moveTo(0, 0); fShape.lineTo(-1.3, -0.5); fShape.lineTo(0, -1); fShape.lineTo(0, 0);
  const cloth = new T.Mesh(new T.ShapeGeometry(fShape), new T.MeshStandardMaterial({ color: 0x2ecc40, side: T.DoubleSide }));
  cloth.position.set(-0.05, 11.7, 0); flag.add(cloth); flag.userData.cloth = cloth;
  flag.position.set(FLAGX + 0.5, 0, 0); flag.traverse(o => { if (o.isMesh) o.castShadow = true; });
  levelGroup.add(flag);
  // castillo simple
  const castle = new T.Group(), cm = MAT.stone;
  const cbody = new T.Mesh(new T.BoxGeometry(5, 5, 3), cm); cbody.position.set(0, 4.5, -1); castle.add(cbody);
  const ctop = new T.Mesh(new T.BoxGeometry(3, 2.5, 2.6), cm); ctop.position.set(0, 8.2, -1); castle.add(ctop);
  const door = new T.Mesh(new T.BoxGeometry(1.2, 2, 0.1), new T.MeshBasicMaterial({ color: 0x1a0e05 })); door.position.set(0, 3, 0.52); castle.add(door);
  castle.position.set(FLAGX + 6.5, 0, 0); castle.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
  levelGroup.add(castle);
  buildScenery();
}

// Fondo 2D con parallax (plano lejano que se mueve más lento que el nivel). Cada nivel tiene su imagen;
// las de los niveles 1-2..1-6 están en assets/fondos/<nombre>.js y se cargan solo cuando hacen falta.
const BG = { Z: -25, H: 34, PARALLAX: 0.93, mesh: null, key: '', tex: {} };
function setBackdrop(key) {
  BG.key = key;
  if (BG.tex[key]) return applyBackdrop(key);
  const load = src => {
    const img = new Image();
    img.onload = () => {
      const t = new T.Texture(img); t.encoding = T.sRGBEncoding; t.anisotropy = 8; t.needsUpdate = true;
      BG.tex[key] = { t, aspect: img.width / img.height };
      if (BG.key === key) applyBackdrop(key);
    };
    img.src = src;
  };
  if (key === 'yamboro') return load(window.BG_YAMBORO);
  if (PROC_BG[key]) return load(drawBackdrop(key));
  if (window.BG_IMG && window.BG_IMG[key]) return load(window.BG_IMG[key]);
  const sc = document.createElement('script'); sc.src = 'assets/fondos/' + key + '.js';
  sc.onload = () => load(window.BG_IMG[key]);
  document.head.appendChild(sc);
}
// Fondos dibujados por código (Mundo 2): volcán, océano al atardecer y fortaleza
const PROC_BG = { volcano: 1, ocean: 1, fortress: 1 };
function drawBackdrop(key) {
  const c = document.createElement('canvas'); c.width = 1920; c.height = 1080; const g = c.getContext('2d');
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const ridge = (y0, amp, col, step = 60) => { g.fillStyle = col; g.beginPath(); g.moveTo(0, 1080); for (let x = 0; x <= 1920 + step; x += step) g.lineTo(x, y0 - rnd() * amp); g.lineTo(1920, 1080); g.fill(); };
  const glow = (x, y, r, col) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); };
  if (key === 'volcano') {
    let gr = g.createLinearGradient(0, 0, 0, 1080); gr.addColorStop(0, '#1a0608'); gr.addColorStop(0.45, '#5a1408'); gr.addColorStop(0.75, '#c43a0a'); gr.addColorStop(1, '#ff8a1a');
    g.fillStyle = gr; g.fillRect(0, 0, 1920, 1080);
    for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(30,12,12,${0.25 + rnd() * 0.35})`; g.beginPath(); g.ellipse(rnd() * 1920, 80 + rnd() * 320, 140 + rnd() * 220, 40 + rnd() * 60, 0, 0, 7); g.fill(); }
    ridge(760, 140, '#3a1410', 80);
    // volcán principal
    g.fillStyle = '#240c0c'; g.beginPath(); g.moveTo(560, 1080); g.lineTo(880, 360); g.lineTo(1040, 360); g.lineTo(1400, 1080); g.fill();
    glow(960, 360, 260, 'rgba(255,140,30,0.85)');
    g.strokeStyle = '#ff7a1a'; g.lineWidth = 9; g.lineCap = 'round';
    [[900, 380, 760, 900], [1000, 380, 1110, 800], [960, 370, 930, 1000]].forEach(([a, b, cx, d]) => { g.beginPath(); g.moveTo(a, b); g.quadraticCurveTo(cx, (b + d) / 2, cx + (rnd() - 0.5) * 80, d); g.stroke(); });
    for (let i = 0; i < 18; i++) { g.fillStyle = `rgba(60,40,40,${0.4 + rnd() * 0.4})`; g.beginPath(); g.arc(940 + (rnd() - 0.5) * 300, 300 - i * 18 - rnd() * 30, 50 + rnd() * 60, 0, 7); g.fill(); }
    ridge(880, 90, '#1c0808', 50); ridge(980, 60, '#120404', 40);
    glow(960, 1080, 700, 'rgba(255,90,10,0.45)');
    for (let i = 0; i < 160; i++) { g.fillStyle = rnd() < 0.5 ? '#ffb030' : '#ff5a10'; g.fillRect(rnd() * 1920, rnd() * 1000, 3, 3); }
  } else if (key === 'ocean') {
    let gr = g.createLinearGradient(0, 0, 0, 640); gr.addColorStop(0, '#2a1a5a'); gr.addColorStop(0.5, '#c4508a'); gr.addColorStop(1, '#ffb05a');
    g.fillStyle = gr; g.fillRect(0, 0, 1920, 640);
    glow(1300, 600, 380, 'rgba(255,220,120,0.9)'); g.fillStyle = '#fff2b0'; g.beginPath(); g.arc(1300, 600, 90, 0, 7); g.fill();
    for (let i = 0; i < 12; i++) { g.fillStyle = `rgba(255,${150 + rnd() * 60},${150 + rnd() * 50},0.55)`; g.beginPath(); g.ellipse(rnd() * 1920, 100 + rnd() * 380, 160 + rnd() * 200, 18 + rnd() * 20, 0, 0, 7); g.fill(); }
    // islas con palmas
    [[260, 640, 260], [1650, 640, 200]].forEach(([x, y, w]) => {
      g.fillStyle = '#3a1e3a'; g.beginPath(); g.ellipse(x, y, w, 70, 0, Math.PI, 0); g.fill();
      for (let k = 0; k < 3; k++) { const px = x - 80 + k * 70; g.strokeStyle = '#3a1e3a'; g.lineWidth = 10; g.beginPath(); g.moveTo(px, y - 40); g.lineTo(px + 18, y - 190); g.stroke();
        for (let l = 0; l < 6; l++) { g.beginPath(); g.moveTo(px + 18, y - 190); g.quadraticCurveTo(px + 18 + Math.cos(l) * 70, y - 230, px + 18 + Math.cos(l * 1.1) * 110, y - 160 + l * 6); g.stroke(); } }
    });
    // barco pirata en silueta
    g.fillStyle = '#2a142a'; g.beginPath(); g.moveTo(700, 610); g.lineTo(1000, 610); g.lineTo(960, 660); g.lineTo(740, 660); g.fill();
    g.fillRect(845, 380, 10, 232); g.fillRect(760, 430, 8, 182);
    g.beginPath(); g.moveTo(850, 390); g.lineTo(950, 470); g.lineTo(850, 560); g.fill(); g.beginPath(); g.moveTo(764, 440); g.lineTo(830, 500); g.lineTo(764, 580); g.fill();
    gr = g.createLinearGradient(0, 640, 0, 1080); gr.addColorStop(0, '#5a3a8a'); gr.addColorStop(0.35, '#1f4a8a'); gr.addColorStop(1, '#0a1a3a');
    g.fillStyle = gr; g.fillRect(0, 640, 1920, 440);
    for (let i = 0; i < 220; i++) { const y = 650 + rnd() * 430; g.fillStyle = `rgba(255,${200 + rnd() * 55},170,${0.15 + (y < 820 && Math.abs(rnd() * 600) < 300 ? 0.35 : 0)})`; g.fillRect(1300 + (rnd() - 0.5) * (y - 560) * 1.6, y, 30 + rnd() * 90, 3); }
    for (let i = 0; i < 120; i++) { g.fillStyle = 'rgba(180,210,255,0.18)'; g.fillRect(rnd() * 1920, 660 + rnd() * 420, 40 + rnd() * 120, 2); }
  } else {   // fortress
    g.fillStyle = '#1a0c0e'; g.fillRect(0, 0, 1920, 1080);
    for (let r = 0; r < 28; r++) for (let x = -(r % 2) * 60; x < 1920; x += 120) {
      const v = 30 + rnd() * 18; g.fillStyle = `rgb(${v + 14},${v * 0.55},${v * 0.6})`; g.fillRect(x + 3, r * 40 + 3, 114, 34);
    }
    [[360, 300], [960, 240], [1560, 300]].forEach(([x, y]) => {
      g.fillStyle = '#0a0304'; g.beginPath(); g.moveTo(x - 70, y + 260); g.lineTo(x - 70, y + 70); g.arc(x, y + 70, 70, Math.PI, 0); g.lineTo(x + 70, y + 260); g.fill();
      glow(x, y + 180, 160, 'rgba(255,60,20,0.35)');
      g.strokeStyle = '#2a1a1a'; g.lineWidth = 8; for (let k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(x + k * 35, y); g.lineTo(x + k * 35, y + 260); g.stroke(); }
    });
    [[150, 520], [660, 520], [1260, 520], [1770, 520]].forEach(([x, y]) => { g.fillStyle = '#3a2a1a'; g.fillRect(x - 8, y, 16, 60); glow(x, y - 20, 120, 'rgba(255,170,60,0.75)'); g.fillStyle = '#ffd070'; g.beginPath(); g.ellipse(x, y - 14, 14, 26, 0, 0, 7); g.fill(); });
    [[560, 0, 420], [1360, 0, 380]].forEach(([x, y, h]) => { g.strokeStyle = '#3a3238'; g.lineWidth = 10; for (let k = 0; k < h; k += 34) { g.beginPath(); g.ellipse(x, y + k, 10, 18, 0, 0, 7); g.stroke(); } });
    const gr = g.createLinearGradient(0, 760, 0, 1080); gr.addColorStop(0, 'rgba(255,60,10,0)'); gr.addColorStop(1, 'rgba(255,90,10,0.85)'); g.fillStyle = gr; g.fillRect(0, 760, 1920, 320);
  }
  return c.toDataURL('image/jpeg', 0.88);
}
function applyBackdrop(key) {
  const { t, aspect } = BG.tex[key];
  if (!BG.mesh) {
    BG.mesh = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: t, fog: false, toneMapped: false, depthWrite: false }));
    BG.mesh.position.z = BG.Z; BG.mesh.renderOrder = -1; scene.add(BG.mesh);
  }
  BG.mesh.material.map = t; BG.mesh.material.needsUpdate = true;
  BG.mesh.scale.set(BG.H * aspect, BG.H, 1);
  if (BG.tint !== undefined) BG.mesh.material.color.set(BG.tint);
  BG.mesh.visible = game.state !== 'map';
}
setBackdrop('yamboro');
function updateBackdrop(cx, cy) {
  if (!BG.mesh) return;
  BG.mesh.position.x = cx - (cx - W / 2) * (1 - BG.PARALLAX);   // desplazamiento lento horizontal
  BG.mesh.position.y = cy - 0.5;
  // pantallas más anchas que 16:9 (celulares): agrandar el fondo para que no se vean los bordes
  const img = BG.tex[BG.key], k = Math.max(1, camera.aspect / (img ? img.aspect : 16 / 9)) * 1.12;
  if (img) BG.mesh.scale.set(BG.H * img.aspect * k, BG.H * k, 1);
}

function buildScenery() {
  const Lk = levelSpec(game.level); if ((Lk.style || 'grass') !== 'grass') return;
  const bushMat = new T.MeshStandardMaterial({ color: 0x48c040, roughness: 0.8 });
  let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let x = 4; x < W; x += 6 + rnd() * 8) {
    if (!grid[Math.floor(x)] || grid[Math.floor(x)][1] !== 'G') continue;
    const b = new T.Group();
    for (let i = 0; i < 3; i++) { const s = new T.Mesh(new T.SphereGeometry(0.55 + (i === 1) * 0.2, 14, 10), bushMat); s.position.set(i * 0.6, 0.3 + (i === 1) * 0.15, 0); b.add(s); }
    b.position.set(x, 2, -1.6); levelGroup.add(b);
  }
}

// Monedas: taza de café y empanada (se alternan)
const COIN_TYPES = ['coffee-coin', 'empanada-coin'];
let coinIdx = 0;
function makeCoinMesh() {
  const g = new T.Group(), m = enemyTemplates[COIN_TYPES[coinIdx++ % COIN_TYPES.length]].clone(true);
  m.scale.setScalar(0.72); g.add(m);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function addCoin(x, y) {
  const m = makeCoinMesh(); m.position.set(x, y, 0);
  levelGroup.add(m); coins.push({ x, y, m, taken: false, ph: Math.random() * 6 });
}

// Hongo que agranda al personaje
const shroomMats = {
  cap: new T.MeshStandardMaterial({ color: 0xe52521, roughness: 0.45 }),
  spot: new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }),
  stem: new T.MeshStandardMaterial({ color: 0xf5e6c8, roughness: 0.7, side: T.DoubleSide }),
  eye: new T.MeshBasicMaterial({ color: 0x111111 }),
};
function makeMushroom() {
  const g = new T.Group(), R = 0.42, CY = 0.36, SY = 0.85;
  const cap = new T.Mesh(new T.SphereGeometry(R, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2), shroomMats.cap);
  cap.position.y = CY; cap.scale.y = SY; g.add(cap);
  const under = new T.Mesh(new T.CircleGeometry(R, 28), shroomMats.stem); under.rotation.x = Math.PI / 2; under.position.y = CY; g.add(under);
  [[0.25, 0], [1.05, Math.PI / 2], [1.1, Math.PI / 2 + 1.5], [1.1, Math.PI / 2 - 1.5], [1.0, -Math.PI / 2]].forEach(([phi, th]) => {
    const s = new T.Mesh(new T.SphereGeometry(0.12, 12, 8), shroomMats.spot);
    const n = new T.Vector3(Math.sin(phi) * Math.cos(th), Math.cos(phi) * SY, Math.sin(phi) * Math.sin(th));
    s.position.set(n.x * R, CY + n.y * R, n.z * R); s.scale.set(1, 1, 0.45);
    s.lookAt(s.position.clone().add(new T.Vector3(n.x, n.y, n.z))); g.add(s);
  });
  const stem = new T.Mesh(new T.CylinderGeometry(0.22, 0.27, 0.4, 20), shroomMats.stem); stem.position.y = 0.2; g.add(stem);
  [-1, 1].forEach(sx => { const e = new T.Mesh(new T.BoxGeometry(0.05, 0.13, 0.02), shroomMats.eye); e.position.set(0.07 * sx, 0.24, 0.255); g.add(e); });
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
let powerups = [];
// ---- plataformas móviles / que caen, trampolines, bolas de fuego, cañones, jefe ----
let plats = [], springs = [], fires = [], cannons = [], bossE = null;
const bossBar = document.getElementById('bossBar'), bossFill = document.getElementById('bossFill');
const platMats = {};
function platMat(style, falling) {
  const k = style + (falling ? 'F' : '');
  if (!platMats[k]) {
    const base = { volcano: TEX.castleTop, lavacave: TEX.castleTop, fortress: TEX.castleTop }[style] || TEX.deck;
    platMats[k] = new T.MeshStandardMaterial({ map: base, color: falling ? 0xff9a7a : 0xffffff, roughness: 0.75 });
  }
  return platMats[k];
}
function addPlat(d, L) {
  const m = new T.Mesh(new T.BoxGeometry(d.w, 0.4, 1.6), platMat(L.style, d.type === 'f'));
  m.castShadow = m.receiveShadow = true; levelGroup.add(m);
  const pl = { x: d.x, y: d.y, w: d.w, type: d.type, x0: d.x, y0: d.y, range: d.range || 0, speed: d.speed || 0, t: 0, mesh: m, state: 'idle', fallT: 0, vy: 0 };
  m.position.set(pl.x + pl.w / 2, pl.y - 0.2, 0); plats.push(pl);
}
function updatePlats(dt) {
  const p = player;
  plats.forEach(pl => {
    const ox = pl.x, oy = pl.y; let jit = 0;
    if (pl.type === 'h' || pl.type === 'v') {
      pl.t += dt; const k = 0.5 - 0.5 * Math.cos(pl.t * Math.PI * pl.speed / pl.range);
      if (pl.type === 'h') pl.x = pl.x0 + pl.range * k; else pl.y = pl.y0 + pl.range * k;
    } else if (pl.type === 'tmp') {
      pl.life -= dt;
      pl.mesh.children.forEach(m => { m.userData.d -= dt; if (m.userData.d < 0) m.scale.setScalar(Math.min(1, m.scale.x + dt * 7)); m.visible = pl.life > 1.2 || Math.floor(pl.life * 10) % 2 === 0; });
      if (pl.life <= 0) { levelGroup.remove(pl.mesh); pl.y = -99; if (p.onPlat === pl) p.onPlat = null; }
    } else if (pl.state === 'shake') {
      pl.fallT -= dt; jit = (Math.random() - 0.5) * 0.08; if (pl.fallT <= 0) pl.state = 'fall';
    } else if (pl.state === 'fall') {
      pl.vy -= 22 * dt; pl.y += pl.vy * dt; if (pl.y < -8) pl.mesh.visible = false;
    }
    const dx = pl.x - ox, dy = pl.y - oy;
    if (p.onPlat === pl && !p.dead) { if (dx) moveX(p, dx); p.y += dy; }
    pl.mesh.position.set(pl.x + pl.w / 2 + jit, pl.y - 0.2, 0);
  });
}
function addSpring(x) {
  const g = new T.Group();
  const base = new T.Mesh(new T.BoxGeometry(0.9, 0.15, 0.9), new T.MeshStandardMaterial({ color: 0x333a44, metalness: 0.5, roughness: 0.4 })); base.position.y = 0.075; g.add(base);
  const coil = new T.Mesh(new T.CylinderGeometry(0.3, 0.3, 0.45, 14, 1, true), new T.MeshStandardMaterial({ color: 0xcfd6e0, metalness: 0.8, roughness: 0.25, wireframe: true })); coil.position.y = 0.37; g.add(coil);
  const pad = new T.Mesh(new T.CylinderGeometry(0.45, 0.45, 0.16, 20), new T.MeshStandardMaterial({ color: 0x39a900, roughness: 0.4 })); pad.position.y = 0.66; g.add(pad);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.position.set(x, 2, 0); levelGroup.add(g);
  springs.push({ x, top: 2.75, mesh: g, pad, coil, sq: 0 });
}
const fireMat = new T.MeshStandardMaterial({ color: 0xffb030, emissive: 0xff5a00, emissiveIntensity: 1.4, roughness: 0.4 });
function addFire(x, i) {
  const g = new T.Group();
  const core = new T.Mesh(new T.SphereGeometry(0.34, 14, 10), fireMat); g.add(core);
  const tail = new T.Mesh(new T.ConeGeometry(0.28, 0.7, 10), fireMat); tail.position.y = -0.45; tail.rotation.x = Math.PI; g.add(tail);
  [-1, 1].forEach(s2 => { const e = new T.Mesh(new T.SphereGeometry(0.06, 8, 6), new T.MeshBasicMaterial({ color: 0x220000 })); e.position.set(0.12 * s2, 0.08, 0.3); g.add(e); });
  levelGroup.add(g);
  fires.push({ x, y: 0.2, vy: 0, t: 0.6 + i * 0.7, mesh: g, tail });
}
function updateFires(dt) {
  const p = player;
  fires.forEach(f => {
    if (f.t > 0) { f.t -= dt; f.mesh.visible = false; if (f.t <= 0) { f.vy = 15.5; f.y = 0.2; if (Math.abs(f.x - p.x) < 10) SFX.fire(); } return; }
    f.mesh.visible = true; f.vy -= 25 * dt; f.y += f.vy * dt;
    if (f.y < 0.2 && f.vy < 0) { f.t = 1.2 + Math.random() * 1.3; return; }
    f.mesh.position.set(f.x, f.y, 0.2); f.mesh.rotation.x = f.vy < 0 ? Math.PI : 0;
    f.mesh.scale.setScalar(1 + Math.sin(performance.now() / 60) * 0.08);
    if (game.state === 'play' && !p.dead && p.invT <= 0 && Math.abs(f.x - p.x) < 0.35 + p.hw && f.y + 0.32 > p.y && f.y - 0.32 < p.y + p.h) damage();
  });
}
function makeCannon() {
  const g = new T.Group(), metal = new T.MeshStandardMaterial({ color: 0x23262e, metalness: 0.7, roughness: 0.35 });
  const base = new T.Mesh(new T.BoxGeometry(1, 0.6, 1), new T.MeshStandardMaterial({ color: 0x5a3418, roughness: 0.8 })); base.position.y = 0.3; g.add(base);
  const barrel = new T.Group(); barrel.position.y = 0.72; g.add(barrel);
  const tube = new T.Mesh(new T.CylinderGeometry(0.26, 0.32, 1.05, 16), metal); tube.rotation.z = Math.PI / 2; tube.position.x = 0.22; barrel.add(tube);
  const ring = new T.Mesh(new T.TorusGeometry(0.28, 0.06, 8, 16), new T.MeshStandardMaterial({ color: 0xd4a020, metalness: 0.8, roughness: 0.3 })); ring.rotation.y = Math.PI / 2; ring.position.x = 0.74; barrel.add(ring);
  const ball = new T.Mesh(new T.SphereGeometry(0.3, 14, 10), metal); ball.position.x = -0.25; barrel.add(ball);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData.barrel = barrel;
  return g;
}
const BULLET = { scale: 1, speed: 4.6, hw: 0.32, h: 0.64, kind: 'bullet', score: 100 };
const bulletMat = new T.MeshStandardMaterial({ color: 0x1a1c22, metalness: 0.8, roughness: 0.3 });
function updateCannons(dt) {
  const p = player;
  cannons.forEach(c => {
    const dx = p.x - c.x, dir = Math.sign(dx) || 1;
    c.barrel.rotation.y += ((dir > 0 ? 0 : Math.PI) - c.barrel.rotation.y) * Math.min(1, dt * 6);
    c.t -= dt;
    if (c.t <= 0) {
      c.t = 2.8 + Math.random() * 1.2;
      if (Math.abs(dx) < 16 && Math.abs(dx) > 1.3 && !p.dead) {
        const g = new T.Group(), body = new T.Group(); g.add(body);
        const ball = new T.Mesh(new T.SphereGeometry(0.33, 16, 12), bulletMat); ball.position.y = 0.32; ball.castShadow = true; body.add(ball);
        const face = new T.Mesh(new T.BoxGeometry(0.3, 0.06, 0.05), new T.MeshBasicMaterial({ color: 0xff2a2a })); face.position.set(0.15 * dir, 0.4, 0.3); body.add(face);
        const x = c.x + dir * 0.85, y = c.y - 0.15;
        g.position.set(x, y, 0); levelGroup.add(g);
        enemies.push({ x, y, x0: x, y0: y, vx: 0, vy: 0, dir, hw: BULLET.hw, h: BULLET.h, def: BULLET, type: 'bullet', alive: true, active: true, mesh: g, body, deadT: 0, mode: '', t: 0, charging: false, rotY: 0 });
        SFX.boom(); shake = Math.max(shake, 0.12); spawnFrag(x, y + 0.3, MAT.used, 3, 2);
      }
    }
  });
}
function updateSprings(dt) {
  springs.forEach(sp => { sp.sq = Math.max(0, sp.sq - dt); const k = sp.sq > 0 ? 0.45 : 1; sp.pad.position.y += (0.2 + 0.46 * k - sp.pad.position.y) * Math.min(1, dt * 18); sp.coil.scale.y = (sp.pad.position.y - 0.12) / 0.54; sp.coil.position.y = 0.15 + (sp.pad.position.y - 0.15) / 2; });
}
function updateBoss(e, dt) {
  const p = player, dx = p.x - e.x;
  e.inv -= dt;
  bossBar.classList.add('on'); bossFill.style.width = (e.hp / 3 * 100) + '%';
  e.vy = Math.max(-MAXFALL, e.vy - GRAV * dt);
  const angry = 3 - e.hp;
  if (e.ground) {
    e.bt -= dt; e.dir = Math.sign(dx) || e.dir;
    if (e.bt <= 0) { e.vy = 16 + angry; e.jvx = Math.sign(dx) * Math.min(5 + angry, Math.abs(dx) * 1.2); e.bt = 2.3 - angry * 0.45; SFX.jump(); }
    else moveX(e, e.dir * (1.3 + angry * 0.7) * dt);
  } else if (moveX(e, e.jvx * dt)) e.jvx = 0;
  const wasG = e.ground, r = moveY(e, e.vy * dt);
  e.ground = !!(r && r.ground);
  if (e.ground && !wasG) { shake = Math.max(shake, 0.45); SFX.pound(); spawnFrag(e.x, e.y + 0.1, LM.fill, 6, 5); }
  if (!p.dead && game.state === 'play' && Math.abs(e.x - p.x) < e.hw + p.hw && p.y < e.y + e.h && p.y + p.h > e.y) {
    if (p.vy < 0 && p.y > e.y + e.h * 0.5) {
      if (e.inv <= 0) {
        e.hp--; e.inv = 1.4; SFX.bosshit(); shake = 0.5; spawnFrag(e.x, e.y + e.h, MAT.stone, 8, 6);
        if (e.hp <= 0) { killEnemy(e, 'boss'); bossDefeated(); }
        else toast(e.hp === 1 ? '¡UNO MÁS!' : '¡BIEN!', 800);
      }
      p.vy = 17;
    } else if (p.invT <= 0 && e.inv < 1.0) damage();
  }
  const s2 = e.def.scale, t = e.t;
  e.rotY += (e.dir * 0.5 - e.rotY) * Math.min(1, dt * 6); e.body.rotation.y = e.rotY;
  const glitch = Math.random() < 0.12;
  e.body.position.set(glitch ? (Math.random() - 0.5) * 0.5 : 0, 0, 0);
  e.body.scale.set(s2 * (glitch ? 1.15 : 1), s2 * (1 + Math.sin(t * 5) * 0.05) * (e.ground ? 1 : 1.08), s2);
  e.mesh.visible = e.inv <= 0 || Math.floor(e.inv * 14) % 2 === 0;
  e.mesh.position.set(e.x, e.y, 0);
}
function bossDefeated() {
  const L = levelSpec(game.level);
  bossBar.classList.remove('on'); addScore(5000); SFX.oneup(); shake = 0.8;
  toast('¡BUG REY DERROTADO!', 2600);
  for (let h = 0; h <= 8; h++) {
    const key = L.bossWall + ',' + (2 + h); grid[L.bossWall][2 + h] = null;
    if (blockMesh[key]) { levelGroup.remove(blockMesh[key]); delete blockMesh[key]; }
    spawnFrag(L.bossWall + 0.5, 2.5 + h, MAT.stone, 3, 5);
  }
}
const lantern = new T.PointLight(0xfff0d0, 0, 14, 1.4); scene.add(lantern);
const bubbles = [];
const bubbleGeo = new T.SphereGeometry(0.07, 8, 6), bubbleMat = new T.MeshBasicMaterial({ color: 0xdff8ff, transparent: true, opacity: 0.8 });
let bubbleT = 0;
let WATER_LVL = false;            // true en niveles de agua (se fija al entrar al nivel)
const SWIM_MAX = 3.8;
function spawnBubbles(p, n) {
  for (let i = 0; i < n; i++) {
    const b = new T.Mesh(bubbleGeo, bubbleMat);
    b.position.set(p.x + p.facing * 0.2 + (Math.random() - 0.5) * 0.3, p.y + p.h * 0.85, 0.3);
    b.scale.setScalar(0.6 + Math.random() * 0.9); scene.add(b);
    bubbles.push({ m: b, life: 1.6 + Math.random(), ph: Math.random() * 6 });
  }
}
function updateLevelFx(dt) {
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i]; b.life -= dt;
    b.m.position.y += 1.8 * dt; b.m.position.x += Math.sin(b.life * 6 + b.ph) * 0.6 * dt;
    if (b.life <= 0 || b.m.position.y > WATER_TOP) { scene.remove(b.m); bubbles.splice(i, 1); }
  }
  const L = levelSpec(game.level);
  lantern.intensity = (L.cave && game.state !== 'map') ? 1.6 : 0;
  lantern.position.set(player.x, player.y + 1.6, 2.2);
}
function spawnMushroom(tx, ty) {
  const m = makeMushroom(); m.position.set(tx + 0.5, ty, -0.2); levelGroup.add(m);
  powerups.push({ x: tx + 0.5, y: ty, y0: ty, vx: 0, vy: 0, dir: 1, hw: 0.36, h: 0.75, mesh: m, state: 'rise', t: 0 });
  SFX.sprout();
}

// Enemigos (modelos 3D): robot-404 camina rápido, entrega-tardía embiste al verte, archivo-corrupto vuela con glitch
const ENEMY_TYPES = {
  'robot-404':            { scale: 1.15, speed: 1.9, hw: 0.5,  h: 0.95, kind: 'walker',  score: 100 },
  'robot-entrega-tardia': { scale: 1.35, speed: 1.0, hw: 0.38, h: 1.25, kind: 'charger', score: 200 },
  'archivo-corrupto':     { scale: 1.2,  speed: 1.5, hw: 0.5,  h: 1.1,  kind: 'flyer',   score: 300 },
  'boss':                 { scale: 3.1,  speed: 1.4, hw: 1.3,  h: 2.75, kind: 'boss',    score: 5000, tmpl: 'archivo-corrupto' },
};
const ENEMY_SPAWNS = [
  [22, 2, 'robot-404'], [34, 2, 'robot-entrega-tardia'], [45, 6, 'archivo-corrupto'],
  [53, 2, 'robot-404'], [55, 2, 'robot-404'], [71, 10, 'robot-404'], [80, 10, 'robot-entrega-tardia'],
  [87, 6, 'archivo-corrupto'], [96, 2, 'robot-entrega-tardia'], [99, 2, 'robot-404'], [107, 2, 'robot-404'],
  [112, 6, 'archivo-corrupto'], [122, 2, 'robot-entrega-tardia'], [124, 2, 'robot-404'], [139, 8, 'archivo-corrupto'],
];
const enemyTemplates = {};
function addEnemy(x, y, type) {
  const def = ENEMY_TYPES[type], tmpl = enemyTemplates[def.tmpl || type];
  const g = new T.Group(), body = new T.Group(); g.add(body);
  const model3d = tmpl.clone(true); body.add(model3d);
  if (def.kind === 'boss') model3d.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.multiply(new T.Color(1, 0.45, 0.4)); o.material.emissive = new T.Color(0x5a0000); } });
  body.scale.setScalar(def.scale);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.position.set(x, y, 0); levelGroup.add(g);
  enemies.push({ x, y, x0: x, y0: y, vx: 0, vy: 0, dir: -1, hw: def.hw, h: def.h, def, type, alive: true, active: false,
    mesh: g, body, deadT: 0, mode: '', t: Math.random() * 10, charging: false, rotY: 0, hp: 3, inv: 0, bt: 2, jvx: 0, ground: false });
  if (def.kind === 'boss') bossE = enemies[enemies.length - 1];
}

// ================= Física de bloques =================
const solid = (tx, ty) => { if (tx < 0 || tx >= W) return true; if (ty < 0 || ty >= H) return false; return !!grid[tx][ty]; };
function moveX(e, dx) {
  if (!dx) return null;
  e.x += dx;
  const y0 = Math.floor(e.y + 0.02), y1 = Math.floor(e.y + e.h - 0.02);
  const edge = dx > 0 ? Math.floor(e.x + e.hw) : Math.floor(e.x - e.hw);
  for (let ty = y0; ty <= y1; ty++) if (solid(edge, ty)) {
    e.x = dx > 0 ? edge - e.hw - 0.001 : edge + 1 + e.hw + 0.001; return 'wall';
  }
  return null;
}
function moveY(e, dy) {
  e.y += dy;
  const x0 = Math.floor(e.x - e.hw + 0.04), x1 = Math.floor(e.x + e.hw - 0.04);
  if (dy <= 0) {
    const ty = Math.floor(e.y);
    for (let tx = x0; tx <= x1; tx++) if (solid(tx, ty)) { e.y = ty + 1; e.vy = 0; return { ground: true }; }
  } else {
    const ty = Math.floor(e.y + e.h);
    let hit = null, bd = 9;
    for (let tx = x0; tx <= x1; tx++) if (solid(tx, ty)) { const d = Math.abs(tx + 0.5 - e.x); if (d < bd) { bd = d; hit = tx; } }
    if (hit !== null) { e.y = ty - e.h - 0.001; e.vy = 0; return { head: true, tx: hit, ty }; }
  }
  return null;
}

// ================= Partículas / efectos =================
const fx = [];
const fragGeo = new T.BoxGeometry(0.25, 0.25, 0.25);
function spawnFrag(x, y, mat, n = 6, speed = 6) {
  for (let i = 0; i < n; i++) {
    const m = new T.Mesh(fragGeo, mat); m.position.set(x + (Math.random() - 0.5) * 0.5, y + (Math.random() - 0.5) * 0.5, 0); scene.add(m);
    fx.push({ m, vx: (Math.random() - 0.5) * speed, vy: 4 + Math.random() * speed, vr: (Math.random() - 0.5) * 12, life: 1.2 });
  }
}
function popCoin(x, y) {
  const m = makeCoinMesh(); m.position.set(x, y, 0.1); scene.add(m);
  fx.push({ m, vx: 0, vy: 10, vr: 14, life: 0.55, coin: true });
}
const bumps = [];
function bump(key) { const m = blockMesh[key]; if (m) bumps.push({ m, t: 0, y0: m.position.y }); }
let shake = 0;

// ================= Jugador =================
const player = { x: 3, y: 2, vx: 0, vy: 0, hw: SIZE.small.hw, h: SIZE.small.h, big: false, growT: 0, facing: 1, grounded: false, coyote: 0, jumpBuf: 0,
  crouch: false, pound: false, poundT: 0, punchT: 0, punchHit: false, landT: 0, dead: false, deadT: 0, invT: 0, rot: 0 };
let model, mixer, actions = {}, cur = null, curName = '';
function play(name, { loop = true, fade = 0.12, speed = 1 } = {}) {
  const a = actions[name]; if (!a) return;
  if (curName === name && loop) { a.timeScale = speed; return; }
  a.reset(); a.enabled = true; a.setLoop(loop ? T.LoopRepeat : T.LoopOnce, Infinity); a.clampWhenFinished = true; a.timeScale = speed;
  if (cur && cur !== a) a.crossFadeFrom(cur, fade, false);
  a.play(); cur = a; curName = name;
}

// ================= Estado de juego =================
function loadProgress() {
  // done/node por mundo; acepta el formato viejo (números sueltos del Mundo 1)
  try {
    const p = JSON.parse(localStorage.getItem('senabros_progress') || '{}');
    const d = Array.isArray(p.done) ? p.done : [p.done | 0, 0], n = Array.isArray(p.node) ? p.node : [p.node | 0, 0];
    return { done: [d[0] | 0, d[1] | 0], node: [n[0] | 0, n[1] | 0], world: p.world | 0 };
  } catch (_) { return { done: [0, 0], node: [0, 0], world: 0 }; }
}
function saveProgress() { try { localStorage.setItem('senabros_progress', JSON.stringify(game.progress)); } catch (_) {} if (window.SenaOnline) SenaOnline.queueSave(); }
const game = { state: 'loading', score: 0, coins: 0, lives: 3, time: TIME_LIMIT, checkpoint: 3, winT: 0, level: 0, world: 0, progress: loadProgress() };
game.world = game.progress.world;
const worldLabel = document.getElementById('worldLabel');
const hud = { score: document.getElementById('score'), coins: document.getElementById('coins'), time: document.getElementById('time'), lives: document.getElementById('lives') };
const overlay = document.getElementById('overlay'), overlayText = document.getElementById('overlayText'), toastEl = document.getElementById('toast');
let toastTimer = 0;
function toast(t, ms = 1500) { toastEl.textContent = t; toastEl.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms); }

function addScore(n) { game.score += n; }
function addCoinCount() { game.coins++; addScore(200); addEnergy(1); missionProgress('coins'); SFX.coin(); if (game.coins % 50 === 0) { game.lives++; SFX.oneup(); toast('1-UP!'); } }

function resetPlayer(x) {
  Object.assign(player, { x, y: 2, vx: 0, vy: 0, facing: 1, grounded: false, crouch: false, pound: false, punchT: 0, landT: 0, dead: false, deadT: 0, invT: 1.2, rot: 0,
    big: false, growT: 0, hw: SIZE.small.hw, h: SIZE.small.h,
    powerCD: 0, shieldT: 0, dashT: 0, slowT: 0, powerAnimT: 0, airDash: true, airJumps: 1 });
  play('M_Idle', { fade: 0.05 });
}
// entra a un nivel (índice 0..5)
function startLevel(i) {
  game.level = i; const L = levelSpec(i);
  WATER_LVL = !!L.water;
  buildLevel();
  if (map.group) map.group.visible = false;
  levelGroup.visible = true; if (BG.mesh) BG.mesh.visible = true;
  game.checkpoint = 3; game.time = L.time; game.state = 'play'; game.hurt = false;
  resetPlayer(3); setMenu(false); setMap(false);
  overlay.classList.remove('show');
  worldLabel.textContent = (game.world + 1) + '-' + (i + 1);
  toast((game.world + 1) + '-' + (i + 1) + '  ' + L.name.toUpperCase(), 1600);
}
function startGame() { startLevel(game.level); }   // reiniciar el nivel actual (R)
// transición de círculo verde: cubre la pantalla, ejecuta fn y se abre
let transitioning = false;
function transition(fn) {
  if (transitioning) return;
  transitioning = true;
  const wipe = document.getElementById('wipe'); wipe.className = 'on';
  setTimeout(() => {
    fn(); wipe.className = 'off';
    setTimeout(() => { wipe.className = ''; transitioning = false; }, 600);
  }, 460);
}
function completeLevel() {
  recordBest();
  const w = game.world, n = game.level + 1, pg = game.progress;
  missionProgress('levels'); if (!game.hurt) missionProgress('flawless'); if (game.winTime >= 150) missionProgress('fast');
  if (n > pg.done[w]) pg.done[w] = n;
  pg.node[w] = n; pg.world = w; saveProgress();
  if (n === WORLDS[w].count) startGlory();          // último nivel del mundo: ¡gloria!
  else transition(() => showMap({ banner: true, cleared: n }));
}

// ================= Gloria al completar un mundo =================
const gloryEl = document.getElementById('glory');
let gloryFwT = 0;
const sparks = [];
const sparkGeo = new T.SphereGeometry(0.07, 6, 4);
function spawnFirework(x, y) {
  const col = [0xffd23f, 0x39a900, 0xff4a6a, 0x4ad8ff, 0xffffff, 0xff8a1a][Math.floor(Math.random() * 6)];
  const mat = new T.MeshBasicMaterial({ color: col, transparent: true });
  for (let i = 0; i < 46; i++) {
    const m = new T.Mesh(sparkGeo, mat), a = Math.random() * 6.283, b = Math.acos(Math.random() * 2 - 1), sp = 4 + Math.random() * 2.5;
    m.position.set(x, y, 1.5); scene.add(m);
    sparks.push({ m, mat, vx: Math.sin(b) * Math.cos(a) * sp, vy: Math.cos(b) * sp, vz: Math.sin(b) * Math.sin(a) * sp * 0.4, life: 1.2 + Math.random() * 0.5 });
  }
  SFX.firework();
}
function updateSparks(dt) {
  if (game.state === 'glory') {
    gloryFwT -= dt;
    if (gloryFwT <= 0) { gloryFwT = 0.35 + Math.random() * 0.4; spawnFirework(camX + (Math.random() - 0.5) * 14, camY + 1 + Math.random() * 5); }
  }
  for (let i = sparks.length - 1; i >= 0; i--) {
    const k = sparks[i]; k.life -= dt;
    if (k.life <= 0) { scene.remove(k.m); sparks.splice(i, 1); continue; }
    k.vy -= 4 * dt; k.vx *= 0.985; k.m.position.x += k.vx * dt; k.m.position.y += k.vy * dt; k.m.position.z += k.vz * dt;
    k.m.scale.setScalar(Math.min(1, k.life * 1.5)); k.mat.opacity = Math.min(1, k.life * 1.5);
  }
}
function startGlory() {
  const w = game.world, [file, label] = CHARS[charIdx];
  game.state = 'glory'; addScore(5000); game.lives++;
  document.getElementById('gTitle').textContent = '¡' + WORLDS[w].name + ' COMPLETADO!';
  document.getElementById('gSub').textContent = w === 0 ? 'Yamboró quedó libre de bugs · ¡se abrió el Mundo 2!' : '¡Derrotaste al Bug Rey! SENA BROS completado';
  document.getElementById('gPortrait').src = (window.PORTRAITS && window.PORTRAITS[file]) || '';
  document.getElementById('gChar').textContent = label.toUpperCase();
  document.getElementById('gScore').textContent = String(game.score).padStart(6, '0');
  document.getElementById('gCoins').textContent = game.coins;
  document.getElementById('gLives').textContent = game.lives;
  const cf = document.getElementById('confetti'); cf.innerHTML = '';
  const cols = ['#ffd23f', '#39a900', '#ff4a6a', '#4ad8ff', '#ffffff', '#ff8a1a'];
  for (let i = 0; i < 90; i++) {
    const c = document.createElement('i');
    c.style.left = (Math.random() * 100) + '%'; c.style.background = cols[i % cols.length];
    c.style.animationDuration = (2.5 + Math.random() * 3) + 's'; c.style.animationDelay = (-Math.random() * 5) + 's';
    c.style.transform = `rotate(${Math.random() * 360}deg)`; cf.appendChild(c);
  }
  gloryEl.classList.add('show'); SFX.fanfare(); gloryFwT = 0.2;
  play('M_Victory', { loop: true, fade: 0.2 });
}
function gloryContinue() {
  if (game.state !== 'glory' || transitioning) return;
  const w = game.world, pg = game.progress;
  SFX.powerup();
  transition(() => {
    gloryEl.classList.remove('show'); document.getElementById('confetti').innerHTML = '';
    if (w === 0) { game.world = 1; pg.world = 1; pg.node[1] = 0; saveProgress(); showMap({ banner: true }); }
    else showMap({ banner: false, finale: true });
  });
}
document.getElementById('gBtn').onclick = gloryContinue;
function showTitle(msg) {
  game.state = 'title'; setMap(false); setMenu(true);
  if (map.group) map.group.visible = false;
  if (levelGroup) levelGroup.visible = true; if (BG.mesh) BG.mesh.visible = true;
  applyTheme(levelSpec(game.level).theme);
  resetPlayer(3);
  overlayText.innerHTML = msg || '';
  overlay.classList.add('show'); menuPose();
}

function die() {
  if (player.dead || game.state !== 'play') return;
  player.dead = true; player.deadT = 0; player.vx = 0; player.vy = 0; player.pound = false; player.facing = 1; player.rot = 0;
  play('M_Death', { loop: false, fade: 0.05 }); SFX.die(); game.lives--; game.hurt = true;
}
// recibir daño: si es grande se encoge, si es pequeño muere
function damage() {
  if (player.shieldT > 0 || player.dashT > 0) return;   // Estructura Estable / dash: invulnerable
  game.hurt = true;
  if (player.big) { player.big = false; player.growT = 0.8; player.invT = 2.0; SFX.shrink(); }
  else die();
}
function grow() {
  addScore(1000);
  if (player.big) { game.lives++; SFX.oneup(); toast('1-UP!', 1100); return; }
  player.big = true; player.growT = 0.8; SFX.powerup(); toast('¡GRANDE!', 900);
}
function afterDeath() {
  if (game.lives <= 0) recordBest();
  if (game.lives > 0) { game.time = levelSpec(game.level).time; resetPlayer(game.checkpoint); }
  else {
    showTitle(`<b>GAME OVER</b> &middot; Puntos: ${game.score}<br>Tu progreso en el mapa se guardó. ¡Inténtalo otra vez!`);
    game.state = 'over';
  }
}
function startWin() {
  game.state = 'win'; game.winT = 0; player.vx = 0; player.vy = 0; player.pound = false;
  player.x = FLAGX + 0.5 - 0.35; player.facing = 1;
  const bonus = Math.floor(player.y - 2) * 400 + 1000; addScore(bonus); toast('+' + bonus, 1200);
  game.winTime = game.time;
  if (player.y >= 9.5) missionProgress('flagTop');
  play('M_Fall', { fade: 0.1 });
}

// ================= Golpes a bloques / enemigos =================
function killEnemy(e, how) {
  if (!e.alive) return;
  if (e.def.kind === 'boss' && how !== 'boss') return;   // al jefe solo se le vence pisándolo
  e.alive = false; e.deadT = 0; e.mode = how; addScore(e.def.score * (how === 'stomp' ? 1 : 2));
  if (e.type !== 'bullet') { addEnergy(2); missionProgress('kills'); }
  if (how === 'stomp') { SFX.stomp(); e.body.scale.y = 0.3 * e.def.scale; spawnFrag(e.x, e.y + 0.3, MAT.stone, 4, 3); }
  else { SFX.punch(); e.vy = 9; e.vx = player.facing * 3; e.mesh.rotation.z = Math.PI; }
}
function hitBlock(tx, ty, fromPlayer) {
  const c = grid[tx] && grid[tx][ty], key = tx + ',' + ty;
  if (c === '?' || c === 'M') {
    grid[tx][ty] = 'U'; if (blockMesh[key]) blockMesh[key].material = MAT.used;
    bump(key);
    if (c === 'M') spawnMushroom(tx, ty);
    else { popCoin(tx + 0.5, ty + 1.2); addCoinCount(); }
  } else if (c === 'B' && fromPlayer) {
    grid[tx][ty] = null; const m = blockMesh[key]; if (m) { levelGroup.remove(m); delete blockMesh[key]; }
    spawnFrag(tx + 0.5, ty + 0.5, MAT.brick); SFX.brk(); addScore(50); addEnergy(1); missionProgress('bricks');
  } else { bump(key); SFX.bump(); }
  enemies.forEach(e => { if (e.alive && Math.abs(e.x - (tx + 0.5)) < 0.8 && Math.abs(e.y - (ty + 1)) < 0.25) killEnemy(e, 'flip'); });
  coins.forEach(cn => { if (!cn.taken && Math.abs(cn.x - (tx + 0.5)) < 0.5 && Math.abs(cn.y - (ty + 1.5)) < 0.6) { cn.taken = true; levelGroup.remove(cn.m); popCoin(cn.x, cn.y); addCoinCount(); } });
}
function doPunch() {
  const p = player, tx = Math.floor(p.x + p.facing * (p.hw + 0.55));
  for (const ty of new Set([Math.floor(p.y + 0.45), Math.floor(p.y + 1.15)])) {
    const c = grid[tx] && grid[tx][ty]; if (c === 'B' || c === '?' || c === 'M') hitBlock(tx, ty, true);
  }
  enemies.forEach(e => {
    const dx = (e.x - p.x) * p.facing;
    if (e.alive && dx > -0.1 && dx < 1.7 && Math.abs(e.y - p.y) < 1.1) killEnemy(e, 'flip');
  });
}
function poundLand() {
  const p = player, ty = Math.floor(p.y - 0.5);
  let broke = false;
  for (let tx = Math.floor(p.x - p.hw + 0.04); tx <= Math.floor(p.x + p.hw - 0.04); tx++) {
    const c = grid[tx] && grid[tx][ty];
    if (c === 'B') { hitBlock(tx, ty, true); broke = true; } else if (c === '?' || c === 'M') hitBlock(tx, ty, true);
  }
  if (broke) { p.pound = true; p.poundT = 1; p.grounded = false; return; }
  shake = 0.35; SFX.pound(); spawnFrag(p.x, p.y + 0.1, MAT.dirt, 5, 4);
  enemies.forEach(e => { if (e.alive && Math.abs(e.x - p.x) < 2.2 && Math.abs(e.y - p.y) < 0.6) killEnemy(e, 'flip'); });
  p.landT = 0.25; play('M_Land', { loop: false, fade: 0.05 });
}


// ================= Poderes de los instructores =================
// Cada instructor tiene un poder (tecla K / botón ⚡) con recarga y efectos propios.
const POWERS = {
  Diego:     { name: 'Estructura Estable', area: 'Backend y Arquitectura', icon: '🛡', color: '#ffd23f', cd: 6, cost: 8, desc: 'Invulnerable 4,5 s: destruye lo que toca' },
  Wilson:    { name: 'Escudo SQL', area: 'Bases de Datos', icon: '🗄', color: '#4ad8ff', cd: 5, cost: 7, desc: 'Onda expansiva que borra los bugs cercanos' },
  Juan:      { name: 'Cálculo de Vector', area: 'Matemáticas e Ing. de Sistemas', icon: '📐', color: '#b36bff', cd: 0.6, cost: 2, desc: 'Dispara figuras geométricas' },
  Carlos:    { name: 'Sprint Ágil', area: 'Metodologías Ágiles', icon: '📋', color: '#39d98a', cd: 8, cost: 8, desc: 'Bugs en cámara lenta 6 s y tú más rápido' },
  Intructor: { name: 'Salto Coordinado', area: 'Formación Integral', icon: '🦘', color: '#ff8a1a', cd: 2, cost: 5, desc: 'Doble salto siempre + súper salto' },
  Jhonny:    { name: 'Dash Idiomático', area: 'Idiomas y Bilingüismo', icon: '💨', color: '#ff4a8a', cd: 0.5, cost: 1, desc: 'Impulso veloz, también en el aire' },
  Fabian:    { name: 'Render </>', area: 'Frontend e Interfaces', icon: '</>', color: '#39a9ff', cd: 3, cost: 5, desc: 'Construye un puente de código' },
};
const curPowerId = () => CHARS[charIdx][0];
// Misiones para desbloquear cada poder (el progreso se guarda por instructor)
const MISSIONS = {
  Diego:     { text: 'Completa un nivel sin recibir daño', goal: 1, stat: 'flawless', unit: 'nivel' },
  Wilson:    { text: 'Derrota 15 bugs', goal: 15, stat: 'kills', unit: 'bugs' },
  Juan:      { text: 'Rompe 15 ladrillos', goal: 15, stat: 'bricks', unit: 'ladrillos' },
  Carlos:    { text: 'Termina un nivel con 150 s o más en el reloj', goal: 1, stat: 'fast', unit: 'nivel' },
  Intructor: { text: 'Toca la punta del asta de la bandera', goal: 1, stat: 'flagTop', unit: 'vez' },
  Jhonny:    { text: 'Recoge 50 monedas', goal: 50, stat: 'coins', unit: 'monedas' },
  Fabian:    { text: 'Completa 3 niveles', goal: 3, stat: 'levels', unit: 'niveles' },
};
const ENERGY_MAX = 10;
function loadPowers() { try { return JSON.parse(localStorage.getItem('senabros_powers') || '{}'); } catch (_) { return {}; } }
const powerData = loadPowers();
// ---- enlaces con js/online.js (cuenta en la nube) ----
window.SENA_RELOAD = () => {   // la nube trajo progreso nuevo: releerlo del almacenamiento local
  Object.assign(game.progress, loadProgress()); game.world = game.progress.world;
  for (const k of Object.keys(powerData)) delete powerData[k];
  Object.assign(powerData, loadPowers()); setPowerUI();
};
window.SENA_BEST_SCORE = () => +(localStorage.getItem('senabros_best') || 0);
function recordBest() {
  if (game.score > window.SENA_BEST_SCORE()) { try { localStorage.setItem('senabros_best', String(game.score)); } catch (_) {} if (window.SenaOnline) SenaOnline.queueSave(); }
}
function pstat(id = curPowerId()) { return powerData[id] || (powerData[id] = { unlocked: false }); }
const powerUnlocked = (id = curPowerId()) => !!pstat(id).unlocked;
function savePowers() { try { localStorage.setItem('senabros_powers', JSON.stringify(powerData)); } catch (_) {} if (window.SenaOnline) SenaOnline.queueSave(); }
// suma progreso a la misión del instructor actual y lo desbloquea al cumplirla
function missionProgress(stat, n = 1) {
  const id = curPowerId(), M = MISSIONS[id], d = pstat(id);
  if (d.unlocked || !M || M.stat !== stat) return;
  d[stat] = (d[stat] || 0) + n; savePowers();
  if (d[stat] >= M.goal) {
    d.unlocked = true; savePowers();
    const P = POWERS[id];
    powerBanner({ icon: P.icon, name: '¡Poder desbloqueado! ' + P.name, color: P.color });
    SFX.oneup(); setTimeout(() => SFX.powerup(), 400); burstColor(player.x, player.y + 1, new T.Color(P.color), 60, 9);
    game.energy = ENERGY_MAX; toast('Tecla K para usarlo', 2200); setPowerUI();
  } else if (M.goal > 1 && (d[stat] % Math.max(1, Math.floor(M.goal / 5)) === 0)) toast(`Misión: ${d[stat]}/${M.goal} ${M.unit}`, 900);
}
// energía: monedas +1, bugs +2, ladrillos +1
function addEnergy(n) { game.energy = Math.min(ENERGY_MAX, (game.energy || 0) + n); }
const curPower = () => POWERS[curPowerId()];

// --- efectos temporales: { obj, t, life, upd(obj, k, dt) -> true para terminar antes } ---
const pfx = [];
function addFx(obj, life, upd) { scene.add(obj); pfx.push({ obj, t: 0, life, upd }); }
function updatePfx(dt) {
  for (let i = pfx.length - 1; i >= 0; i--) {
    const f = pfx[i]; f.t += dt; const k = f.t / f.life;
    if (k >= 1 || f.upd(f.obj, k, dt) === true) { scene.remove(f.obj); pfx.splice(i, 1); }
  }
}
function textSprite(text, color, size = 1) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 128; const g = c.getContext('2d');
  g.font = 'bold 60px "Courier New", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 12; g.strokeStyle = '#08130a'; g.strokeText(text, 512, 64); g.fillStyle = color; g.fillText(text, 512, 64);
  const sp = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(c), transparent: true, depthTest: false }));
  sp.scale.set(8 * size, size, 1); sp.renderOrder = 20; return sp;
}
function floatText(text, color, x, y, size = 1, life = 1.2, vx = 0) {
  const sp = textSprite(text, color, size); sp.position.set(x, y, 2);
  addFx(sp, life, (o, k, dt) => { o.position.y += dt * 1.5; o.position.x += vx * dt; o.material.opacity = 1 - k * k; });
}
function burstColor(x, y, col, n = 30, sp = 6, z = 1.5) {
  const mat = new T.MeshBasicMaterial({ color: col, transparent: true });
  for (let i = 0; i < n; i++) {
    const m = new T.Mesh(sparkGeo, mat), a = Math.random() * 6.283, b = Math.acos(Math.random() * 2 - 1), v = sp * (0.5 + Math.random() * 0.6);
    m.position.set(x, y, z); scene.add(m);
    sparks.push({ m, mat, vx: Math.sin(b) * Math.cos(a) * v, vy: Math.cos(b) * v, vz: Math.sin(b) * Math.sin(a) * v * 0.4, life: 0.6 + Math.random() * 0.5 });
  }
}
function ringFx(x, y, col, { flat = false, from = 0.3, to = 4, life = 0.6, width = 0.18, z = 0.5 } = {}) {
  const m = new T.Mesh(new T.RingGeometry(1 - width, 1, 64), new T.MeshBasicMaterial({ color: col, transparent: true, side: T.DoubleSide, depthWrite: false }));
  m.position.set(x, y, z); if (flat) m.rotation.x = -Math.PI / 2;
  addFx(m, life, (o, k) => { const r = from + (to - from) * (1 - (1 - k) * (1 - k)); o.scale.set(r, r, r); o.material.opacity = 1 - k; });
  return m;
}
const powerHud = document.getElementById('powerHud'), phName = document.getElementById('phName'), phState = document.getElementById('phState'), phIcon = document.getElementById('phIcon');
const tPow = document.getElementById('tPow'), tPowIcon = document.getElementById('tPowIcon');
const sprintFx = document.getElementById('sprintFx'), sprintTEl = document.getElementById('sprintT');
function powerBanner(P) {
  const b = document.getElementById('powerBanner'), f = document.getElementById('powerFlash');
  document.getElementById('pbIcon').textContent = P.icon; document.getElementById('pbName').textContent = P.name.toUpperCase();
  b.style.setProperty('--pc', P.color); f.style.setProperty('--pc', P.color);
  b.classList.remove('show'); f.classList.remove('on'); void b.offsetWidth; b.classList.add('show'); f.classList.add('on');
}
function setPowerUI() {   // icono/nombre/color del poder del personaje actual
  const P = curPower(); if (!P) return;
  [powerHud, tPow].forEach(el => el && el.style.setProperty('--pc', P.color));
  phIcon.textContent = P.icon; phName.textContent = P.name.toUpperCase(); if (tPowIcon) tPowIcon.textContent = P.icon;
  const role = document.getElementById('charRole'), cp = document.getElementById('charPower');
  if (role) role.textContent = P.area;
  const id = curPowerId(), M = MISSIONS[id], d = pstat(id), nm = P.name.replace('<', '&lt;').replace('>', '&gt;');
  if (cp) cp.innerHTML = powerUnlocked(id) ? `${P.icon} ${nm} <span class="ok">✔</span><small>${P.desc}</small>`
    : `🔒 ${nm}<small>Misión: ${M.text} (${Math.min(d[M.stat] || 0, M.goal)}/${M.goal})</small>`;
}
function updatePowerUI() {
  const P = curPower(); if (!P) return;
  const id = curPowerId(), unlocked = powerUnlocked(id), en = game.energy || 0;
  const pct = unlocked ? Math.round(Math.min(1, en / P.cost) * 100) : 0, ready = unlocked && en >= P.cost && player.powerCD <= 0;
  powerHud.style.setProperty('--p', pct); powerHud.classList.toggle('ready', ready); powerHud.classList.toggle('locked', !unlocked);
  if (!unlocked) { const M = MISSIONS[id], d = pstat(id); phState.textContent = `🔒 misión ${Math.min(d[M.stat] || 0, M.goal)}/${M.goal} ${M.unit}`; }
  else phState.textContent = ready ? 'LISTO · tecla K' : `energía ${en}/${P.cost}`;
  phIcon.textContent = unlocked ? P.icon : '🔒'; if (tPowIcon) tPowIcon.textContent = unlocked ? P.icon : '🔒';
  if (tPow) { tPow.style.setProperty('--p', pct); tPow.classList.toggle('ready', ready); }
  const on = player.slowT > 0 && game.state === 'play';
  sprintFx.classList.toggle('on', on); if (on) sprintTEl.textContent = Math.ceil(player.slowT);
}
// golpear a un enemigo con un poder (al jefe le quita una vida con invulnerabilidad)
function hurtEnemy(e) {
  if (!e.alive) return false;
  if (e.def.kind === 'boss') {
    if (e.inv > 0) return false;
    e.hp--; e.inv = 1.4; SFX.bosshit(); shake = 0.5;
    if (e.hp <= 0) { killEnemy(e, 'boss'); bossDefeated(); } else toast(e.hp === 1 ? '¡UNO MÁS!' : '¡BIEN!', 800);
    return true;
  }
  if (e.type === 'bullet') { e.alive = false; e.mode = 'gone'; levelGroup.remove(e.mesh); burstColor(e.x, e.y + 0.3, 0x333333, 10, 4); addScore(100); return true; }
  killEnemy(e, 'flip'); return true;
}
const geoShapes = [new T.TetrahedronGeometry(0.42), new T.OctahedronGeometry(0.4), new T.BoxGeometry(0.55, 0.55, 0.55), new T.IcosahedronGeometry(0.4)];
let shapeIdx = 0;
function usePower() {
  const p = player, P = curPower(), id = curPowerId();
  if (!P || p.powerCD > 0 || p.dead || game.state !== 'play') return;
  if (!powerUnlocked(id)) { const M = MISSIONS[id], d = pstat(id); toast(`🔒 ${M.text} (${d[M.stat] || 0}/${M.goal})`, 1800); SFX.bump(); p.powerCD = 1; return; }
  if ((game.energy || 0) < P.cost) { toast(`Energía ${game.energy || 0}/${P.cost}: recoge monedas y vence bugs`, 1300); SFX.bump(); p.powerCD = 0.6; return; }
  const cx = p.x, cy = p.y + p.h * 0.55, col = new T.Color(P.color);
  if (id === 'Diego') {
    // Estructura Estable: cúpula geodésica dorada + núcleo, invulnerable y destruye lo que toca
    p.shieldT = 4.5; p.powerAnimT = 0.7; play('M_Victory', { loop: false, fade: 0.08, speed: 1.6 });
    const g = new T.Group();
    const cage = new T.Mesh(new T.IcosahedronGeometry(1.1, 1), new T.MeshBasicMaterial({ color: 0xffd23f, wireframe: true, transparent: true }));
    const glow = new T.Mesh(new T.IcosahedronGeometry(1.0, 2), new T.MeshBasicMaterial({ color: 0xffa000, transparent: true, opacity: 0.35, depthWrite: false, blending: T.AdditiveBlending }));
    cage.material.color.set(0xffc400); cage.material.blending = T.AdditiveBlending;
    const cage2 = new T.Mesh(new T.OctahedronGeometry(1.35, 0), new T.MeshBasicMaterial({ color: 0xfff2a0, wireframe: true, transparent: true, opacity: 0.6 }));
    const light = new T.PointLight(0xffc040, 1.6, 6, 1.6);
    g.add(cage, glow, cage2, light);
    addFx(g, 4.5, (o, k, dt) => {
      const sc = (player.big ? 1.35 : 1) * (k < 0.08 ? k / 0.08 : 1) * (1 + Math.sin(k * 60) * 0.03);
      o.position.set(player.x, player.y + player.h * 0.55, 0.2); o.scale.setScalar(sc);
      cage.rotation.y += dt * 1.6; cage.rotation.x += dt * 0.7; cage2.rotation.y -= dt * 2.2; cage2.rotation.z += dt;
      const blink = k > 0.75 && Math.floor(k * 40) % 2 === 0;   // parpadea cuando se va a acabar
      cage.visible = cage2.visible = !blink; glow.material.opacity = (0.28 + Math.sin(k * 40) * 0.08) * (1 - k * 0.5);
      if (player.dead) return true;
    });
    burstColor(cx, cy, 0xffd23f, 50, 8); ringFx(cx, cy, 0xffd23f, { to: 5 }); ringFx(p.x, p.y + 0.05, 0xffd23f, { flat: true, to: 4 });
    floatText('{ ESTABLE }', '#ffd23f', cx, cy + 1.2, 0.9); SFX.powerup(); shake = 0.25;
  } else if (id === 'Wilson') {
    // Escudo SQL: golpe al suelo + onda expansiva que borra bugs, apaga fuego y destruye balas
    p.powerAnimT = 0.45; play('M_Land', { loop: false, fade: 0.04 }); SFX.pound(); setTimeout(() => SFX.bosshit(), 90); shake = 0.7;
    const R = 8.5, hit = new Set();
    const wave = ringFx(cx, cy, 0x4ad8ff, { to: R, life: 0.75, width: 0.12, z: 0.6 });
    ringFx(cx, cy, 0xffffff, { to: R * 0.85, life: 0.6, width: 0.05, z: 0.7 });
    ringFx(p.x, p.y + 0.06, 0x4ad8ff, { flat: true, to: R, life: 0.8, width: 0.15 });
    const grid = new T.Mesh(new T.SphereGeometry(1, 18, 12), new T.MeshBasicMaterial({ color: 0x4ad8ff, wireframe: true, transparent: true }));
    grid.position.set(cx, cy, 0);
    addFx(grid, 0.75, (o, k) => {
      const r = 0.3 + R * (1 - (1 - k) * (1 - k)); o.scale.setScalar(r); o.rotation.y += 0.05; o.material.opacity = 0.7 * (1 - k);
      enemies.forEach(e => { if (e.alive && !hit.has(e) && Math.hypot(e.x - cx, e.y + e.h / 2 - cy) < r) { hit.add(e); hurtEnemy(e); } });
      fires.forEach(f => { if (f.t <= 0 && Math.hypot(f.x - cx, f.y - cy) < r) { f.t = 2.5; burstColor(f.x, f.y, 0x4ad8ff, 8, 3); } });
    });
    ['DELETE FROM bugs;', 'DROP TABLE errores;', 'COMMIT;', 'SELECT * FROM paz;'].forEach((t, i) =>
      setTimeout(() => floatText(t, '#bff4ff', cx + (i - 1.5) * 2.4, cy + 1 + (i % 2) * 0.8, 0.7, 1.4), i * 110));
    burstColor(cx, cy, 0x4ad8ff, 60, 10);
  } else if (id === 'Juan') {
    // Cálculo de Vector: figura geométrica que viaja en línea recta, con estela y flecha del vector
    p.powerAnimT = 0.3; p.punchT = 0; play('M_Punch', { loop: false, fade: 0.04, speed: 2 }); SFX.fire();
    const dir = p.facing, geo = geoShapes[shapeIdx++ % geoShapes.length];
    const g = new T.Group();
    const solidM = new T.Mesh(geo, new T.MeshStandardMaterial({ color: 0xb36bff, emissive: 0x6a1ad8, emissiveIntensity: 1.2, roughness: 0.3, metalness: 0.3 }));
    const wire = new T.Mesh(geo, new T.MeshBasicMaterial({ color: 0xffffff, wireframe: true })); wire.scale.setScalar(1.15);
    g.add(solidM, wire, new T.PointLight(0xb36bff, 1.2, 4, 1.6));
    g.position.set(p.x + dir * 0.6, cy, 0.3);
    let trailT = 0;
    addFx(g, 0.95, (o, k, dt) => {
      o.position.x += dir * 17 * dt; o.rotation.x += dt * 9; o.rotation.y += dt * 7;
      trailT -= dt;
      if (trailT <= 0) {   // estela de triángulos
        trailT = 0.03;
        const tr = new T.Mesh(geoShapes[0], new T.MeshBasicMaterial({ color: 0xd7a8ff, transparent: true, wireframe: Math.random() < 0.5 }));
        tr.position.copy(o.position); tr.scale.setScalar(0.4);
        addFx(tr, 0.35, (q, kk) => { q.scale.setScalar(0.4 * (1 - kk)); q.material.opacity = 1 - kk; q.rotation.z += 0.2; });
      }
      const tx = Math.floor(o.position.x), ty = Math.floor(o.position.y);
      if (grid[tx] && grid[tx][ty]) {
        const c = grid[tx][ty]; if (c === 'B' || c === '?' || c === 'M') hitBlock(tx, ty, true);
        burstColor(o.position.x, o.position.y, 0xb36bff, 18, 5); return true;
      }
      for (const e of enemies) if (e.alive && Math.abs(e.x - o.position.x) < e.hw + 0.4 && o.position.y > e.y - 0.2 && o.position.y < e.y + e.h + 0.2) {
        if (hurtEnemy(e)) { burstColor(o.position.x, o.position.y, 0xb36bff, 24, 6); floatText('✓ Q.E.D.', '#e2c8ff', o.position.x, o.position.y + 0.8, 0.6, 0.9); return true; }
      }
    });
    // flecha del vector
    const len = 3.2, arrow = new T.Group();
    const shaft = new T.Mesh(new T.BoxGeometry(len, 0.06, 0.06), new T.MeshBasicMaterial({ color: 0xe2c8ff, transparent: true }));
    shaft.position.x = dir * len / 2; arrow.add(shaft);
    const head = new T.Mesh(new T.ConeGeometry(0.16, 0.4, 10), shaft.material); head.rotation.z = -dir * Math.PI / 2; head.position.x = dir * (len + 0.15); arrow.add(head);
    arrow.position.set(p.x + dir * 0.4, cy + 0.75, 0.5);
    addFx(arrow, 0.5, (o, k) => { shaft.material.opacity = 1 - k; o.scale.x = 0.3 + k * 0.7; });
    floatText('v = (' + (dir * 17) + ', 0)', '#e2c8ff', p.x + dir * 2, cy + 1.45, 0.55, 0.8);
  } else if (id === 'Carlos') {
    // Sprint Ágil: el tiempo de los bugs va a 30 % durante 6 s, tú vas más rápido; notas adhesivas orbitan
    p.slowT = 6; p.powerAnimT = 0.6; play('M_Victory', { loop: false, fade: 0.08, speed: 1.8 }); SFX.powerup();
    const notes = new T.Group(), cols = ['#ffe680', '#ff9ad0', '#9af0b0', '#9ad0ff'], labels = ['US-1', 'TO DO', 'DONE', 'SPRINT'];
    labels.forEach((l, i) => {
      const c = document.createElement('canvas'); c.width = c.height = 64; const g2 = c.getContext('2d');
      g2.fillStyle = cols[i]; g2.fillRect(0, 0, 64, 64); g2.fillStyle = '#333'; g2.font = 'bold 14px sans-serif'; g2.textAlign = 'center'; g2.fillText(l, 32, 36);
      const n = new T.Mesh(new T.PlaneGeometry(0.55, 0.55), new T.MeshBasicMaterial({ map: new T.CanvasTexture(c), side: T.DoubleSide, transparent: true }));
      n.userData.a = i / 4 * Math.PI * 2; notes.add(n);
    });
    addFx(notes, 6, (o, k, dt) => {
      o.position.set(player.x, player.y + player.h * 0.55, 0.3);
      o.children.forEach(n => { n.userData.a += dt * 2.4; n.position.set(Math.cos(n.userData.a) * 1.2, Math.sin(n.userData.a * 2) * 0.35, Math.sin(n.userData.a) * 0.8); n.rotation.y = -n.userData.a; n.material.opacity = k > 0.85 ? (1 - k) / 0.15 : 1; });
      if (player.dead) return true;
    });
    ringFx(cx, cy, 0x39d98a, { to: 7, life: 0.9 }); burstColor(cx, cy, 0x39d98a, 40, 7);
    floatText('¡SPRINT!', '#9af0b0', cx, cy + 1.3, 1);
  } else if (id === 'Intructor') {
    // Salto Coordinado (súper salto); el doble salto es pasivo
    p.vy = 27; p.grounded = false; p.pound = false; p.airJumps = 1; p.powerAnimT = 0.4; play('M_Jump', { loop: false, fade: 0.04 }); SFX.spring();
    for (let i = 0; i < 3; i++) setTimeout(() => ringFx(player.x, player.y + 0.1, 0xff8a1a, { flat: true, from: 0.4, to: 2.4 + i, life: 0.5 }), i * 70);
    burstColor(p.x, p.y + 0.2, 0xff8a1a, 40, 7);
    floatText('¡COORDINADOS!', '#ffd0a0', cx, cy + 1, 0.9);
  } else if (id === 'Jhonny') {
    // Dash Idiomático: un impulso por salto en el aire (en el suelo, ilimitado con recarga)
    if (!p.grounded && !p.airDash) return;
    if (!p.grounded) p.airDash = false;
    p.dashT = 0.24; p.vy = 0; p.pound = false; SFX.jump(); setTimeout(() => SFX.swim(), 40);
    const words = ['GO!', 'FAST!', 'NEXT!', "LET'S GO!", 'RUN!', 'WOW!'];
    floatText(words[Math.floor(Math.random() * words.length)], '#ffc0dc', cx, cy + 1, 0.8, 0.9, -p.facing * 2);
    ringFx(cx, cy, 0xff4a8a, { to: 2.5, life: 0.35 });
  } else if (id === 'Fabian') {
    // Render </>: puente de paneles de código que dura 6 s
    const w = p.grounded ? 6 : 4, top = p.grounded ? p.y : p.y - 0.02;
    const x0 = p.grounded ? (p.facing > 0 ? p.x + 0.3 : p.x - 0.3 - w) : p.x - w / 2;
    if (!p.grounded) { p.vy = Math.max(p.vy, 0); }
    p.powerAnimT = 0.35; play('M_Punch', { loop: false, fade: 0.04, speed: 2 });
    const tags = ['</>', '{ }', '<div>', 'UI', 'CSS', '<app>'], g = new T.Group();
    for (let i = 0; i < w; i++) {
      const c = document.createElement('canvas'); c.width = 128; c.height = 64; const g2 = c.getContext('2d');
      g2.fillStyle = '#0a2440'; g2.fillRect(0, 0, 128, 64); g2.strokeStyle = '#39a9ff'; g2.lineWidth = 6; g2.strokeRect(3, 3, 122, 58);
      g2.fillStyle = '#9fd8ff'; g2.font = 'bold 30px monospace'; g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.fillText(tags[i % tags.length], 64, 34);
      const tex = new T.CanvasTexture(c);
      const m = new T.Mesh(new T.BoxGeometry(0.96, 0.4, 1.6), new T.MeshStandardMaterial({ map: tex, emissive: 0x39a9ff, emissiveMap: tex, emissiveIntensity: 0.9, transparent: true }));
      const ord = p.facing > 0 || !p.grounded ? i : w - 1 - i;
      m.position.x = -w / 2 + 0.5 + i; m.scale.setScalar(0.01); m.userData.d = ord * 0.06; g.add(m);
    }
    levelGroup.add(g);
    const pl = { x: x0, y: top, w, type: 'tmp', life: 6, mesh: g, x0, y0: top, range: 0, speed: 0, t: 0, state: 'idle' };
    g.position.set(x0 + w / 2, top - 0.2, 0); plats.push(pl);
    tags.forEach((t, i) => i < 3 && setTimeout(() => floatText(t, '#9fd8ff', x0 + w / 2 + (i - 1) * 1.6, top + 1.2, 0.6, 0.9), i * 90));
    for (let i = 0; i < w; i++) setTimeout(() => beep(900 + i * 120, 0.05, 'square', 0.03), i * 60);
    burstColor(x0 + w / 2, top, 0x39a9ff, 30, 5);
  }
  p.powerCD = P.cd; game.energy -= P.cost;
  if (id !== 'Jhonny' && id !== 'Juan') powerBanner(P);
  else if (!p.bannerShown) { powerBanner(P); p.bannerShown = true; }
}
// doble salto pasivo del Instructor
function doubleJump(p) {
  p.airJumps--; p.vy = JUMP * 0.92; p.jumpBuf = 0; SFX.jump(); setTimeout(() => SFX.spring(), 30);
  play('M_Jump', { loop: false, fade: 0.04 });
  ringFx(p.x, p.y + 0.05, 0xff8a1a, { flat: true, from: 0.3, to: 2, life: 0.4 });
  ringFx(p.x, p.y + 0.3, 0xffd0a0, { from: 0.2, to: 1.4, life: 0.35 });
  burstColor(p.x, p.y + 0.1, 0xff8a1a, 14, 4);
}
// estela del dash (Jhonny): partículas rosas + líneas de velocidad
function dashTrail(p) {
  const y = p.y + p.h * (0.2 + Math.random() * 0.7);
  const line = new T.Mesh(new T.BoxGeometry(1.4, 0.05, 0.05), new T.MeshBasicMaterial({ color: Math.random() < 0.5 ? 0xff4a8a : 0xffffff, transparent: true }));
  line.position.set(p.x - p.facing * 0.8, y, 0.4);
  addFx(line, 0.3, (o, k) => { o.material.opacity = 1 - k; o.scale.x = 1 - k * 0.6; });
  burstColor(p.x - p.facing * 0.3, p.y + p.h * 0.5, 0xff4a8a, 3, 1.5);
}

// ================= Entrada =================
const keys = {}, pressed = {};
const MAP = { jump: ['Space', 'ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'], punch: ['KeyJ'], power: ['KeyK'] };
addEventListener('keydown', e => {
  if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;   // escribiendo en el formulario de cuenta
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {} }
  if (e.repeat) return;
  keys[e.code] = true;
  for (const k in MAP) if (MAP[k].includes(e.code)) pressed[k] = true;
  if (e.code === 'KeyM') muted = !muted;
  if (inMenu()) {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') selectChar(charIdx - 1);
    if (e.code === 'ArrowRight' || e.code === 'KeyD') selectChar(charIdx + 1);
  }
  if (e.code === 'Enter' && inMenu()) startWithTransition();
  if (game.state === 'glory' && (e.code === 'Enter' || e.code === 'Space')) gloryContinue();
  if (e.code === 'KeyR' && game.state === 'play' && !charLoading) startGame();
  if (game.state === 'map') {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') mapMove(-1, 0);
    if (e.code === 'ArrowRight' || e.code === 'KeyD') mapMove(1, 0);
    if (e.code === 'ArrowUp' || e.code === 'KeyW') mapMove(0, -1);
    if (e.code === 'ArrowDown' || e.code === 'KeyS') mapMove(0, 1);
    if (e.code === 'Enter' || e.code === 'Space') mapEnter();
    if (e.code === 'Escape') transition(() => showTitle());
  } else if (e.code === 'Escape' && game.state === 'play') transition(() => showMap({ banner: false }));
});
addEventListener('keyup', e => { keys[e.code] = false; });
const held = (...c) => c.some(k => keys[k]);
const inMenu = () => game.state === 'title' || game.state === 'over' || (game.state === 'won' && overlay.classList.contains('show'));

// ================= Update =================
function approach(v, t, d) { return v < t ? Math.min(v + d, t) : Math.max(v - d, t); }

function updatePlayer(dt) {
  const p = player;
  if (p.dead) {
    p.deadT += dt;
    if (p.deadT > 0.55) { if (!p.launched) { p.vy = 14; p.launched = true; } p.vy -= GRAV * dt; p.y += p.vy * dt; }
    if (p.deadT > 3.2) { p.launched = false; afterDeath(); }
    return;
  }
  if (game.state === 'win') {
    game.winT += dt;
    if (p.y > 3) { p.y = Math.max(3, p.y - 7 * dt); flag.userData.cloth.position.y = Math.max(3.8, flag.userData.cloth.position.y - 7 * dt); }
    else if (game.winT > 0.3 && curName !== 'M_Victory' && curName !== 'M_Walk') { p.y = 3; play('M_Walk'); p.facing = 1; }
    if (curName === 'M_Walk') {
      p.vy -= GRAV * dt; moveX(p, 3 * dt); const r = moveY(p, p.vy * dt); p.grounded = !!(r && r.ground);
      if (p.x > FLAGX + 4.5) { play('M_Victory', { loop: false }); SFX.win(); game.state = 'won'; addScore(game.time * 50);
        toast('¡NIVEL COMPLETADO!', 4000);
        setTimeout(completeLevel, 2800); }
    }
    return;
  }
  if (game.state !== 'play') return;

  for (const k of ['powerCD', 'shieldT', 'slowT', 'powerAnimT']) if (p[k] > 0) p[k] = Math.max(0, p[k] - dt);
  if (pressed.power) usePower();
  const left = held('ArrowLeft', 'KeyA'), right = held('ArrowRight', 'KeyD');
  const run = held('ShiftLeft', 'ShiftRight'), down = held('ArrowDown', 'KeyS'), jumpHeld = held('Space', 'ArrowUp', 'KeyW');

  if (p.pound) {
    p.poundT += dt;
    if (p.poundT < 0.4) { p.vx = 0; p.vy = 0; } else p.vy = -26;
  } else {
    p.crouch = p.grounded && down;
    let dir = (right ? 1 : 0) - (left ? 1 : 0);
    if (p.crouch || (p.punchT > 0 && p.grounded)) dir = 0;
    const max = (run ? RUN : WALK) * (p.slowT > 0 ? 1.35 : 1);
    if (dir) {
      const turning = Math.sign(p.vx) === -dir && Math.abs(p.vx) > 1;
      const acc = p.grounded ? (turning ? 50 : 26) : 18;
      p.vx += dir * acc * dt;
      if (Math.abs(p.vx) > max) p.vx = approach(p.vx, dir * max, 30 * dt);
      p.facing = dir;
    } else p.vx = approach(p.vx, 0, (p.grounded ? (p.crouch ? 10 : 28) : 5) * dt);

    if (WATER_LVL) {
      // nado: cada pulsación de salto es una brazada; se hunde lento; S baja más rápido
      if (Math.abs(p.vx) > SWIM_MAX) p.vx = approach(p.vx, Math.sign(p.vx) * SWIM_MAX, 20 * dt);
      if (pressed.jump && !p.crouch) {
        p.vy = p.grounded ? 9 : 7.2; p.grounded = false;
        SFX.swim(); p.strokeT = 0.45; spawnBubbles(p, 3);
      }
      p.vy = Math.max(down && !p.grounded ? -7 : -3.6, p.vy - 11 * dt);
      if (p.y + p.h > WATER_TOP - 0.1 && p.vy > 0) { p.vy = 0; p.y = WATER_TOP - 0.1 - p.h; }
      bubbleT -= dt; if (bubbleT <= 0) { bubbleT = 0.5 + Math.random() * 0.6; spawnBubbles(p, 1); }
    } else {
    if (pressed.jump) p.jumpBuf = 0.13;
    p.jumpBuf -= dt; p.coyote = p.grounded ? 0.1 : p.coyote - dt;
    if (p.jumpBuf > 0 && p.coyote > 0 && !p.crouch) {
      p.vy = JUMP + Math.abs(p.vx) * 0.22; p.grounded = false; p.coyote = 0; p.jumpBuf = 0;
      SFX.jump(); play('M_Jump', { loop: false, fade: 0.05 });
    } else if (pressed.jump && !p.grounded && p.coyote <= 0 && p.airJumps > 0 && !p.crouch && curPowerId() === 'Intructor' && powerUnlocked('Intructor')) doubleJump(p);
    const g = (p.vy > 0 && jumpHeld) ? GRAV : GRAV * 1.8;
    p.vy = Math.max(-MAXFALL, p.vy - g * dt);
    }

    if (pressed.down && !p.grounded && !WATER_LVL) { p.pound = true; p.poundT = 0; p.vx = 0; p.vy = 0; play('M_GroundPound', { loop: false, fade: 0.05, speed: 1.35 }); SFX.punch(); }
    if (pressed.punch && p.punchT <= 0 && !p.crouch && !p.pound) { p.punchT = 0.45; p.punchHit = false; play('M_Punch', { loop: false, fade: 0.05, speed: 1.4 }); SFX.punch(); }
  }
  if (p.dashT > 0) { p.dashT -= dt; p.vx = p.facing * 21; p.vy = 0; p.pound = false; dashTrail(p); if (p.dashT <= 0) p.vx = p.facing * 9; }
  if (p.punchT > 0) { p.punchT -= dt; if (!p.punchHit && p.punchT < 0.3) { p.punchHit = true; doPunch(); } }
  const S = p.big ? SIZE.big : SIZE.small;
  p.hw = S.hw; p.h = p.crouch ? S.hc : S.h;

  const wasGround = p.grounded, fallV = p.vy;
  if (moveX(p, p.vx * dt)) p.vx = 0;
  const yPrev = p.y;
  const r = moveY(p, p.vy * dt);
  p.grounded = !!(r && r.ground);
  p.onPlat = null;
  if (!p.grounded && p.vy <= 0) {
    for (const pl of plats) {
      if (pl.y < -2) continue;
      if (p.x + p.hw > pl.x + 0.05 && p.x - p.hw < pl.x + pl.w - 0.05 && yPrev >= pl.y - 0.08 && p.y <= pl.y + 0.001) {
        p.y = pl.y; p.vy = 0; p.grounded = true; p.onPlat = pl;
        if (pl.type === 'f' && pl.state === 'idle') { pl.state = 'shake'; pl.fallT = 0.45; }
        break;
      }
    }
    for (const sp of springs) {
      if (Math.abs(p.x - sp.x) < 0.42 + p.hw && yPrev >= sp.top - 0.15 && p.y <= sp.top) {
        p.y = sp.top; p.vy = 29; p.grounded = false; p.pound = false; sp.sq = 0.25; SFX.spring();
        play('M_Jump', { loop: false, fade: 0.05 }); break;
      }
    }
  }
  if (r && r.head) hitBlock(r.tx, r.ty, p.big);   // pequeño solo golpea; grande rompe ladrillos
  if (p.grounded && !wasGround) {
    if (p.pound) { p.pound = false; poundLand(); }
    else if (fallV < -10) p.landT = 0.14;
  }
  if (p.grounded) { p.airDash = true; p.airJumps = 1; }
  p.landT -= dt; p.invT -= dt;
  const cpx = levelSpec(game.level).checkpoint;
  if (p.x > cpx && game.checkpoint < cpx) { game.checkpoint = cpx; toast('CHECKPOINT', 1000); }
  if (p.y < (levelSpec(game.level).deathY ?? -3)) { if (levelSpec(game.level).lava) spawnFrag(p.x, 1, MAT.lava, 8, 5); die(); }
  if (p.x >= FLAGX + 0.1 && p.y < 12) startWin();

  // monedas
  coins.forEach(c => {
    if (!c.taken && Math.abs(c.x - p.x) < 0.65 && Math.abs(c.y - (p.y + 0.7)) < 1.0) { c.taken = true; levelGroup.remove(c.m); addCoinCount(); }
  });
}

function chooseAnim() {
  const p = player;
  if (p.dead || game.state !== 'play' || p.pound || p.punchT > 0 || p.powerAnimT > 0) return;
  if (p.dashT > 0) { play('M_Run', { speed: 2.4, fade: 0.05 }); return; }
  if (!p.grounded && WATER_LVL) {
    play(actions.M_Swim ? 'M_Swim' : 'M_Fall', { speed: p.strokeT > 0 ? 2.3 : 0.85, fade: 0.25 });
    return;
  }
  if (!p.grounded) {
    const n = p.vy > -2 ? 'M_Jump' : 'M_Fall';
    if (n === 'M_Jump' && curName !== 'M_Jump') play('M_Jump', { loop: false, fade: 0.08 });
    else if (n === 'M_Fall' && curName !== 'M_Fall') play('M_Fall', { fade: 0.2 });
    return;
  }
  const s = Math.abs(p.vx);
  if (p.landT > 0 && s < 1) { if (curName !== 'M_Land') play('M_Land', { loop: false, fade: 0.05 }); }
  else if (p.crouch) { if (curName !== 'M_Crouch') play('M_Crouch', { loop: false, fade: 0.08 }); }
  else if (s > 5.6) play('M_Run', { speed: Math.max(0.8, s / 7.5), fade: 0.15 });
  else if (s > 0.35) play('M_Walk', { speed: Math.min(1.7, Math.max(0.7, s / 3.0)), fade: 0.15 });
  else if (curName !== 'M_Idle') play('M_Idle', { fade: 0.2 });
}

function updateEnemies(dt) {
  const p = player;
  enemies.forEach(e => {
    if (!e.alive) {
      e.deadT += dt;
      if (e.mode === 'flip') { e.vy -= GRAV * dt; e.x += e.vx * dt; e.y += e.vy * dt; }
      if (e.deadT > (e.mode === 'stomp' ? 0.5 : 2) && e.mesh.parent) levelGroup.remove(e.mesh);
      e.mesh.position.set(e.x, e.y, 0); return;
    }
    if (!e.active) { if (Math.abs(e.x - p.x) < 15) e.active = true; else return; }
    e.t += dt;
    const kind = e.def.kind;
    if (kind === 'boss') { updateBoss(e, dt); return; }
    if (kind === 'bullet') {
      e.x += e.dir * e.def.speed * dt;
      if (Math.abs(e.x - e.x0) > 28) { e.alive = false; e.mode = 'gone'; levelGroup.remove(e.mesh); return; }
    } else if (kind === 'flyer') {
      // patrulla en el aire con onda senoidal; ignora la gravedad
      if (moveX(e, e.dir * e.def.speed * dt) || Math.abs(e.x - e.x0) > 3) { e.dir *= -1; e.x = e.x0 + Math.sign(e.x - e.x0) * Math.min(3, Math.abs(e.x - e.x0)); }
      e.y = e.y0 + Math.sin(e.t * 2.2) * 0.9;
    } else {
      let speed = e.def.speed;
      if (kind === 'charger') {
        const dx = p.x - e.x;
        e.charging = !p.dead && Math.abs(dx) < 6.5 && Math.abs(p.y - e.y) < 1.6;
        if (e.charging) { e.dir = Math.sign(dx) || e.dir; speed = 4.3; }
      }
      e.vy = Math.max(-MAXFALL, e.vy - GRAV * dt);
      if (moveX(e, e.dir * speed * dt)) e.dir *= -1;
      moveY(e, e.vy * dt);
    }
    if (e.y < -3) { e.alive = false; e.mode = 'fall'; }
    // tocar al jugador
    if (!p.dead && game.state === 'play' && Math.abs(e.x - p.x) < e.hw + p.hw && p.y < e.y + e.h && p.y + p.h > e.y) {
      if (p.shieldT > 0 || p.dashT > 0) { if (hurtEnemy(e)) burstColor(e.x, e.y + e.h / 2, new T.Color(curPower().color), 20, 6); }
      else if (p.pound || (p.vy < 0 && p.y > e.y + e.h * 0.35)) {
        killEnemy(e, 'stomp');
        if (!p.pound) { p.vy = held('Space', 'ArrowUp', 'KeyW') ? 15 : 10; play('M_Jump', { loop: false, fade: 0.05 }); }
      } else if (p.invT <= 0) damage();
    }
    // animación procedural (los modelos no tienen esqueleto)
    const t = e.t, b = e.body, s = e.def.scale;
    e.rotY += (e.dir * 0.6 - e.rotY) * Math.min(1, dt * 8);     // mira un poco hacia donde camina
    b.rotation.y = e.rotY;
    if (kind === 'walker') {          // araña: pasitos rápidos
      b.position.y = Math.abs(Math.sin(t * 14)) * 0.06; b.rotation.z = Math.sin(t * 14) * 0.05;
      b.scale.set(s, s * (1 + Math.sin(t * 28) * 0.03), s);
    } else if (kind === 'charger') {  // caja con ruedas: traqueteo, se inclina al embestir
      b.position.y = Math.abs(Math.sin(t * (e.charging ? 30 : 12))) * (e.charging ? 0.05 : 0.025);
      b.rotation.z = -e.dir * (e.charging ? 0.18 : 0.04);
    } else if (kind === 'bullet') {   // bala de cañón: gira
      b.rotation.z -= e.dir * dt * 9; b.rotation.y = 0;
    } else {                          // archivo corrupto: glitch
      const glitch = Math.random() < 0.08;
      b.position.set(glitch ? (Math.random() - 0.5) * 0.25 : 0, 0, glitch ? (Math.random() - 0.5) * 0.2 : 0);
      b.scale.set(s * (glitch ? 1 + (Math.random() - 0.5) * 0.3 : 1), s * (1 + Math.sin(t * 6) * 0.04), s);
      b.rotation.z = Math.sin(t * 3) * 0.12;
    }
    e.mesh.position.set(e.x, e.y, 0);
  });
}

function updatePowerups(dt) {
  const p = player;
  for (let i = powerups.length - 1; i >= 0; i--) {
    const u = powerups[i]; u.t += dt;
    if (u.state === 'rise') {                 // sale del bloque
      u.y = u.y0 + Math.min(1, u.t / 0.7);
      if (u.t >= 0.7) { u.state = 'move'; u.mesh.position.z = 0; }
    } else if (game.state === 'play') {       // camina y rebota en paredes
      u.vy = Math.max(-MAXFALL, u.vy - GRAV * dt);
      if (moveX(u, u.dir * 2.6 * dt)) u.dir *= -1;
      moveY(u, u.vy * dt);
    }
    u.mesh.position.x = u.x; u.mesh.position.y = u.y;
    u.mesh.rotation.y = Math.sin(u.t * 4) * 0.25;
    const gone = u.y < -3;
    const touch = !p.dead && game.state === 'play' && Math.abs(u.x - p.x) < u.hw + p.hw && p.y < u.y + u.h && p.y + p.h > u.y;
    if (touch) grow();
    if (touch || gone) { levelGroup.remove(u.mesh); powerups.splice(i, 1); }
  }
}

let camX = 8, camY = 6;
function update(dt) {
  if (game.state === 'map') {
    updateMap(dt);
    if (MAT.lava.map) MAT.lava.map.offset.x = performance.now() / 20000;
    for (const k in pressed) pressed[k] = false;
    if (mixer) mixer.update(dt);
    return;
  }
  if (game.state === 'play' || game.state === 'win' || game.state === 'won') {
    if (game.state === 'play') updatePlats(dt);
    updatePlayer(dt);
    const sf = player.slowT > 0 ? 0.3 : 1;   // Sprint Ágil
    if (game.state === 'play') { updateFires(dt * sf); updateCannons(dt * sf); }
    if (game.state === 'play') { chooseAnim(); updateEnemies(dt * sf); game.time -= dt; if (game.time <= 0 && !player.dead) { game.time = 0; die(); } }
  }
  for (const k in pressed) pressed[k] = false;

  // modelo
  if (model) {
    player.strokeT = (player.strokeT || 0) - dt;
    // nadando: el cuerpo se acuesta (gira sobre el centro de la caja de colisión)
    const swimming = WATER_LVL && game.state === 'play' && !player.dead && !player.grounded;
    player.tilt = (player.tilt || 0) + ((swimming ? -1.15 : player.dashT > 0 ? -0.6 : 0) - (player.tilt || 0)) * Math.min(1, dt * (player.dashT > 0 ? 20 : 6));
    const hh = player.h * 0.5, fs = player.facing > 0 ? 1 : -1;
    model.position.set(player.x + fs * hh * Math.sin(player.tilt), player.y + hh - hh * Math.cos(player.tilt), 0);
    model.rotation.z = player.tilt;
    const target = (inMenu() && game.state !== 'won') ? -Math.PI / 2 : player.dead ? 0 : (player.facing > 0 ? 0 : -Math.PI);
    player.rot += (target - player.rot) * Math.min(1, dt * 14);
    model.rotation.y = player.rot;
    // tamaño: parpadeo entre chico y grande al crecer/encogerse (como en Mario)
    let sc = player.big ? SIZE.big.scale : SIZE.small.scale;
    if (player.growT > 0) { player.growT -= dt; sc = Math.floor(player.growT * 12) % 2 ? SIZE.small.scale : SIZE.big.scale; }
    model.scale.setScalar(sc);
    if (player.dashT > 0) model.scale.set(sc * 1.25, sc * 0.85, sc);   // estirado del dash
    model.visible = player.dead || player.invT <= 0 || Math.floor(player.invT * 15) % 2 === 0;
    mixer.update(dt);
  }
  // efectos
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i]; f.life -= dt;
    if (f.life <= 0) { scene.remove(f.m); fx.splice(i, 1); continue; }
    f.vy -= (f.coin ? 30 : GRAV) * dt; f.m.position.x += f.vx * dt; f.m.position.y += f.vy * dt;
    if (f.coin) f.m.rotation.y += f.vr * dt; else { f.m.rotation.x += f.vr * dt; f.m.rotation.y += f.vr * dt; }
  }
  for (let i = bumps.length - 1; i >= 0; i--) {
    const b = bumps[i]; b.t += dt;
    b.m.position.y = b.y0 + Math.sin(Math.min(1, b.t / 0.18) * Math.PI) * 0.3;
    if (b.t > 0.18) { b.m.position.y = b.y0; bumps.splice(i, 1); }
  }
  const tnow = performance.now() / 1000;
  coins.forEach(c => { if (!c.taken) { c.m.rotation.y = tnow * 2.2 + c.ph; c.m.position.y = c.y + Math.sin(tnow * 3 + c.ph) * 0.08; } });
  updatePowerups(dt); updateLevelFx(dt); updateSprings(dt); updateSparks(dt); updatePfx(dt); updatePowerUI();
  if (MAT.lava.map) { MAT.lava.map.offset.x = tnow * 0.05; MAT.lava.map.offset.y = Math.sin(tnow * 0.7) * 0.04; MAT.lava.emissiveIntensity = 0.8 + Math.sin(tnow * 3) * 0.15; }
  if (flag) flag.userData.cloth.rotation.y = Math.sin(tnow * 3) * 0.15;

  // cámara
  if (inMenu() && game.state !== 'won') {   // menú: primer plano del personaje elegido
    camera.position.set(player.x - 1.5 + Math.sin(tnow * 0.35) * 0.4, player.y + 1.0 + Math.sin(tnow * 0.5) * 0.12, 5.0 + Math.sin(tnow * 0.27) * 0.3);
    camera.lookAt(player.x - 1.5, player.y + 0.75, 0);
    sun.position.set(player.x + 6, 16, 12); sun.target.position.set(player.x, 2, 0);
    camX = player.x; camY = 5;
    updateBackdrop(player.x - 1.5, player.y + 1.6);
    return;
  }
  const tx = Math.max(7, Math.min(W - 7, player.x + player.facing * 2.2));
  camX += (tx - camX) * Math.min(1, dt * 3.5);
  const ty = Math.max(4.6, Math.min(levelSpec(game.level).cave ? 6.8 : 10, player.y + 2.1));
  camY += (ty - camY) * Math.min(1, dt * 3);
  shake *= Math.exp(-8 * dt);
  camera.position.set(camX + (Math.random() - 0.5) * shake, camY + 0.8 + (Math.random() - 0.5) * shake, 10.5);
  camera.lookAt(camX, camY, 0);
  sun.position.set(camX + 6, 16, 12); sun.target.position.set(camX, 2, 0);
  updateBackdrop(camX, camY);

  // HUD
  hud.score.textContent = String(game.score).padStart(6, '0');
  hud.coins.textContent = 'x' + String(game.coins).padStart(2, '0');
  hud.time.textContent = Math.max(0, Math.ceil(game.time));
  hud.lives.textContent = game.lives;
}

// ================= Arranque =================
function b64ToBuf(b) { const s = atob(b); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; }
const loader = new T.GLTFLoader();
const parseGLB = b64 => new Promise((res, rej) => loader.parse(b64ToBuf(b64), '', res, rej));
// ---------- Selección de personaje (cada uno se carga bajo demanda desde assets/personajes/<archivo>.js) ----------
const CHARS = [['Diego', 'Diego'], ['Wilson', 'Wilson'], ['Juan', 'Juan'], ['Carlos', 'Carlos'],
               ['Intructor', 'Instructor'], ['Jhonny', 'Jhonny'], ['Fabian', 'Fabian']];
let charIdx = 0, charLoading = false;
const charCache = {};
const charNameEl = document.getElementById('charName'), charDotsEl = document.getElementById('charDots');
function loadCharScript(file) {
  return new Promise((res, rej) => {
    if (window.CHAR_GLB && window.CHAR_GLB[file]) return res();
    const s = document.createElement('script'); s.src = 'assets/personajes/' + file + '.js';
    s.onload = () => res(); s.onerror = () => rej(new Error('No se pudo cargar assets/personajes/' + file + '.js'));
    document.body.appendChild(s);
  });
}
async function getChar(file) {
  if (charCache[file]) return charCache[file];
  await loadCharScript(file);
  const g = await parseGLB(window.CHAR_GLB[file]); delete window.CHAR_GLB[file];
  g.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  return (charCache[file] = g);
}
function setCharacter(g) {
  if (mixer) mixer.stopAllAction();
  if (model) scene.remove(model);
  model = g.scene; scene.add(model);
  mixer = new T.AnimationMixer(model); actions = {}; cur = null; curName = '';
  g.animations.filter(c => c.name.startsWith('M_')).forEach(c => { actions[c.name] = mixer.clipAction(c); });
  play('M_Idle', { fade: 0 });
}
function updateCharUI() {
  if (!charDotsEl.children.length) {
    CHARS.forEach(([file, label], i) => {
      const b = document.createElement('button'); b.className = 'card'; b.title = label;
      const src = window.PORTRAITS && window.PORTRAITS[file];
      b.innerHTML = src ? `<img src="${src}" alt="${label}">` : `<span>${label[0]}</span>`;
      b.onclick = () => { if (inMenu() && i !== charIdx) { selectChar(i); SFX.bump(); } };
      charDotsEl.appendChild(b);
    });
  }
  [...charDotsEl.children].forEach((c, i) => c.classList.toggle('on', i === charIdx));
  charNameEl.textContent = CHARS[charIdx][1].toUpperCase();
  setPowerUI();
  charNameEl.classList.remove('pop'); void charNameEl.offsetWidth; charNameEl.classList.add('pop');
}
let menuIdleTimer = 0;
function menuPose() {   // al elegir: pose de victoria y luego idle
  play('M_Victory', { loop: false, fade: 0.1 });
  clearTimeout(menuIdleTimer);
  menuIdleTimer = setTimeout(() => { if (inMenu() && curName === 'M_Victory') play('M_Idle', { fade: 0.35 }); }, 1900);
}
function setMenu(on) { document.body.classList.toggle('menu', on); }
function setMap(on) { document.body.classList.toggle('map', on); }
function startWithTransition() {   // desde el menú: nueva partida -> mapa del mundo
  if (transitioning || charLoading || !inMenu()) return;
  SFX.powerup();
  transition(() => { Object.assign(game, { score: 0, coins: 0, lives: 3, energy: 0 }); game.world = game.progress.world; showMap({ banner: true }); });
}

// ================= Mapa del mundo (estilo Super Mario Bros 3) =================
// Nodo 0 = aula de inicio; nodos 1..6 = niveles 1-1..1-6 (el 6 es el castillo).
const WORLDS = [
  { name: 'MUNDO 1', sub: 'Yamboró', count: 6, theme: 'day',
    style: { ground: 'grass', river: 6, lava: false, bridgeZ: -2 },
    nodes: [{ p: [-12, 3], label: 'Aula de inicio' }, { p: [-7, 3] }, { p: [-2, 3] }, { p: [-2, -2] }, { p: [3, -2] }, { p: [9, -2] },
            { p: [14, -2], castle: true }, { p: [19, -2], pipe: true, to: 1, label: 'Tubería al Mundo 2' }] },
  { name: 'MUNDO 2', sub: 'Volcán Binario', count: 5, theme: 'lavamap',
    style: { ground: 'basalt', river: 0, lava: true, bridgeZ: -3 },
    nodes: [{ p: [-13, 1], pipe: true, to: 0, label: 'Tubería al Mundo 1' }, { p: [-8, 1] }, { p: [-3, 1] }, { p: [-3, -3] }, { p: [3, -3] },
            { p: [9, -3], castle: true }] },
];
let MAPN = WORLDS[0].nodes;
const map = { group: null, cur: 0, move: null, panels: [], x: 0, z: 0, rot: -Math.PI / 2, camX: 0, camZ: 0, t: 0, bannerTimer: 0 };
const PANEL_COL = { done: '#39a900', open: '#1d4fd8', locked: '#5b5f6b' };
function panelTex(num, state) {
  return canvasTex((g, s) => {
    g.fillStyle = '#0b1a3a'; g.fillRect(0, 0, s, s);
    g.fillStyle = PANEL_COL[state]; g.fillRect(8, 8, s - 16, s - 16);
    g.strokeStyle = '#fff'; g.lineWidth = 6; g.strokeRect(14, 14, s - 28, s - 28);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
    if (state === 'done') { g.font = 'bold 70px sans-serif'; g.fillText('✓', s / 2, s / 2 + 4); }
    else { g.font = 'bold 64px monospace'; g.fillStyle = '#0b1a3a'; g.fillText(num, s / 2 + 4, s / 2 + 6); g.fillStyle = state === 'locked' ? '#c9ccd4' : '#fff'; g.fillText(num, s / 2, s / 2 + 2); }
  }, 128);
}
function nodeState(i) { const d = game.progress.done[game.world]; return i <= d ? 'done' : i === d + 1 ? 'open' : 'locked'; }

function makeAula(roofCol = 0x2a5bd7) {   // aula SENA: paredes blancas, guadua y techo azul curvo
  const g = new T.Group();
  const wall = new T.Mesh(new T.BoxGeometry(2.6, 1.1, 1.6), new T.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.8 }));
  wall.position.y = 0.55; g.add(wall);
  const glass = new T.Mesh(new T.BoxGeometry(1.9, 0.62, 0.05), new T.MeshStandardMaterial({ color: 0x5c8fb5, roughness: 0.15, metalness: 0.4 }));
  glass.position.set(0, 0.62, 0.81); g.add(glass);
  const bamboo = new T.MeshStandardMaterial({ color: 0xc8a050, roughness: 0.6 });
  [-1.3, -0.45, 0.45, 1.3].forEach(x => { const c = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 1.2, 8), bamboo); c.position.set(x, 0.6, 0.85); g.add(c); });
  const beam = new T.Mesh(new T.BoxGeometry(2.8, 0.1, 0.1), bamboo); beam.position.set(0, 1.15, 0.86); g.add(beam);
  const roof = new T.Mesh(new T.CylinderGeometry(1.05, 1.05, 3.0, 20, 1, false, 0, Math.PI), new T.MeshStandardMaterial({ color: roofCol, roughness: 0.4, metalness: 0.3, side: T.DoubleSide }));
  roof.rotation.set(Math.PI / 2, 0, Math.PI / 2); roof.scale.set(1, 1, 0.42); roof.position.y = 1.12; g.add(roof);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
function makePalm(h = 2.4) {
  const g = new T.Group();
  const trunk = new T.Mesh(new T.CylinderGeometry(0.09, 0.15, h, 8), new T.MeshStandardMaterial({ color: 0x9b7a4a, roughness: 0.9 }));
  trunk.position.y = h / 2; trunk.rotation.z = 0.12; g.add(trunk);
  const leafMat = new T.MeshStandardMaterial({ color: 0x3fae3a, roughness: 0.7, side: T.DoubleSide });
  for (let i = 0; i < 7; i++) {
    const l = new T.Mesh(new T.BoxGeometry(0.28, 0.03, 1.3), leafMat);
    const a = i / 7 * Math.PI * 2; l.position.set(Math.sin(a) * 0.55 + 0.15, h + 0.05, Math.cos(a) * 0.55);
    l.rotation.set(0.45 * Math.cos(a) + 0.2, a, -0.45 * Math.sin(a)); g.add(l);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function makeTree() {
  const g = new T.Group();
  const trunk = new T.Mesh(new T.CylinderGeometry(0.12, 0.16, 1.0, 8), new T.MeshStandardMaterial({ color: 0x7a5530 })); trunk.position.y = 0.5; g.add(trunk);
  [[0, 1.35, 0, 0.75, 0x2f9a3a], [0.35, 1.15, 0.2, 0.5, 0x45b845], [-0.3, 1.2, -0.15, 0.55, 0x3aa83f]].forEach(([x, y, z, r, c]) => {
    const s = new T.Mesh(new T.SphereGeometry(r, 14, 10), new T.MeshStandardMaterial({ color: c, roughness: 0.8 })); s.position.set(x, y, z); g.add(s);
  });
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function makeBush() {   // los arbustos verdes con "ojos" del mapa de SMB3
  const g = new T.Group(), m = new T.MeshStandardMaterial({ color: 0x48c040, roughness: 0.7 });
  [[-0.35, 0.3, 0.42], [0, 0.42, 0.5], [0.35, 0.3, 0.42]].forEach(([x, y, r]) => { const s = new T.Mesh(new T.SphereGeometry(r, 14, 10), m); s.position.set(x, y, 0); s.castShadow = true; g.add(s); });
  return g;
}
function makeBugCastle() {
  const g = new T.Group(), st = new T.MeshStandardMaterial({ color: 0x8d8f99, roughness: 0.85 }), roofM = new T.MeshStandardMaterial({ color: 0x6a3fb5, roughness: 0.5 });
  const body = new T.Mesh(new T.BoxGeometry(3, 2, 2), st); body.position.y = 1; g.add(body);
  [[-1.4, -0.9], [1.4, -0.9], [-1.4, 0.9], [1.4, 0.9]].forEach(([x, z]) => {
    const t = new T.Mesh(new T.CylinderGeometry(0.42, 0.45, 2.8, 12), st); t.position.set(x, 1.4, z); g.add(t);
    const r = new T.Mesh(new T.ConeGeometry(0.55, 0.9, 12), roofM); r.position.set(x, 3.25, z); g.add(r);
  });
  const keep = new T.Mesh(new T.BoxGeometry(1.4, 1.6, 1.2), st); keep.position.y = 2.6; g.add(keep);
  const kr = new T.Mesh(new T.ConeGeometry(1.0, 1.1, 4), roofM); kr.position.y = 3.95; kr.rotation.y = Math.PI / 4; g.add(kr);
  const door = new T.Mesh(new T.BoxGeometry(0.8, 1.1, 0.05), new T.MeshBasicMaterial({ color: 0x120a04 })); door.position.set(0, 0.55, 1.01); g.add(door);
  const sign = new T.Mesh(new T.PlaneGeometry(1.1, 0.42), new T.MeshBasicMaterial({ map: canvasTex((c, s) => {
    c.fillStyle = '#111'; c.fillRect(0, 0, s, s); c.fillStyle = '#ff2a55'; c.font = 'bold 26px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('404', s / 2, s / 2);
  }) }));
  sign.position.set(0, 1.55, 1.02); g.add(sign);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

function makePipe() {
  const g = new T.Group(), m = new T.MeshStandardMaterial({ color: 0x2fbf3a, roughness: 0.35, metalness: 0.1 });
  const body = new T.Mesh(new T.CylinderGeometry(0.55, 0.55, 0.7, 24), m); body.position.y = 0.35; g.add(body);
  const lip = new T.Mesh(new T.CylinderGeometry(0.68, 0.68, 0.25, 24), m); lip.position.y = 0.8; g.add(lip);
  const hole = new T.Mesh(new T.CircleGeometry(0.5, 24), new T.MeshBasicMaterial({ color: 0x062a08 })); hole.rotation.x = -Math.PI / 2; hole.position.y = 0.93; g.add(hole);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
function makeDeadTree() {
  const g = new T.Group(), m = new T.MeshStandardMaterial({ color: 0x1e1416, roughness: 0.9 });
  const t = new T.Mesh(new T.CylinderGeometry(0.07, 0.14, 1.6, 7), m); t.position.y = 0.8; g.add(t);
  [[0.5, 1.1, 0.7], [-0.4, 1.3, -0.8], [0.2, 1.5, 0.4]].forEach(([x, y, r]) => { const br = new T.Mesh(new T.CylinderGeometry(0.03, 0.06, 0.8, 6), m); br.position.set(x * 0.5, y, 0); br.rotation.z = r; g.add(br); });
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function makeVolcanoCone(h) {
  const g = new T.Group();
  const c = new T.Mesh(new T.CylinderGeometry(0.35 * h, 1.1 * h, h, 14), new T.MeshStandardMaterial({ color: 0x2e2226, roughness: 0.95 })); c.position.y = h / 2; g.add(c);
  const top = new T.Mesh(new T.CircleGeometry(0.33 * h, 14), new T.MeshBasicMaterial({ color: 0xff7a1a })); top.rotation.x = -Math.PI / 2; top.position.y = h + 0.01; g.add(top);
  const l = new T.PointLight(0xff6a1a, 1.2, 6, 1.6); l.position.y = h + 0.6; g.add(l);
  c.castShadow = true;
  return g;
}
function makeShip() {
  const g = new T.Group(), wood = new T.MeshStandardMaterial({ color: 0x6a3e1a, roughness: 0.8 }), sail = new T.MeshStandardMaterial({ color: 0xf2ead2, side: T.DoubleSide });
  const hull = new T.Mesh(new T.BoxGeometry(3, 0.7, 1.2), wood); hull.position.y = 0.35; g.add(hull);
  const bow = new T.Mesh(new T.ConeGeometry(0.6, 1, 4), wood); bow.rotation.z = -Math.PI / 2; bow.rotation.x = Math.PI / 4; bow.position.set(1.9, 0.4, 0); g.add(bow);
  [-0.6, 0.6].forEach(x => { const m = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 2.4, 6), wood); m.position.set(x, 1.8, 0); g.add(m);
    const sl = new T.Mesh(new T.PlaneGeometry(1.1, 1.2), sail); sl.position.set(x, 1.9, 0.05); g.add(sl); });
  const fl = new T.Mesh(new T.PlaneGeometry(0.5, 0.3), new T.MeshBasicMaterial({ color: 0x111111, side: T.DoubleSide })); fl.position.set(0.85, 3.0, 0); g.add(fl);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function buildMap() {
  const Wd = WORLDS[game.world], st = Wd.style, lavaW = st.lava;
  const g = new T.Group(); map.group = g; map.world = game.world; scene.add(g); g.visible = false;
  // suelo: pasto (Mundo 1) o basalto con grietas de lava (Mundo 2)
  const groundTex = canvasTex((c, s2) => {
    if (!lavaW) {
      c.fillStyle = '#5bbf47'; c.fillRect(0, 0, s2, s2);
      c.fillStyle = '#4fae3e'; for (let i = 0; i < 18; i++) c.fillRect((i * 29) % s2, (i * 41) % s2, 4, 4);
      c.fillStyle = '#72d35a'; for (let i = 0; i < 10; i++) c.fillRect((i * 47 + 9) % s2, (i * 17 + 5) % s2, 3, 3);
    } else {
      c.fillStyle = '#3a2c2e'; c.fillRect(0, 0, s2, s2);
      c.fillStyle = '#2a1e20'; for (let i = 0; i < 18; i++) c.fillRect((i * 29) % s2, (i * 41) % s2, 5, 5);
      c.fillStyle = '#ff6a1a'; for (let i = 0; i < 4; i++) c.fillRect((i * 47 + 9) % s2, (i * 17 + 5) % s2, 2, 7);
    }
  });
  groundTex.wrapS = groundTex.wrapT = T.RepeatWrapping; groundTex.repeat.set(32, 20);
  const ground = new T.Mesh(new T.PlaneGeometry(70, 44), new T.MeshStandardMaterial({ map: groundTex, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; g.add(ground);
  // río (agua o lava) con orillas
  const RX = st.river;
  const river = new T.Mesh(new T.PlaneGeometry(2.4, 44), lavaW ? MAT.lava :
    new T.MeshStandardMaterial({ color: 0x2f8de0, roughness: 0.15, metalness: 0.2, emissive: 0x0a3a70, emissiveIntensity: 0.4 }));
  river.rotation.x = -Math.PI / 2; river.position.set(RX, 0.03, 0); g.add(river);
  const shore = new T.MeshStandardMaterial({ color: lavaW ? 0x1a1214 : 0xe0c98a, roughness: 0.9 });
  [-1.35, 1.35].forEach(dx => { const sh = new T.Mesh(new T.BoxGeometry(0.35, 0.08, 44), shore); sh.position.set(RX + dx, 0.04, 0); g.add(sh); });
  // caminos
  const sand = new T.MeshStandardMaterial({ color: lavaW ? 0x8a7a70 : 0xead49b, roughness: 0.9 });
  const stud = new T.MeshStandardMaterial({ color: 0xf5b800, roughness: 0.5, metalness: 0.3 });
  for (let i = 0; i < MAPN.length - 1; i++) {
    const [ax, az] = MAPN[i].p, [bx, bz] = MAPN[i + 1].p;
    const seg = new T.Mesh(new T.BoxGeometry(Math.abs(bx - ax) + 1.1, 0.08, Math.abs(bz - az) + 1.1), sand);
    seg.position.set((ax + bx) / 2, 0.05, (az + bz) / 2); seg.receiveShadow = true; g.add(seg);
    const len = Math.hypot(bx - ax, bz - az);
    for (let d = 1.5; d < len - 1; d += 1.4) {
      const k = d / len, sd = new T.Mesh(new T.CylinderGeometry(0.13, 0.13, 0.06, 12), stud);
      sd.position.set(ax + (bx - ax) * k, 0.12, az + (bz - az) * k); g.add(sd);
    }
  }
  // puente
  const wood = new T.MeshStandardMaterial({ color: lavaW ? 0x6d6a74 : 0xb06a2c, roughness: 0.8 });
  const BZ = st.bridgeZ;
  const bridge = new T.Mesh(new T.BoxGeometry(3.4, 0.18, 1.5), wood); bridge.position.set(RX, 0.14, BZ); bridge.castShadow = bridge.receiveShadow = true; g.add(bridge);
  [-0.75, 0.75].forEach(dz => { const r = new T.Mesh(new T.BoxGeometry(3.4, 0.1, 0.1), wood); r.position.set(RX, 0.5, BZ + dz); g.add(r);
    for (let x = -1.6; x <= 1.6; x += 0.8) { const pp = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 0.4, 6), wood); pp.position.set(RX + x, 0.33, BZ + dz); g.add(pp); } });
  // casillas de nivel y tuberías
  map.panels = [];
  const specials = [];
  MAPN.forEach((n, i) => {
    const [x, z] = n.p;
    if (n.pipe) { const pp = makePipe(); pp.position.set(x, 0, z); g.add(pp); specials.push(pp.position); return; }
    if (i === 0) return;
    const side = new T.MeshStandardMaterial({ color: lavaW ? 0x3a0c08 : 0x0b1a3a, roughness: 0.6 });
    const top = new T.MeshStandardMaterial({ roughness: 0.5 });
    const m = new T.Mesh(new T.BoxGeometry(1.5, 0.35, 1.5), [side, side, top, side, side, side]);
    m.position.set(x, 0.2, z); m.castShadow = m.receiveShadow = true; g.add(m);
    map.panels[i] = { m, top, state: '' };
  });
  // inicio (aula SENA en el Mundo 1) y final (castillo / fortaleza)
  if (!MAPN[0].pipe) {
    const start = makeAula(); start.position.set(MAPN[0].p[0] - 0.2, 0, MAPN[0].p[1] - 2.3); g.add(start); specials.push(start.position);
    const startPad = new T.Mesh(new T.CylinderGeometry(0.7, 0.7, 0.12, 24), new T.MeshStandardMaterial({ color: 0x39a900 }));
    startPad.position.set(MAPN[0].p[0], 0.08, MAPN[0].p[1]); g.add(startPad);
  }
  const ci = MAPN.findIndex(n => n.castle);
  const castle = makeBugCastle(); castle.position.set(MAPN[ci].p[0] + 0.2, 0, MAPN[ci].p[1] - 2.6);
  if (lavaW) { castle.scale.setScalar(1.25); castle.traverse(o => { if (o.isMesh && o.material.color) { o.material = o.material.clone(); o.material.color.multiply(new T.Color(0.75, 0.5, 0.5)); } }); }
  g.add(castle); specials.push(castle.position);
  if (lavaW) {   // barco junto al 2-2 en una laguna
    const [sx, sz] = MAPN[2].p;
    const lake = new T.Mesh(new T.CircleGeometry(2.6, 28), new T.MeshStandardMaterial({ color: 0x1f6fb5, roughness: 0.2, emissive: 0x0a2a55, emissiveIntensity: 0.5 }));
    lake.rotation.x = -Math.PI / 2; lake.position.set(sx, 0.04, sz + 3.6); g.add(lake);
    const ship = makeShip(); ship.position.set(sx, 0.05, sz + 3.6); ship.rotation.y = 0.3; g.add(ship); map.ship = ship; specials.push(lake.position);
  } else map.ship = null;
  // decoración sin tapar caminos ni río
  const nearPath = (x, z, r) => MAPN.some((n, i) => {
    if (i === MAPN.length - 1) return Math.hypot(x - n.p[0], z - n.p[1]) < r;
    const [ax, az] = n.p, [bx, bz] = MAPN[i + 1].p;
    const minx = Math.min(ax, bx) - r, maxx = Math.max(ax, bx) + r, minz = Math.min(az, bz) - r, maxz = Math.max(az, bz) + r;
    return x > minx && x < maxx && z > minz && z < maxz;
  });
  const blocked = (x, z, r) => nearPath(x, z, r) || Math.abs(x - RX) < 1.8 + r * 0.3 || specials.some(q => Math.hypot(x - q.x, z - q.z) < 3);
  let seed = 11 + game.world * 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const aulaSpots = lavaW ? [] : [[-5, -3.5], [1.5, 4.5], [11.5, 3.2], [-9, -4]];
  aulaSpots.forEach(([x, z]) => { const a2 = makeAula(); a2.position.set(x, 0, z); a2.rotation.y = (rnd() - 0.5) * 0.4; g.add(a2); });
  const rockMat = new T.MeshStandardMaterial({ color: lavaW ? 0x2a2224 : 0xa08a70, roughness: 0.9 });
  let placed = 0, tries = 0;
  while (placed < 70 && tries++ < 900) {
    const x = -24 + rnd() * 46, z = -13 + rnd() * 24;
    if (blocked(x, z, 1.4) || aulaSpots.some(([ax, az]) => Math.hypot(x - ax, z - az) < 2.3)) continue;
    const r = rnd(); let o;
    if (lavaW) {
      if (r < 0.3) o = makeDeadTree(); else if (r < 0.42) o = makeVolcanoCone(1 + rnd() * 1.4);
      else if (r < 0.55) { o = new T.Mesh(new T.CircleGeometry(0.5 + rnd() * 0.6, 16), MAT.lava); o.rotation.x = -Math.PI / 2; o.position.y = 0.03; }
      else { o = new T.Mesh(new T.DodecahedronGeometry(0.35 + rnd() * 0.4), rockMat); o.position.y = 0.2; o.castShadow = true; }
    } else {
      if (r < 0.3) o = makePalm(2 + rnd() * 1.2); else if (r < 0.55) o = makeTree(); else if (r < 0.85) o = makeBush();
      else { o = new T.Mesh(new T.DodecahedronGeometry(0.35 + rnd() * 0.35), rockMat); o.position.y = 0.2; o.castShadow = true; }
    }
    o.position.x = x; o.position.z = z; if (!o.isMesh || o.geometry.type !== 'CircleGeometry') o.rotation.y = rnd() * 6.28; g.add(o); placed++;
  }
}
function refreshPanels() {
  for (let i = 1; i < MAPN.length; i++) {
    const p = map.panels[i], st = nodeState(i);
    if (!p) continue;
    if (p.state !== st) { if (p.top.map) p.top.map.dispose(); p.top.map = panelTex(String(i), st); p.top.needsUpdate = true; p.state = st; }
  }
}
function nodeName(i) { const n = MAPN[i]; return n.label ? n.label : (game.world + 1) + '-' + i + '  ' + levelSpec(i - 1).name; }
function updateMapHud() {
  const i = map.cur, st = MAPN[i].pipe ? 'pipe' : i === 0 ? '' : nodeState(i);
  const tag = st === 'pipe' ? '<span class="go">¡ENTER para viajar!</span>' : st === 'done' ? '<span class="ok">✔ completado</span>' : st === 'open' ? '<span class="go">¡ENTER para jugar!</span>' : st === 'locked' ? '<span class="lock">🔒 bloqueado</span>' : '';
  document.getElementById('mapNode').innerHTML = nodeName(i).toUpperCase() + (tag ? ' &middot; ' + tag : '');
  const [file, label] = CHARS[charIdx];
  document.getElementById('mapPortrait').src = (window.PORTRAITS && window.PORTRAITS[file]) || '';
  document.getElementById('mapChar').textContent = label.toUpperCase();
  document.getElementById('mapLives').textContent = game.lives;
  document.getElementById('mapCoins').textContent = String(game.coins).padStart(2, '0');
  document.getElementById('mapScore').textContent = String(game.score).padStart(6, '0');
}
function showBanner(world, name, ms = 1800) {
  const [file, label] = CHARS[charIdx];
  document.getElementById('mbWorld').textContent = world;
  document.getElementById('mbName').textContent = name || '';
  document.getElementById('mbChar').textContent = label.toUpperCase();
  document.getElementById('mbPortrait').src = (window.PORTRAITS && window.PORTRAITS[file]) || '';
  document.getElementById('mbLives').textContent = game.lives;
  const b = document.getElementById('mapBanner'); b.classList.add('show');
  clearTimeout(map.bannerTimer); map.bannerTimer = setTimeout(() => b.classList.remove('show'), ms);
}
function showMap({ banner = true, cleared = 0, finale = false } = {}) {
  const w = game.world, pg = game.progress;
  MAPN = WORLDS[w].nodes;
  if (map.group && map.world !== w) { scene.remove(map.group); map.group = null; }
  if (!map.group) buildMap();
  game.state = 'map'; setMenu(false); setMap(true); overlay.classList.remove('show');
  if (levelGroup) levelGroup.visible = false; if (BG.mesh) BG.mesh.visible = false;
  bossBar.classList.remove('on');
  map.group.visible = true; applyTheme(WORLDS[w].theme); WATER_LVL = false; lantern.intensity = 0;
  map.cur = Math.max(0, Math.min(pg.node[w], pg.done[w] + 1, MAPN.length - 1));
  [map.x, map.z] = MAPN[map.cur].p; map.move = null; map.camX = map.x; map.camZ = map.z;
  Object.assign(player, { dead: false, big: false, growT: 0, invT: 0 });
  refreshPanels(); play('M_Idle', { fade: 0.1 }); updateMapHud();
  if (finale) { showBanner('¡SENA BROS COMPLETADO!', 'Gracias por jugar, instructor', 3200); SFX.oneup(); }
  else if (cleared) { showBanner('¡' + (w + 1) + '-' + cleared + ' SUPERADO!', 'Se abrió el camino al ' + (w + 1) + '-' + (cleared + 1), 2200); SFX.oneup(); }
  else if (banner) showBanner(WORLDS[w].name, WORLDS[w].sub, 1900);
}
function mapMove(dx, dz) {
  if (map.move || transitioning) return;
  const i = map.cur;
  for (const c of [i - 1, i + 1]) {
    if (c < 0 || c >= MAPN.length) continue;
    const vx = MAPN[c].p[0] - MAPN[i].p[0], vz = MAPN[c].p[1] - MAPN[i].p[1], len = Math.hypot(vx, vz);
    if ((vx * dx + vz * dz) / len < 0.7) continue;
    if (c > i && i > game.progress.done[game.world]) {   // no deja pasar hasta superar este nivel
      SFX.bump(); toast('¡Primero supera el ' + (game.world + 1) + '-' + i + '!', 1300); return;
    }
    map.move = { ax: MAPN[i].p[0], az: MAPN[i].p[1], bx: MAPN[c].p[0], bz: MAPN[c].p[1], len, t: 0, to: c };
    play('M_Walk', { speed: 1.2, fade: 0.12 }); return;
  }
}
function mapEnter() {
  if (map.move || transitioning) return;
  const node = MAPN[map.cur];
  if (node.pipe) {   // tubería: viajar al otro mundo
    SFX.shrink();
    transition(() => {
      const to = node.to, pg = game.progress;
      game.world = to; pg.world = to; pg.node[to] = to === 1 ? 0 : WORLDS[0].nodes.length - 1; saveProgress();
      showMap({ banner: true });
    });
    return;
  }
  if (map.cur === 0) return;
  const lv = map.cur - 1;
  SFX.powerup();
  showBanner('MUNDO ' + (game.world + 1) + '-' + map.cur, levelSpec(lv).name, 1500);
  transitioning = true;
  setTimeout(() => { transitioning = false; transition(() => startLevel(lv)); }, 1100);
}
function updateMap(dt) {
  map.t += dt;
  let target = -Math.PI / 2;   // quieto: mira a la cámara
  if (map.move) {
    const m = map.move; m.t += dt * 4.2 / m.len; const k = Math.min(1, m.t);
    map.x = m.ax + (m.bx - m.ax) * k; map.z = m.az + (m.bz - m.az) * k;
    target = Math.atan2(-(m.bz - m.az), m.bx - m.ax);
    if (k >= 1) {
      map.cur = m.to; map.move = null; game.progress.node[game.world] = map.cur; saveProgress();
      play('M_Idle', { fade: 0.2 }); updateMapHud(); SFX.bump();
    }
  }
  let d = target - map.rot; d = Math.atan2(Math.sin(d), Math.cos(d)); map.rot += d * Math.min(1, dt * 10);
  if (model) {
    model.position.set(map.x, 0.08, map.z); model.rotation.y = map.rot;
    model.scale.setScalar(1.15); model.visible = true;
  }
  // la casilla disponible rebota
  if (map.ship) { map.ship.rotation.z = Math.sin(map.t * 1.4) * 0.05; map.ship.position.y = 0.05 + Math.sin(map.t * 1.8) * 0.04; }
  if (model) model.rotation.z = 0;
  for (let i = 1; i < MAPN.length; i++) {
    const p = map.panels[i]; if (!p) continue; p.m.position.y = 0.2 + (p.state === 'open' ? Math.abs(Math.sin(map.t * 4)) * 0.12 : 0);
  }
  map.camX += (map.x - map.camX) * Math.min(1, dt * 3); map.camZ += (map.z - map.camZ) * Math.min(1, dt * 3);
  camera.position.set(map.camX, 11.5, map.camZ + 10.5);
  camera.lookAt(map.camX, 0, map.camZ - 0.8);
  sun.position.set(map.camX + 7, 16, map.camZ + 10); sun.target.position.set(map.camX, 0, map.camZ);
}
document.getElementById('startBtn').onclick = startWithTransition;
async function selectChar(i) {
  charIdx = (i + CHARS.length) % CHARS.length; updateCharUI();
  const want = charIdx; charLoading = true; charNameEl.classList.add('loading');
  try { const g = await getChar(CHARS[want][0]); if (want === charIdx) { setCharacter(g); if (inMenu()) menuPose(); } }
  catch (err) { console.error(err); toast('Error cargando ' + CHARS[want][1]); }
  finally { if (want === charIdx) { charLoading = false; charNameEl.classList.remove('loading'); } }
}
document.getElementById('prevChar').onclick = () => { if (inMenu()) selectChar(charIdx - 1); };
document.getElementById('nextChar').onclick = () => { if (inMenu()) selectChar(charIdx + 1); };

const loadBar = document.getElementById('loadBar'), loadText = document.getElementById('loadText');
const enemyEntries = Object.entries(window.ENEMY_GLB_B64);
const totalSteps = enemyEntries.length + 2; let doneSteps = 0;
const step = msg => { doneSteps++; loadBar.style.width = Math.round(doneSteps / totalSteps * 100) + '%'; if (msg) loadText.textContent = msg; };
Promise.all(enemyEntries.map(([name, b64]) =>
  parseGLB(b64).then(g => { enemyTemplates[name] = g.scene; step('Cargando bugs y monedas...'); })
)).then(() => { loadText.textContent = 'Llamando a los instructores...'; return getChar(CHARS[0][0]); }).then(gltf => {
  step('Construyendo Yamboró...');
  setCharacter(gltf); updateCharUI();
  buildLevel();
  resetPlayer(3);
  game.state = 'title';
  step('¡Listo!');
  setTimeout(() => { document.getElementById('loading').classList.add('done'); menuPose(); }, 350);
  // modo prueba: index.html#test=2-5 abre ese nivel, #test=map2 abre el mapa del mundo 2
  const tm = /test=(map)?(\d)(?:-(\d))?/.exec(location.hash);
  if (tm) setTimeout(async () => {
    const tc = /c=(\w+)/.exec(location.hash);   // #test=1-1;c=Juan elige instructor
    if (tc) await selectChar(CHARS.findIndex(c => c[0] === tc[1]));
    try {
      game.world = (+tm[2]) - 1;
      if (tm[1]) showMap({ banner: true }); else startLevel((+tm[3]) - 1);
      const sx = /x=(\d+)/.exec(location.hash);
      if (sx) setTimeout(() => { player.x = +sx[1]; player.y = 9; camX = player.x; }, 300);
      setTimeout(() => console.log('SHOT:' + renderer.domElement.toDataURL('image/jpeg', 0.7)), 2400);
      setTimeout(() => console.log('TEST_OK', location.hash, 'state=' + game.state, 'enemies=' + enemies.length, 'plats=' + plats.length, 'fires=' + fires.length, 'cannons=' + cannons.length, 'boss=' + !!bossE), 2500);
    } catch (err) { console.error('TEST_FAIL', err && err.stack || err); }
  }, 600);
  let last = performance.now();
  (function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000); last = now;
    if (!window.SENA_PAUSED) update(dt);   // pausado mientras se abren los ajustes
    renderer.render(scene, camera); requestAnimationFrame(loop);
  })(last);
}).catch(err => {
  document.getElementById('loading').textContent = 'Error cargando los modelos: ' + (err.message || err);
  console.error(err);
});
})();
