// Ranking semanal, logros y tienda de ropa.
// Los datos los da el juego (window.SENA_ACHIEVEMENTS, window.SENA_SHOP) y la nube (SenaOnline: ranking, compras).
(() => {
'use strict';
const $ = id => document.getElementById(id);
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'class') e.className = v; else if (k.startsWith('on')) e[k] = v; else if (k === 'html') e.innerHTML = v; else e.setAttribute(k, v); }
  e.append(...kids.filter(k => k != null)); return e;
};
const icon = (n, s = 22) => el('span', { class: 'ico-w', html: window.SENA_ICON ? SENA_ICON(n, s) : '' });
const fmt = n => (n | 0).toLocaleString('es');
const loggedIn = () => !!(window.SenaOnline && SenaOnline.user);
let open = '';
function openScr(id) {
  ['rankScreen', 'achScreen', 'shopScreen'].forEach(s => $(s).classList.toggle('show', s === id));
  document.body.classList.add('acct-open'); document.body.classList.toggle('shop-open', id === 'shopScreen'); open = id;
}
function closeScr() {
  ['rankScreen', 'achScreen', 'shopScreen'].forEach(s => $(s).classList.remove('show'));
  document.body.classList.remove('acct-open', 'shop-open');
  if (open === 'shopScreen') { SENA_SHOP.preview(null); SENA_SHOP.turn(false); }
  open = '';
}
const needLogin = (box, text) => box.replaceChildren(el('div', { class: 'rk-empty' }, el('b', {}, text),
  el('button', { type: 'button', class: 'mini ok big', onclick: () => { closeScr(); SenaOnline.openAuth(); } }, 'Iniciar sesión')));

// ================= Ranking =================
const rk = { board: 'nivel', weeks: 0, level: '1-1', seq: 0 };
const UNIT = { nivel: v => fmt(v) + ' pts', carrera: v => v + (v === 1 ? ' victoria' : ' victorias'), batalla: v => fmt(v) + ' monedas', supervivencia: v => 'Oleada ' + v };
const INFO = {
  nivel: 'Mejor puntaje de la semana en el nivel elegido (jugando solo).',
  carrera: 'Carreras en línea ganadas esta semana (contra al menos otro jugador).',
  batalla: 'Más monedas juntadas en una sola Batalla de monedas.',
  supervivencia: 'Oleada más alta alcanzada en Supervivencia.',
};
function weekText(weeks) {
  const now = new Date(), d = (now.getDay() + 6) % 7, mon = new Date(now); mon.setDate(now.getDate() - d - 7 * weeks);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const f = x => x.toLocaleDateString('es', { day: 'numeric', month: 'short' });
  return f(mon) + ' al ' + f(sun);
}
function fillLevels() {
  const sel = $('rkLevel'); if (sel.children.length) return;
  const lv = window.SENA_MP ? SENA_MP.levels() : [];
  sel.replaceChildren(...lv.map(l => el('option', { value: `${l.world}-${l.level}` }, `${l.world}-${l.level}  ${l.name}`)));
  sel.value = rk.level;
}
async function renderRank() {
  document.querySelectorAll('#rkBoards button').forEach(b => b.classList.toggle('on', b.dataset.b === rk.board));
  $('rkThis').classList.toggle('on', rk.weeks === 0); $('rkPrev').classList.toggle('on', rk.weeks === 1);
  $('rkLevel').hidden = rk.board !== 'nivel';
  $('rkInfo').textContent = INFO[rk.board] + '  Semana del ' + weekText(rk.weeks) + '. Se reinicia cada lunes y el primero gana la corona.';
  const box = $('rkList');
  if (!loggedIn()) return needLogin(box, 'Inicia sesión para ver el ranking y aparecer en él.');
  box.replaceChildren(el('div', { class: 'rk-empty' }, 'Cargando...'));
  const seq = ++rk.seq, board = rk.board === 'nivel' ? 'nivel:' + rk.level : rk.board;
  const r = await SenaOnline.ranking(board, rk.weeks);
  if (seq !== rk.seq) return;
  if (r.error) return box.replaceChildren(el('div', { class: 'rk-empty' }, r.error));
  if (!r.rows.length) return box.replaceChildren(el('div', { class: 'rk-empty' }, el('b', {}, rk.weeks ? 'Nadie jugó este tablero esa semana.' : 'Nadie ha jugado este tablero esta semana.'), rk.weeks ? '' : '¡Juega y sé el primero en la tabla!'));
  const unit = UNIT[rk.board];
  box.replaceChildren(...r.rows.map((x, i) => {
    const gap = i > 0 && x.rank > r.rows[i - 1].rank + 1;
    const img = el('img', { alt: '' }); img.src = (window.PORTRAITS && PORTRAITS[x.character_name]) || '';
    const pos = x.rank === 1 ? el('span', { class: 'rk-pos crown', html: SENA_ICON('crown', 22) }) : el('span', { class: 'rk-pos' }, String(x.rank));
    return el('div', { class: 'rk-row clickable' + (x.rank <= 3 ? ' r' + x.rank : '') + (x.me ? ' me' : '') + (gap ? ' gap' : ''), 'data-profile': x.user_id, title: 'Ver perfil' },
      pos, el('span', { class: 'rk-face' }, img), el('b', { class: 'rk-name' }, x.username, x.me ? el('small', {}, ' (tú)') : null), el('span', { class: 'rk-val' }, unit(x.value)));
  }));
  if (rk.weeks === 0 && r.rows.some(x => x.me && x.rank === 1) && window.SENA_STAT_MAX) SENA_STAT_MAX('champion', 1);
}
$('rkBoards').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { rk.board = b.dataset.b; renderRank(); } });
$('rkLevel').onchange = () => { rk.level = $('rkLevel').value; renderRank(); };
$('rkThis').onclick = () => { rk.weeks = 0; renderRank(); };
$('rkPrev').onclick = () => { rk.weeks = 1; renderRank(); };
$('rankBtn').onclick = () => { fillLevels(); openScr('rankScreen'); renderRank(); };
$('rankBack').onclick = closeScr;

