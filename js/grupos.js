// Grupos (por ejemplo la ficha): crear o unirse con un código GR-XXXXX, tabla del grupo y chat.
// Vive en la pestaña "Grupos" del perfil. Todo pasa por funciones del servidor (solo los miembros ven el grupo).
(() => {
'use strict';
const $ = id => document.getElementById(id);
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'class') e.className = v; else if (k.startsWith('on')) e[k] = v; else if (k === 'html') e.innerHTML = v; else e.setAttribute(k, v); }
  e.append(...kids.filter(k => k != null)); return e;
};
const db = () => SenaOnline.db;
const fmt = n => (n | 0).toLocaleString('es');
const err = e => (e && e.message || 'Ocurrió un error').replace(/^.*?:\s*/, '');
const G = { cur: null, last: 0, poll: 0, metric: 'best_score', board: [] };
const METRICS = { best_score: 'Mejor puntaje', levels: 'Niveles', kills: 'Bugs', quiz: 'Preguntas bien', party: 'Fiestas ganadas', races: 'Carreras ganadas', coins: 'Monedas' };
const msg = (t, good) => { const m = $('grMsg'); m.textContent = t || ''; m.className = 'msg' + (good ? ' good' : ''); };

async function renderList() {
  stopPoll(); G.cur = null; $('grDetail').hidden = true; $('grHome').hidden = false;
  const { data, error } = await db().rpc('my_groups');
  if (error) return msg(err(error));
  $('grList').replaceChildren(...(data || []).map(g => el('button', { type: 'button', class: 'gr-item', onclick: () => openGroup(g) },
    el('b', {}, g.name), el('small', {}, g.code + ' · ' + g.members + (g.members === 1 ? ' persona' : ' personas') + (g.owner ? ' · lo creaste tú' : '')))));
  if (!data || !data.length) $('grList').append(el('div', { class: 'pempty' }, 'Aún no estás en ningún grupo. Crea uno para tu ficha o únete con el código que te pasen.'));
}
async function create() {
  const name = $('grName').value.trim(); if (name.length < 3) return msg('Ponle un nombre de al menos 3 letras');
  if (window.SENA_BAD && SENA_BAD.test(name)) return msg('El nombre tiene palabras no permitidas');
  const { data, error } = await db().rpc('create_group', { group_name: name });
  if (error) return msg(err(error));
  $('grName').value = ''; msg('Grupo creado. Comparte el código ' + data + ' con tu ficha', true); renderList();
}
async function join() {
  const code = $('grCode').value.trim(); if (!code) return msg('Escribe el código del grupo (GR-XXXXX)');
  const { error } = await db().rpc('join_group', { group_code: code });
  if (error) return msg(err(error));
  $('grCode').value = ''; msg('¡Te uniste al grupo!', true); renderList();
}
async function openGroup(g) {
  G.cur = g; G.last = 0; msg('');
  $('grHome').hidden = true; $('grDetail').hidden = false;
  $('grTitle').textContent = g.name; $('grCodeLbl').textContent = g.code; $('grChat').replaceChildren();
  const { data, error } = await db().rpc('group_board', { gid: g.id });
  if (error) return msg(err(error));
  G.board = data || []; renderBoard(); pollChat(); stopPoll(); G.poll = setInterval(pollChat, 4000);
}
function renderBoard() {
  const k = G.metric, rows = G.board.slice().sort((a, b) => (b[k] | 0) - (a[k] | 0));
  const me = SenaOnline.user && SenaOnline.user.id;
  $('grBoard').replaceChildren(...rows.map((r, i) => el('div', { class: 'gr-row clickable' + (r.user_id === me ? ' me' : '') + (i < 3 ? ' t' + (i + 1) : ''), 'data-profile': r.user_id, title: 'Ver perfil' },
    el('span', { class: 'gr-pos', html: i === 0 ? SENA_ICON('crown', 18) : String(i + 1) }), el('span', { class: 'pdot' + (SenaOnline.isOnline(r.last_seen) ? ' on' : '') }),
    el('b', {}, r.username), el('span', { class: 'gr-val' }, fmt(r[k]) + (k === 'levels' ? '/16' : '')))));
}
async function pollChat() {
  if (!G.cur) return;
  const { data } = await db().rpc('group_messages_since', { gid: G.cur.id, after_id: G.last });
  if (!data || !data.length) { if (!$('grChat').children.length) $('grChat').append(el('div', { class: 'pempty' }, 'Escríbanse aquí. Solo lo ven los del grupo.')); return; }
  const box = $('grChat'), atEnd = box.scrollTop + box.clientHeight >= box.scrollHeight - 30;
  box.querySelectorAll('.pempty').forEach(e => e.remove());
  data.forEach(m => { G.last = Math.max(G.last, m.id);
    box.append(el('div', { class: 'gr-msg' + (m.mine ? ' mine' : '') }, el('b', {}, m.username), el('span', {}, m.body),
      el('small', {}, new Date(m.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })))); });
  if (atEnd || G.last && data.some(m => m.mine)) box.scrollTop = box.scrollHeight;
}
async function send(e) {
  e.preventDefault(); const t = $('grInput').value.trim(); if (!t || !G.cur) return;
  if (window.SENA_BAD && SENA_BAD.test(t)) return msg('El mensaje tiene palabras no permitidas');
  const { error } = await db().rpc('send_group_message', { gid: G.cur.id, msg: t });
  if (error) return msg(err(error));
  $('grInput').value = ''; msg(''); pollChat();
}
async function leave() {
  if (!G.cur || !confirm('¿Salir de "' + G.cur.name + '"?')) return;
  const { error } = await db().rpc('leave_group', { gid: G.cur.id });
  if (error) return msg(err(error)); msg('Saliste del grupo', true); renderList();
}
function stopPoll() { clearInterval(G.poll); G.poll = 0; }
$('grCreate').onclick = create; $('grJoin').onclick = join; $('grBack').onclick = renderList; $('grLeave').onclick = leave;
$('grChatForm').addEventListener('submit', send);
$('grMetric').replaceChildren(...Object.entries(METRICS).map(([k, v]) => el('option', { value: k }, v)));
$('grMetric').onchange = () => { G.metric = $('grMetric').value; renderBoard(); };
$('grCopy').onclick = () => { if (G.cur && navigator.clipboard) navigator.clipboard.writeText(G.cur.code).then(() => msg('Código copiado: ' + G.cur.code, true)); };
// se abre cuando el perfil muestra la pestaña Grupos; se detiene al cerrar el perfil
window.SenaGroups = { open: () => { msg(''); renderList(); }, stop: stopPoll };
new MutationObserver(() => { if (!$('profileScreen').classList.contains('show')) stopPoll(); }).observe($('profileScreen'), { attributes: true, attributeFilter: ['class'] });
})();
