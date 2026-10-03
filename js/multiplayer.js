// Multijugador en tiempo real (Supabase Realtime, canales privados).
// - Sala 'room:<CODIGO>': presencia (quién está y con qué instructor) + broadcast (posiciones 10/s y eventos del nivel).
// - Buzón 'inbox:<user_id>': invitaciones de amigos (solo el dueño puede recibirlas).
// El juego (js/game.js) expone window.SENA_MP para dibujar a los demás y aplicar sus eventos.
(() => {
'use strict';
const $ = id => document.getElementById(id);
const btn = $('mpBtn');
if (!window.SenaOnline || !window.SENA_MP || !btn) { if (btn) btn.style.display = 'none'; return; }

const MODES = {
  coop: { label: 'En equipo', hud: 'EN EQUIPO', desc: 'En equipo (revive a tus compañeros)' },
  race: { label: 'Carrera', hud: 'CARRERA', desc: 'Carrera (el primero en llegar gana)' },
  battle: { label: 'Batalla de monedas', hud: 'BATALLA DE MONEDAS', desc: 'Batalla de monedas (2 minutos, gana quien junte más)', arena: true },
  survival: { label: 'Supervivencia', hud: 'SUPERVIVENCIA', desc: 'Supervivencia (aguanten oleadas de bugs en equipo)', arena: true },
};
const modeOf = m => MODES[m] || MODES.coop;
const MAX = 4, RATE = 100, ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const st = { mode: 'coop', chatLog: [], lastChat: 0, ch: null, code: '', joinedAt: 0, creating: false, players: [], inLevel: false, timer: 0, results: null, inbox: null, inboxUid: null, starting: false };
const db = () => SenaOnline.db;
const me = () => SenaOnline.user;
const el = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const k in props) k === 'class' ? e.className = props[k] : k === 'onclick' ? e.onclick = props[k] : e.setAttribute(k, props[k]);
  kids.flat().forEach(c => e.append(c)); return e;
};
const CHAR_LABEL = { Intructor: 'Instructor' };
const charLabel = c => CHAR_LABEL[c] || c;
function setMsg(t, good) { const m = $('mpMsg'); m.textContent = t || ''; m.className = 'msg' + (good ? ' good' : ''); }
const isHost = () => st.players.length && me() && st.players[0].uid === me().id;