// ================= Logros =================
function renderAch() {
  const list = SENA_ACHIEVEMENTS(), done = list.filter(a => a.done).length;
  $('achCount').textContent = done + ' de ' + list.length + ' logros';
  $('achBar').style.width = Math.round(done / list.length * 100) + '%';
  $('achGrid').replaceChildren(...list.map(a => el('div', { class: 'ach' + (a.done ? ' done' : '') },
    el('div', { class: 'ach-ico' }, icon(a.done ? a.icon : 'lock', 26)),
    el('div', { class: 'ach-txt' }, el('b', {}, a.name), el('small', {}, a.desc),
      el('div', { class: 'ach-prog' }, el('i', { style: `width:${Math.round(a.value / a.goal * 100)}%` })),
      el('span', { class: 'ach-num' }, a.done ? 'Completado' : fmt(a.value) + ' / ' + fmt(a.goal))))));
  if (!loggedIn()) $('achGrid').prepend(el('div', { class: 'rk-empty wide' }, SenaOnline && SenaOnline.isGuest ? 'Como invitado los logros no se guardan. Crea una cuenta para conservarlos.' : 'Inicia sesión para guardar tus logros en la nube.'));
}
$('achBtn').onclick = () => { openScr('achScreen'); renderAch(); };
$('achBack').onclick = closeScr;

// ================= Tienda =================
const SLOT_NAME = { cabeza: 'Cabeza', cara: 'Cara', espalda: 'Espalda', estela: 'Estela' };
const ITEM_ICON = { mago: 'wizard', vikingo: 'viking', copa: 'tophat', gato: 'cat', aureola: 'halo', visor: 'visor', alas: 'wings', jetpack: 'jetpack', gorra: 'cap', casco: 'helmet', audifonos: 'headphones', vueltiao: 'hat', corona: 'crown', gafas_sol: 'glasses', gafas_dev: 'glasses2',
  mochila: 'backpack', capa_roja: 'cape', capa_sena: 'cape', estela_verde: 'sparkle', estela_dorada: 'sparkle', estela_arcoiris: 'sparkle' };
const ITEM_TINT = { mago: '#8a6aff', vikingo: '#cfd6e0', copa: '#ff5a6a', gato: '#ff8fb8', aureola: '#ffd84a', visor: '#39e6ff', alas: '#eaf2ff', jetpack: '#ff7a1a', gorra: '#39a900', casco: '#ffc21a', audifonos: '#39d98a', vueltiao: '#efe3c2', corona: '#ffc81a', gafas_sol: '#cfd6e0', gafas_dev: '#9ad7ff',
  mochila: '#39a900', capa_roja: '#ff4a55', capa_sena: '#39a900', estela_verde: '#39d98a', estela_dorada: '#ffd23f', estela_arcoiris: '#ff7ad9' };
