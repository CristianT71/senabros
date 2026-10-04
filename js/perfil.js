// Perfil de otro jugador: vista 3D con su ropa, estadísticas, logros y botón para agregarlo como amigo.
// Se abre tocando su nombre en la sala, el ranking, la lista de amigos o los niveles de la comunidad.
(() => {
'use strict';
const $ = id => document.getElementById(id);
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'class') e.className = v; else if (k.startsWith('on')) e[k] = v; else if (k === 'html') e.innerHTML = v; else e.setAttribute(k, v); }
  e.append(...kids.filter(k => k != null)); return e;
};
const fmt = n => (n | 0).toLocaleString('es');
const BOARD = b => b.startsWith('nivel:') ? 'Nivel ' + b.slice(6) : { carrera: 'Carrera', batalla: 'Batalla', supervivencia: 'Supervivencia' }[b] || b;
const CHAR_LABEL = { Intructor: 'Instructor' };
let current = null;

async function openProfile(who) {
  if (!who) return;
  if (!window.SenaOnline || !SenaOnline.user) { if (window.SenaOnline) SenaOnline.openAuth(); return; }
  $('playerCard').hidden = false; document.body.classList.add('acct-open');
  $('pcName').textContent = 'Cargando...'; $('pcSub').textContent = ''; ['pcCrowns', 'pcStats', 'pcAch', 'pcActions', 'pcOutfit'].forEach(id => $(id).replaceChildren()); $('pcMsg').textContent = '';
  const r = await SenaOnline.publicProfile(who);
  if (r.error || !r.profile) { $('pcName').textContent = r.error || 'No se encontró ese jugador'; return; }
  const p = current = r.profile, me = SenaOnline.user.id === p.id;
  const on = SenaOnline.isOnline(p.last_seen);
  $('pcDot').className = 'pdot' + (on ? ' on' : '');
  $('pcName').textContent = p.username;
  $('pcSub').textContent = p.player_code + ' · ' + (CHAR_LABEL[p.character_name] || p.character_name) + ' · ' + (on ? 'conectado' : 'jugando desde ' + new Date(p.created_at).toLocaleDateString('es', { month: 'short', year: 'numeric' }));
  $('pcCrowns').replaceChildren(...(p.crowns || []).map(b => el('span', { html: SENA_ICON('crown', 14) + ' Campeón: ' + BOARD(b) })));
  const st = p.stats || {}, done = Array.isArray(p.done) ? p.done : [], levels = done.reduce((a, b) => a + (b | 0), 0);
  const stats = [[fmt(p.best_score), 'Mejor puntaje'], [levels + '/16', 'Niveles'], [fmt(st.kills), 'Bugs eliminados'], [fmt(st.coinsEarned), 'Monedas'],
    [fmt(st.raceWins), 'Carreras ganadas'], [fmt(st.partyWins), 'Fiestas ganadas'], [fmt(st.quizRight), 'Preguntas bien'], [fmt(p.levels_published), 'Niveles creados']];
  $('pcStats').replaceChildren(...stats.map(([v, l]) => el('div', {}, el('b', {}, v), el('small', {}, l))));
  const ach = window.SENA_ACH_FOR ? SENA_ACH_FOR(st, done, p.eq) : [];
  $('pcAchN').textContent = '(' + ach.filter(a => a.done).length + ' de ' + ach.length + ')';
  $('pcAch').replaceChildren(...ach.map(a => el('span', { class: a.done ? 'on' : '', title: a.name + (a.done ? '' : ' (bloqueado)') + ': ' + a.desc, html: SENA_ICON(a.done ? a.icon : 'lock', 20) })));
  const items = window.SENA_SHOP ? SENA_SHOP.items : [];
  $('pcOutfit').replaceChildren(...Object.values(p.eq || {}).filter(Boolean).map(id => { const it = items.find(x => x.id === id); return it ? el('span', { html: SENA_ICON('shirt', 12) + ' ' + it.name }) : null; }).filter(Boolean));
  if (!$('pcOutfit').children.length) $('pcOutfit').append(el('span', {}, 'Sin ropa de la tienda'));
  const acts = $('pcActions');
  if (me) acts.append(el('small', {}, 'Este es tu perfil. Así te ven los demás.'));
  else if (p.friend_status === 'amigos') acts.append(el('small', {}, 'Ya son amigos'));
  else if (p.friend_status === 'enviada') acts.append(el('small', {}, 'Solicitud de amistad enviada'));
  else if (p.friend_status === 'recibida') acts.append(el('small', {}, 'Te envió una solicitud: acéptala en tu perfil'));
  else acts.append(el('button', { type: 'button', class: 'mini ok big', onclick: async e => { e.target.disabled = true; const err = await SenaOnline.addFriendId(p.id); $('pcMsg').textContent = err || 'Solicitud enviada'; $('pcMsg').className = 'msg' + (err ? '' : ' good'); } }, 'Agregar amigo'));
  requestAnimationFrame(() => { if (current === p && window.SENA_PREVIEW) SENA_PREVIEW.mount($('pcView'), p.character_name || 'Diego', p.eq || {}); });
}
function closeProfile() {
  $('playerCard').hidden = true; current = null;
  if (window.SENA_PREVIEW) SENA_PREVIEW.unmount();
  if (!document.querySelector('.screen.show')) document.body.classList.remove('acct-open');
}
$('pcClose').onclick = closeProfile;
$('playerCard').addEventListener('pointerdown', e => { if (e.target === $('playerCard')) closeProfile(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('playerCard').hidden) { e.stopPropagation(); closeProfile(); } }, true);
window.SenaProfile = { open: openProfile, close: closeProfile };

// tocar un nombre con data-profile abre su perfil (sala, ranking, amigos, comunidad)
document.addEventListener('click', e => {
  const t = e.target.closest('[data-profile]');
  if (t && !e.target.closest('button:not([data-profile])')) { e.preventDefault(); openProfile(t.dataset.profile); }
});
})();