// ---------- pantalla ----------
function openScreen() {
  document.querySelectorAll('.screen.show').forEach(s => { if (s.id !== 'mpScreen') s.classList.remove('show'); });
  $('mpScreen').classList.add('show'); document.body.classList.add('acct-open');
  if (window.BG_YAMBORO) $('mpScreen').querySelector('.bgimg').style.backgroundImage = `url(${window.BG_YAMBORO})`;
  setMsg(''); render();
  if (st.ch) track(st.inLevel ? 'play' : 'lobby');
  if (SenaOnline.refreshFriends) SenaOnline.refreshFriends().then(renderFriends);
}
function closeScreen() { $('mpScreen').classList.remove('show'); document.body.classList.remove('acct-open'); }
function render() {
  const logged = !!me();
  $('mpNeedLogin').hidden = logged;
  $('mpLobby').querySelectorAll('.mp-card').forEach(c => { if (c.id !== 'mpNeedLogin') c.hidden = !logged; });
  $('mpLobby').hidden = !!st.ch; $('mpRoom').hidden = !st.ch;
  btn.lastChild.textContent = st.ch ? 'SALA ' + st.code : 'EN LÍNEA';
  if (st.ch) renderRoom();
}
function renderRoom() {
  $('mpRoomCode').textContent = st.code;
  const host = isHost(), meId = me() && me().id;
  const slots = [];
  for (let i = 0; i < MAX; i++) {
    const p = st.players[i];
    if (!p) { slots.push(el('div', { class: 'slot empty' }, el('div', { class: 'sframe' }), el('b', {}, 'Libre'), el('small', {}, 'Esperando jugador'))); continue; }
    const img = el('img', { alt: '' }); img.src = (window.PORTRAITS && window.PORTRAITS[p.char]) || '';
    const badges = el('div', { class: 'sbadges' });
    if (i === 0) badges.append(el('span', { class: 'host' }, 'Anfitrión'));
    if (p.uid === meId) badges.append(el('span', { class: 'you' }, 'Tú'));
    slots.push(el('div', { class: 'slot' + (p.uid === meId ? ' mine' : '') }, badges, el('div', { class: 'sframe' }, img),
      el('b', {}, p.name), p.st === 'play' ? el('small', { class: 'ingame' }, 'En el nivel') : el('small', {}, charLabel(p.char))));
  }
  $('mpSlots').replaceChildren(...slots);
  $('mpCountLbl').textContent = st.players.length + ' de ' + MAX;
  $('mpHostBox').hidden = !host; $('mpWaitBox').hidden = host;
  const hostMode = (st.players[0] && st.players[0].mode) || 'coop';
  if (!host) st.mode = hostMode;
  document.querySelectorAll('#mpRoom .modes button').forEach(b => { b.classList.toggle('on', b.dataset.mode === st.mode); b.disabled = !host; });
  $('mpModeWho').textContent = host ? 'Tú eliges el modo' + (modeOf(st.mode).arena ? '' : ' y el nivel') : 'Lo elige el anfitrión';
  $('mpLevelRow').hidden = !!modeOf(st.mode).arena;
  $('mpModeLbl').hidden = host; $('mpModeLbl').textContent = 'Modo: ' + modeOf(hostMode).desc;
  const playing = st.players.some(p => p.st === 'play');
  $('mpWaitTxt').textContent = playing ? 'La sala está jugando un nivel. Espera a que terminen.' : 'Esperando a que el anfitrión empiece...';
  $('mpStart').disabled = st.starting || playing;
  if (host) {
    const sel = $('mpLevel'), prev = sel.value, list = SENA_MP.levels().filter(l => l.open);
    if (sel.children.length !== list.length) sel.replaceChildren(...list.map(l => el('option', { value: `${l.world}-${l.level}` }, `${l.world}-${l.level}  ${l.name}`)));
    if (prev) sel.value = prev;
  }
  renderFriends(); renderResults();
}
function renderFriends() {
  const box = $('mpFriends'); if (!box) return;
  const fr = SenaOnline.friends || [], inRoom = new Set(st.players.map(p => p.uid));
  const nOn = fr.filter(f => SenaOnline.isOnline(f.last_seen)).length; $('friendsOn').textContent = nOn ? '(' + nOn + ')' : '';
  fr.sort((a, b) => SenaOnline.isOnline(b.last_seen) - SenaOnline.isOnline(a.last_seen));
  if (!fr.length) return box.replaceChildren(el('div', { class: 'pempty' }, 'Agrega amigos desde tu perfil para invitarlos.'));
  box.replaceChildren(...fr.map(f => {
    const on = SenaOnline.isOnline(f.last_seen);
    const action = inRoom.has(f.id) ? el('small', {}, 'en la sala') : el('button', { class: 'mini ok', onclick: e => invite(f, e.target) }, 'Invitar');
    return el('div', { class: 'prow' }, el('div', { class: 'pdot' + (on ? ' on' : '') }), el('div', { class: 'pinfo' }, el('b', {}, f.username), el('small', {}, on ? 'conectado' : 'desconectado')), el('div', { class: 'pact' }, action));
  }));
}
function renderResults() {
  const box = $('mpResults'), r = st.results;
  if (!r || !r.rows.size) { box.hidden = true; return; }
  box.hidden = false;
  if (r.mode === 'battle') {
    const rows = [...r.rows.values()].sort((a, b) => b.coins - a.coins || b.score - a.score);
    box.replaceChildren(el('div', { class: 'ptitle' }, 'Resultados ' + r.label),
      el('div', { class: 'rtable' }, el('div', { class: 'rh' }, el('span', {}, 'Puesto'), el('span', {}, 'Jugador'), el('span', {}, 'Monedas'), el('span', {}, 'Puntos')),
        ...rows.map((x, i) => el('div', { class: 'rr' + (i < 3 ? ' p' + (i + 1) : '') },
          el('span', {}, (i + 1) + '.'), el('span', {}, x.n), el('span', {}, String(x.coins)), el('span', {}, x.score.toLocaleString('es'))))));
    return;
  }
  if (r.mode === 'survival') {
    const rows = [...r.rows.values()].sort((a, b) => b.kills - a.kills || b.score - a.score);
    const wave = Math.max(0, ...rows.map(x => x.wave || 0));
    box.replaceChildren(el('div', { class: 'ptitle' }, 'Resultados ' + r.label + '  -  llegaron a la oleada ' + wave),
      el('div', { class: 'rtable' }, el('div', { class: 'rh' }, el('span', {}, 'Jugador'), el('span', {}, 'Bugs'), el('span', {}, 'Puntos'), el('span', {}, 'Oleada')),
        ...rows.map((x, i) => el('div', { class: 'rr' + (i === 0 ? ' first' : '') },
          el('span', {}, x.n), el('span', {}, String(x.kills)), el('span', {}, x.score.toLocaleString('es')), el('span', {}, String(x.wave || 0))))));
    return;
  }
  if (r.race) {
    const rows = [...r.rows.values()].sort((a, b) => (a.place || 99) - (b.place || 99) || b.score - a.score);
    box.replaceChildren(el('div', { class: 'ptitle' }, 'Resultados ' + r.label),
      el('div', { class: 'rtable' }, el('div', { class: 'rh' }, el('span', {}, 'Puesto'), el('span', {}, 'Jugador'), el('span', {}, 'Tiempo'), el('span', {}, 'Monedas')),
        ...rows.map(x => el('div', { class: 'rr' + (x.place && x.place <= 3 ? ' p' + x.place : '') },
          el('span', {}, x.place ? x.place + '.' : 'No llegó'), el('span', {}, x.n), el('span', {}, x.time ? x.time.toFixed(1) + ' s' : '-'), el('span', {}, String(x.coins))))));
    return;
  }
  const rows = [...r.rows.values()].sort((a, b) => b.score - a.score);
  box.replaceChildren(el('div', { class: 'ptitle' }, 'Resultados ' + r.label),
    el('div', { class: 'rtable' }, el('div', { class: 'rh' }, el('span', {}, 'Jugador'), el('span', {}, 'Puntos'), el('span', {}, 'Monedas'), el('span', {}, 'Bugs')),
      ...rows.map((x, i) => el('div', { class: 'rr' + (i === 0 ? ' first' : '') }, el('span', {}, x.n), el('span', {}, x.score.toLocaleString('es')), el('span', {}, String(x.coins)), el('span', {}, String(x.kills))))));
}