const shop = { slot: 'cabeza', sel: null, busy: false };
function shopEq() { const eq = SENA_SHOP.eq(); if (shop.sel) eq[shop.sel.slot] = shop.sel.id; return eq; }
function renderShop() {
  const owned = new Set(SENA_SHOP.owned()), eq = SENA_SHOP.eq(), coins = SENA_SHOP.wallet();
  $('shopCoins').textContent = fmt(coins);
  SENA_SHOP.turn(shop.slot === 'espalda');
  $('shopTabs').replaceChildren(...SENA_SHOP.slots.map(k => el('button', { type: 'button', class: k === shop.slot ? 'on' : '', onclick: () => { shop.slot = k; renderShop(); } }, SLOT_NAME[k])));
  $('shopGrid').replaceChildren(...SENA_SHOP.items.filter(i => i.slot === shop.slot).map(i => {
    const has = owned.has(i.id), on = eq[i.slot] === i.id;
    const tag = on ? el('span', { class: 'tag on' }, 'Puesto') : has ? el('span', { class: 'tag' }, 'Tuyo') : el('span', { class: 'tag price' + (coins < i.price ? ' poor' : '') }, el('i', { class: 'coin-ico sm' }), fmt(i.price));
    const card = el('button', { type: 'button', class: 'item' + (i.pro ? ' pro' : '') + (shop.sel && shop.sel.id === i.id ? ' sel' : '') + (on ? ' worn' : ''), onclick: () => { shop.sel = i; SENA_SHOP.preview(shopEq()); renderShop(); } },
      el('span', { class: 'item-ico', style: '--tint:' + ITEM_TINT[i.id] }, icon(ITEM_ICON[i.id], 34)), el('b', {}, i.name), tag);
    return card;
  }));
  const s = shop.sel, btn = $('shopAction');
  if (!s) { $('shopSelName').textContent = 'Elige una prenda'; $('shopSelInfo').textContent = 'Tócala para probártela.'; btn.disabled = true; btn.textContent = 'COMPRAR'; return; }
  $('shopSelName').textContent = s.name;
  const has = owned.has(s.id), on = eq[s.slot] === s.id;
  $('shopSelInfo').textContent = s.slot === 'estela' ? 'Se ve detrás de ti cuando corres.' : has ? (on ? 'La tienes puesta.' : 'Ya es tuya.') : 'Cuesta ' + fmt(s.price) + ' monedas.';
  btn.disabled = shop.busy;
  if (!loggedIn()) { btn.textContent = 'INICIA SESIÓN'; btn.disabled = false; return; }
  if (on) btn.textContent = 'QUITAR';
  else if (has) btn.textContent = 'USAR';
  else if (coins >= s.price) btn.textContent = 'COMPRAR ' + fmt(s.price);
  else { btn.textContent = 'TE FALTAN ' + fmt(s.price - coins); btn.disabled = true; }
}
async function shopAction() {
  const s = shop.sel; if (!s || shop.busy) return;
  if (!loggedIn()) { closeScr(); SenaOnline.openAuth(); return; }
  const owned = new Set(SENA_SHOP.owned()), eq = SENA_SHOP.eq(), msg = $('shopMsg');
  shop.busy = true; renderShop(); msg.textContent = '';
  let r;
  if (eq[s.slot] === s.id) { eq[s.slot] = ''; r = await SenaOnline.equip(eq); }
  else if (owned.has(s.id)) { eq[s.slot] = s.id; r = await SenaOnline.equip(eq); }
  else { r = await SenaOnline.buy(s.id); if (r.ok) { eq[s.slot] = s.id; r = await SenaOnline.equip(eq); if (r.ok) msg.textContent = '¡Compraste ' + s.name + '!'; } }
  shop.busy = false;
  if (r && r.error) msg.textContent = r.error;
  msg.className = 'msg' + (r && r.ok ? ' good' : '');
  SENA_SHOP.preview(shopEq()); renderShop();
}
$('shopAction').onclick = shopAction;
$('shopBtn').onclick = () => { shop.sel = null; $('shopMsg').textContent = ''; openScr('shopScreen'); SENA_SHOP.preview(null); renderShop(); };
$('shopBack').onclick = closeScr;
document.addEventListener('keydown', e => { if (e.key === 'Escape' && open) { e.stopPropagation(); closeScr(); } }, true);
})();