// ---------- sala ----------
function subscribe(ch) {
  return new Promise(res => {
    const t = setTimeout(() => res('TIMED_OUT'), 10000);
    ch.subscribe(s => { if (s === 'SUBSCRIBED' || s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') { clearTimeout(t); res(s); } });
  });
}
async function track(state) { if (st.ch && me()) await st.ch.track({ name: me().username, char: SENA_MP.char(), joined: st.joinedAt, st: state, mode: st.mode }); }
function onSync() {
  if (!st.ch) return;
  const ps = st.ch.presenceState();
  st.players = Object.entries(ps).map(([uid, arr]) => ({ uid, ...arr[0] })).sort((a, b) => a.joined - b.joined || (a.uid < b.uid ? -1 : 1));
  if (st.inLevel) {   // dibujar solo a quienes están en el nivel
    const meId = me() && me().id;
    st.players.forEach(p => { if (p.uid !== meId) { if (p.st === 'play') SENA_MP.join(p.uid, p.name, p.char); else SENA_MP.remove(p.uid); } });
  }
  if ($('mpScreen').classList.contains('show')) renderRoom(); else render();
}
async function joinRoom(code, creating) {
  if (!me()) return render();
  code = (code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length < 4) return setMsg('Escribe el código de la sala');
  await leaveRoom();
  setMsg('Conectando...', true);
  st.code = code; st.joinedAt = Date.now(); st.creating = creating; st.results = null; st.chatLog = []; renderChatLog();
  try { await db().realtime.setAuth(); } catch (_) {}
  let ch, status;
  for (let attempt = 0; attempt < 2; attempt++) {
    ch = db().channel('room:' + code, { config: { private: true, presence: { key: me().id }, broadcast: { self: false } } });
    ch.on('presence', { event: 'sync' }, onSync);
    ch.on('presence', { event: 'leave' }, ({ key }) => { if (st.inLevel) SENA_MP.remove(key); });
    ch.on('broadcast', { event: 'st' }, ({ payload }) => { if (st.inLevel && payload) SENA_MP.apply(payload.u, payload); });
    ch.on('broadcast', { event: 'ev' }, ({ payload }) => { if (st.inLevel && payload) SENA_MP.event(payload.u, payload.n, payload.type, payload.p); });
    ch.on('broadcast', { event: 'start' }, ({ payload }) => { if (!st.inLevel) beginCountdown(payload); });
    ch.on('broadcast', { event: 'done' }, ({ payload }) => addResult(payload));
    ch.on('broadcast', { event: 'chat' }, ({ payload }) => receiveChat(payload));
    status = await subscribe(ch);
    if (status === 'SUBSCRIBED') break;
    await db().removeChannel(ch);
  }
  if (status !== 'SUBSCRIBED') { st.code = ''; return setMsg('No se pudo conectar a la sala. Revisa tu internet.'); }
  st.ch = ch; await track('lobby'); setMsg(''); render();
  setTimeout(checkRoom, 2200);
}
async function checkRoom() {
  if (!st.ch || !me()) return;
  const idx = st.players.findIndex(p => p.uid === me().id);
  if (!st.creating && st.players.length <= 1) { await leaveRoom(); setMsg('No existe una sala con ese código'); return; }
  if (idx >= MAX) { await leaveRoom(); setMsg('La sala está llena (máximo 4 jugadores)'); }
}
async function leaveRoom() {
  if (st.inLevel) await leaveLevel(false);
  const ch = st.ch; st.ch = null; st.players = []; st.code = '';
  if (ch) { try { await ch.untrack(); } catch (_) {} try { await db().removeChannel(ch); } catch (_) {} }
  render();
}
function newCode() { let c = ''; const r = crypto.getRandomValues(new Uint8Array(5)); for (const b of r) c += ALPHA[b % ALPHA.length]; return c; }

// ---------- empezar un nivel ----------
async function startGame() {
  if (!isHost() || st.starting) return;
  let [world, level] = ($('mpLevel').value || '1-1').split('-').map(Number);
  if (modeOf(st.mode).arena) { world = 1; level = 1; }
  if (!world) return;
  const payload = { mode: st.mode, world, level, players: st.players.map(p => ({ uid: p.uid, name: p.name, char: p.char })) };
  st.starting = true; renderRoom();
  await st.ch.send({ type: 'broadcast', event: 'start', payload });
  beginCountdown(payload);
}
function beginCountdown(p) {
  if (st.inLevel) return;
  st.starting = true;
  const M = modeOf(p.mode);
  const name = M.arena ? '' : `${p.world}-${p.level} ` + ((SENA_MP.levels().find(l => l.world === p.world && l.level === p.level) || {}).name || '');
  st.results = { label: (M.label + ' ' + name).trim(), race: p.mode === 'race', mode: p.mode, rows: new Map() };
  closeScreen(); document.querySelectorAll('.screen.show').forEach(s => s.classList.remove('show'));
  const box = $('mpCount'); $('mpCountTxt').textContent = M.hud + (name ? '  -  ' + name : ''); box.hidden = false;
  let n = 3; $('mpCountN').textContent = n;
  const t = setInterval(() => {
    n--; if (n > 0) { $('mpCountN').textContent = n; return; }
    clearInterval(t); box.hidden = true; st.starting = false;
    enterLevel(p);
  }, 900);
}
function enterLevel(p) {
  if (!st.ch) return;
  st.inLevel = true;
  window.SENA_NET = { send: (type, payload) => { if (st.ch) st.ch.send({ type: 'broadcast', event: 'ev', payload: { u: me().id, n: me().username, type, p: payload } }); } };
  st.chatLog = st.chatLog.slice(-3); renderChatLog();
  const order = (p.players || []).map(q => q.uid).sort();
  SENA_MP.start({ mode: p.mode, world: p.world, level: p.level, me: me().id, order, players: st.players.filter(q => q.uid !== me().id).map(q => ({ uid: q.uid, name: q.name, char: q.char })) });
  track('play');
  clearInterval(st.timer);
  let last = '', lastT = 0;
  st.timer = setInterval(() => {
    const s = st.ch && SENA_MP.state(); if (!s) return;
    const j = JSON.stringify(s), now = Date.now();
    if (j === last && now - lastT < 1000) return;   // quieto: solo una señal de vida por segundo
    last = j; lastT = now;
    st.ch.send({ type: 'broadcast', event: 'st', payload: { u: me().id, ...s } });
  }, RATE);
}
async function leaveLevel(showLobby = true) {
  clearInterval(st.timer); st.inLevel = false; window.SENA_NET = null; $('chatPanel').hidden = true;
  api.leaving = true; SENA_MP.backToMenu(); api.leaving = false;
  await track('lobby');
  if (showLobby) openScreen();
}
function addResult(r) {
  if (!r || !st.results) return;
  st.results.rows.set(r.u, { n: r.n, coins: r.coins | 0, kills: r.kills | 0, score: r.score | 0, place: r.place | 0, time: +r.time || 0, wave: r.wave | 0 });
  if ($('mpScreen').classList.contains('show')) renderResults();
}
function levelDone(stats) {
  const r = { u: me().id, n: me().username, ...stats };
  if (st.ch) st.ch.send({ type: 'broadcast', event: 'done', payload: r });
  addResult(r);
  setTimeout(() => leaveLevel(true), 1500);
}

// ---------- chat ----------
const QUICK = ['¡Ayuda!', '¡Por aquí!', '¡Espérenme!', '¡Vamos!', '¡Cuidado!', '¡Gracias!', 'Jajaja', 'GG', '¡Les gané!', 'Revívanme'];
const FACE_NAME = { risa: 'risa', lloron: 'llorón', burla: 'burla', beso: 'besito', enojado: 'enojado', sorpresa: 'sorpresa', fuego: 'fuego', corazon: 'corazón', pulgar: 'bien' };
const BAD = /\b(hp|hpta|hijueputa|gonorrea|malpari\w*|marica|puta|puto|mierda|verga|culo|pendej\w*|imbecil|imbécil|idiota|estupid\w*|estúpid\w*)\b/gi;
const clean = t => t.replace(/[\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60).replace(BAD, m => '*'.repeat(m.length));
function faceImg(id) { const i = el('img', { alt: FACE_NAME[id] || '' }); i.src = SENA_FACE(id); return i; }
function chatLine(m) {
  const d = el('div', { class: 'cl' }, el('b', {}, m.n + ':'));
  if (m.k === 'f') d.append(faceImg(m.v)); else d.append(document.createTextNode(m.v));
  return d;
}
function renderChatLog() {
  const box = $('lobbyChat');
  if (box) { box.replaceChildren(...(st.chatLog.length ? st.chatLog.map(chatLine) : [el('div', { class: 'empty' }, 'Saluda a tus compañeros de sala')])); box.scrollTop = box.scrollHeight; }
}
function pushLevelLog(m) {
  const log = $('chatLog'), d = chatLine(m); log.append(d);
  while (log.children.length > 5) log.firstChild.remove();
  setTimeout(() => d.classList.add('old'), 8000); setTimeout(() => d.remove(), 8800);
}
function addChat(m) {
  st.chatLog.push(m); if (st.chatLog.length > 40) st.chatLog.shift();
  renderChatLog();
  if ($('sideChatBox').hidden) $('chatDot').hidden = false;
  if (st.inLevel) { pushLevelLog(m); SENA_MP.chat(m.u, m.k, m.v); }
}
function receiveChat(m) {
  if (!m || (m.k !== 't' && m.k !== 'f')) return;
  if (m.k === 'f' && !SENA_FACES.includes(m.v)) return;
  if (m.k === 't') { m.v = clean(String(m.v || '')); if (!m.v) return; }
  m.n = String(m.n || '?').slice(0, 16);
  addChat(m);
}
function sendChat(k, v) {
  if (!st.ch || !me()) return;
  const now = Date.now(); if (now - st.lastChat < 700) return; st.lastChat = now;
  if (k === 't') { v = clean(v); if (!v) return; }
  const m = { u: me().id, n: me().username, k, v };
  st.ch.send({ type: 'broadcast', event: 'chat', payload: m });
  addChat(m);
}
function buildChatButtons() {
  const faces = id => el('button', { type: 'button', title: FACE_NAME[id], onclick: () => { sendChat('f', id); $('chatPanel').hidden = true; } }, faceImg(id));
  $('cpFaces').replaceChildren(...SENA_FACES.map(faces));
  $('lcFaces').replaceChildren(...SENA_FACES.map(id => el('button', { type: 'button', title: FACE_NAME[id], onclick: () => sendChat('f', id) }, faceImg(id))));
  $('cpQuick').replaceChildren(...QUICK.map(q => el('button', { type: 'button', onclick: () => { sendChat('t', q); $('chatPanel').hidden = true; } }, q)));
}
function openChat() {
  if (!st.inLevel) return;
  const pnl = $('chatPanel'); pnl.hidden = !pnl.hidden;
  if (!pnl.hidden && !document.body.classList.contains('touch')) setTimeout(() => $('cpInput').focus(), 30);
}
$('cpForm').addEventListener('submit', e => { e.preventDefault(); sendChat('t', $('cpInput').value); $('cpInput').value = ''; $('chatPanel').hidden = true; $('cpInput').blur(); });
$('cpInput').addEventListener('keydown', e => { if (e.key === 'Escape') { $('chatPanel').hidden = true; $('cpInput').blur(); } });
$('lcForm').addEventListener('submit', e => { e.preventDefault(); sendChat('t', $('lcInput').value); $('lcInput').value = ''; });
$('chatBtn').onclick = openChat;
document.querySelectorAll('#mpRoom .modes button').forEach(b => b.onclick = () => { if (!isHost()) return; st.mode = b.dataset.mode; track('lobby'); renderRoom(); });
// pestañas Chat / Amigos de la sala
function sideTab(name) {
  $('sideChat').classList.toggle('on', name === 'chat'); $('sideFriends').classList.toggle('on', name === 'friends');
  $('sideChatBox').hidden = name !== 'chat'; $('sideFriendsBox').hidden = name !== 'friends';
  if (name === 'chat') $('chatDot').hidden = true;
}
$('sideChat').onclick = () => sideTab('chat');
$('sideFriends').onclick = () => { sideTab('friends'); if (SenaOnline.refreshFriends) SenaOnline.refreshFriends(); };
window.addEventListener('sena-friends', () => { if ($('mpScreen').classList.contains('show')) renderFriends(); });

// ---------- invitaciones ----------
async function invite(f, b) {
  if (!st.ch) return;
  if (b) { b.disabled = true; b.textContent = 'Enviada'; }
  const c = db().channel('inbox:' + f.id, { config: { private: true } });
  try { await c.send({ type: 'broadcast', event: 'invite', payload: { from: me().username, code: st.code } }); setMsg('Invitación enviada a ' + f.username, true); }
  catch (_) { setMsg('No se pudo enviar la invitación'); }
  finally { db().removeChannel(c); }
}
let pendingInvite = null;
async function watchInbox() {
  const uid = me() && me().id;
  if (uid === st.inboxUid) return;
  if (st.inbox) { try { await db().removeChannel(st.inbox); } catch (_) {} st.inbox = null; }
  st.inboxUid = uid; if (!uid) return;
  try { await db().realtime.setAuth(); } catch (_) {}
  const c = db().channel('inbox:' + uid, { config: { private: true } });
  c.on('broadcast', { event: 'invite' }, ({ payload }) => {
    if (!payload || !payload.code || st.code === payload.code) return;
    pendingInvite = payload; $('invFrom').textContent = payload.from; $('inviteBox').hidden = false;
    clearTimeout(watchInbox.t); watchInbox.t = setTimeout(() => { $('inviteBox').hidden = true; }, 30000);
  });
  st.inbox = c; subscribe(c);
}
setInterval(watchInbox, 3000);
$('invJoin').onclick = () => { $('inviteBox').hidden = true; if (!pendingInvite) return; if (SENA_MP.active()) leaveLevel(false); openScreen(); joinRoom(pendingInvite.code, false); };
$('invNo').onclick = () => { $('inviteBox').hidden = true; pendingInvite = null; };

// ---------- botones ----------
btn.onclick = () => openScreen();
$('mpBack').onclick = closeScreen;
$('mpLogin').onclick = () => { closeScreen(); SenaOnline.openAuth(); };
$('mpCreate').onclick = () => joinRoom(newCode(), true);
$('mpJoin').onclick = () => joinRoom($('mpCodeIn').value, false);
$('mpCodeIn').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); joinRoom($('mpCodeIn').value, false); } });
$('mpLeave').onclick = () => leaveRoom();
$('mpStart').onclick = startGame;
$('mpCopy').onclick = () => { navigator.clipboard?.writeText(st.code); setMsg('Código copiado: ' + st.code, true); };
addEventListener('keydown', e => { if (e.code === 'Escape' && $('mpScreen').classList.contains('show')) closeScreen(); });
addEventListener('beforeunload', () => { if (st.ch) st.ch.untrack(); });

const api = window.SenaMP = { leaving: false, levelDone, openChat, leaveLevel: () => leaveLevel(true), get state() { return st; } };
buildChatButtons(); renderChatLog();
render();
})();
