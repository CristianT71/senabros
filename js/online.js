// Cuentas, amigos, retos y progreso en la nube (Supabase). Todo es opcional: si no hay conexión o no hay sesión,
// el juego funciona igual con el progreso guardado en el navegador.
(() => {
'use strict';
const cfg = window.SENA_CONFIG, lib = window.supabase;
const $ = id => document.getElementById(id);
const chip = $('acctChip');
if (!cfg || !lib || !chip) {   // sin conexión con Supabase: se juega como invitado
  if (chip) chip.style.display = 'none';
  const a = $('authScreen'); if (a) a.classList.remove('show', 'checking');
  return;
}
[...document.querySelectorAll('.bgimg')].forEach(e => { if (window.BG_YAMBORO) e.style.backgroundImage = `url(${window.BG_YAMBORO})`; });

const db = lib.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true } });
const state = { user: null, profile: null, friends: [], incoming: [], outgoing: [], challenges: [], tab: 'login', sub: 'friends', hasCode: true, preFriend: null, screen: 'auth', guest: false, afterCode: 'none' };
const USER_RE = /^[A-Za-z0-9_]{3,16}$/;
const emailFor = u => u.toLowerCase() + '@' + cfg.emailDomain;
const KINDS = { coins: 'Más monedas', kills: 'Más bugs derrotados', score: 'Más puntos', time_left: 'Más tiempo restante' };

// ---------- utilidades ----------
const el = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const k in props) k === 'class' ? e.className = props[k] : k === 'onclick' ? e.onclick = props[k] : e.setAttribute(k, props[k]);
  kids.flat().forEach(c => e.append(c));
  return e;
};
function friendly(err) {
  const m = (err && (err.message || err.msg || err.error_description) || '').toLowerCase();
  if (m.includes('invalid login')) return 'Usuario o contraseña incorrectos';
  if (m.includes('already registered') || m.includes('already been registered')) return 'Ese usuario ya existe';
  if (m.includes('password') && m.includes('6')) return 'La contraseña debe tener mínimo 6 caracteres';
  if (m.includes('rate limit') || m.includes('too many')) return 'Demasiados intentos. Espera un momento';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Sin conexión con el servidor';
  if (m.includes('could not find') || m.includes('does not exist')) return 'El servidor aún no está listo (faltan las tablas)';
  return err && err.message ? err.message : 'Ocurrió un error';
}
// diferencia entre el reloj del servidor y el del dispositivo (si el celular tiene la hora mal, igual funciona)
let clockSkew = 0;
const isOnline = iso => !!iso && (Date.now() + clockSkew - new Date(iso).getTime()) / 1000 < 150;
const ago = iso => {
  const s = (Date.now() + clockSkew - new Date(iso).getTime()) / 1000;
  if (s < 150) return { on: true, text: 'conectado' };
  const m = s / 60; return { on: false, text: m < 60 ? `hace ${Math.round(m)} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d` };
};
function setMsg(text, good = false) {
  const cur = { auth: 'authMsg', profile: 'profMsg', code: 'codeMsg' }[state.screen];
  for (const id of ['authMsg', 'profMsg', 'codeMsg']) { const m = $(id); m.textContent = id === cur ? (text || '') : ''; m.className = 'msg' + (good && id === cur ? ' good' : ''); }
}
function showScreen(name) {
  state.screen = name;
  for (const [id, key] of [['authScreen', 'auth'], ['profileScreen', 'profile'], ['codeScreen', 'code']]) $(id).classList.toggle('show', key === name);
  document.body.classList.toggle('acct-open', name !== 'none');
  if (name === 'profile') renderProfile();
  setMsg('');
}
const endChecking = () => $('authScreen').classList.remove('checking');
const show = (id, on) => { $(id).hidden = !on; };

// ---------- sesión y perfil ----------
let loadingProfile = false;
async function loadProfile() {
  if (loadingProfile) return; loadingProfile = true;
  try {
    const { data: { session } } = await db.auth.getSession();
    state.user = session ? session.user : null;
    if (!state.user) { state.profile = null; endChecking(); if (!state.guest && state.screen !== 'code') showScreen('auth'); return render(); }
    const { data, error } = await db.from('profiles').select('id,username,player_code,character_name,last_seen,username_changed').eq('id', state.user.id).maybeSingle();
    state.profile = error ? null : data;
    endChecking();
    if (state.profile && state.guest) { state.guest = false; if (window.SENA_SET_GUEST) SENA_SET_GUEST(false); }
    if (state.profile && state.screen === 'auth') showScreen('none');
    if (!state.profile && state.screen !== 'code') showScreen('auth');
    render();
    if (state.profile) { await syncDown(); await touchPresence(); await Promise.all([loadFriends(), loadChallenges(), loadRecoveryStatus()]); }
  } finally { loadingProfile = false; }
}
db.auth.onAuthStateChange((ev) => {
  if (ev === 'SIGNED_IN' && !state.profile && !loadingProfile) loadProfile();
  if (ev === 'SIGNED_OUT') {
    state.user = state.profile = null; state.friends = state.incoming = state.outgoing = state.challenges = []; state.guest = false;
    for (const k of ['senabros_progress', 'senabros_powers', 'senabros_best', 'senabros_stats', 'senabros_wardrobe']) { try { localStorage.removeItem(k); } catch (_) {} }   // el progreso queda en la nube; no se mezcla con la próxima cuenta
    if (window.SENA_SET_GUEST) SENA_SET_GUEST(false);
    if (window.SENA_RELOAD) SENA_RELOAD();
    showScreen('auth'); render();
  }
});
async function touchPresence() {
  const t0 = Date.now(), { data, error } = await db.rpc('touch_presence');
  if (!error && data) clockSkew = new Date(data).getTime() - (t0 + Date.now()) / 2;
}
setInterval(() => { if (state.profile) { touchPresence(); loadFriends(); loadChallenges(); } }, 45000);
// al volver a la pestaña (el navegador frena los temporizadores en segundo plano)
document.addEventListener('visibilitychange', () => { if (!document.hidden && state.profile) { touchPresence(); loadFriends(); } });

// ---------- progreso en la nube ----------
// Une lo local con lo de la nube sin perder nada: lo mejor de cada lado.
function mergeProgress(a, b) {
  const A = a || {}, B = b || {}, pick = (x, y) => [0, 1, 2, 3].map(i => Math.max(x?.[i] | 0, y?.[i] | 0));
  const done = pick(A.done, B.done);
  const sum = d => [0, 1, 2, 3].reduce((n, i) => n + (d?.[i] | 0), 0), useA = sum(A.done) >= sum(B.done);
  return { done, node: (useA ? A.node : B.node) || [0, 0, 0, 0], world: Math.max(A.world | 0, B.world | 0) };
}
function mergePowers(a, b) {
  const out = {}, A = a || {}, B = b || {};
  for (const id of new Set([...Object.keys(A), ...Object.keys(B)])) {
    const x = A[id] || {}, y = B[id] || {}, m = {};
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) m[k] = (typeof x[k] === 'boolean' || typeof y[k] === 'boolean') ? !!(x[k] || y[k]) : Math.max(x[k] | 0, y[k] | 0);
    out[id] = m;
  }
  return out;
}
// mismas groserías que revisa el servidor (has_bad_word): solo para avisar antes de enviar
window.SENA_BAD = { test: t => /(hijueputa|hijuepu|hpta|gonorrea|malparid|careverga|caremonda|pendej|maric[oó]n)/i.test(t) || /(^|[^a-záéíóúñ])(hp|puta|puto|putas|mierda|verga|marica|culo|imbecil|imbécil|idiota|estupid[oa]s?|estúpid[oa]s?|perra|zorra|chimba|guevon|huevon|gueva|malparido)([^a-záéíóúñ]|$)/i.test(t) };
const readLocal = key => { try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch (_) { return {}; } };
// estadísticas: contadores que solo suben, se queda el mayor de cada lado
function mergeStats(a, b) { const out = {}, A = a || {}, B = b || {}; for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) out[k] = Math.max(A[k] | 0, B[k] | 0); return out; }
let saveTimer = 0, syncing = false;
async function syncDown() {
  syncing = true;
  try {
    const { data, error } = await db.from('game_progress').select('progress,powers,best_score,stats,wardrobe').eq('user_id', state.user.id).maybeSingle();
    if (error || !data) return;
    const progress = mergeProgress(readLocal('senabros_progress'), data.progress), powers = mergePowers(readLocal('senabros_powers'), data.powers);
    const stats = mergeStats(readLocal('senabros_stats'), data.stats);
    localStorage.setItem('senabros_progress', JSON.stringify(progress)); localStorage.setItem('senabros_powers', JSON.stringify(powers));
    localStorage.setItem('senabros_stats', JSON.stringify(stats)); localStorage.setItem('senabros_wardrobe', JSON.stringify(data.wardrobe || {}));
    if (window.SENA_RELOAD) window.SENA_RELOAD();
    await db.from('game_progress').update({ progress, powers, stats, updated_at: new Date().toISOString() }).eq('user_id', state.user.id);
  } finally { syncing = false; }
}
async function pushNow() {
  if (!state.profile || syncing) return;
  if (window.SENA_SHOP) SENA_SHOP.flush();
  const patch = { progress: readLocal('senabros_progress'), powers: readLocal('senabros_powers'), stats: readLocal('senabros_stats'), updated_at: new Date().toISOString() };
  const best = window.SENA_BEST_SCORE ? window.SENA_BEST_SCORE() : 0;
  if (best > 0) patch.best_score = best;
  await db.from('game_progress').update(patch).eq('user_id', state.user.id);
}

// ---------- amigos ----------
async function loadFriends() {
  if (!state.user) return;
  const cols = 'id,username,player_code,character_name,last_seen';
  const { data, error } = await db.from('friendships').select(`id,status,requester_id,addressee_id,requester:profiles!friendships_requester_id_fkey(${cols}),addressee:profiles!friendships_addressee_id_fkey(${cols})`);
  if (error || !state.user) return;   // la sesión pudo cerrarse mientras se cargaba
  const me = state.user.id;
  state.friends = data.filter(f => f.status === 'accepted').map(f => ({ fid: f.id, ...(f.requester_id === me ? f.addressee : f.requester) }));
  state.incoming = data.filter(f => f.status === 'pending' && f.addressee_id === me).map(f => ({ fid: f.id, ...f.requester }));
  state.outgoing = data.filter(f => f.status === 'pending' && f.requester_id === me).map(f => ({ fid: f.id, ...f.addressee }));
  renderFriends(); renderChallengeForm(); updateBadges();
  window.dispatchEvent(new Event('sena-friends'));
}
async function addFriend(id) {
  const { error } = await db.from('friendships').insert({ requester_id: state.user.id, addressee_id: id });
  setMsg(error ? (error.code === '23505' ? 'Ya existe una solicitud o amistad con esa persona' : friendly(error)) : 'Solicitud enviada', !error);
  await loadFriends(); $('fSearchOut').replaceChildren();
}
async function respond(fid, accept) {
  const { error } = accept ? await db.from('friendships').update({ status: 'accepted' }).eq('id', fid) : await db.from('friendships').delete().eq('id', fid);
  if (error) setMsg(friendly(error)); await loadFriends();
}

// ---------- retos ----------
async function loadChallenges() {
  if (!state.user) return;
  const cols = 'id,username,player_code';
  const { data, error } = await db.from('challenges')
    .select(`id,kind,world,level,status,creator_id,opponent_id,creator_result,opponent_result,created_at,expires_at,creator:profiles!challenges_creator_id_fkey(${cols}),opponent:profiles!challenges_opponent_id_fkey(${cols})`)
    .order('created_at', { ascending: false }).limit(30);
  if (error || !state.user) return;
  state.challenges = data; renderChallenges(); updateBadges();
}
const levelLabel = (w, l) => { const L = (window.SENA_LEVELS ? window.SENA_LEVELS() : []).find(x => x.world === w && x.level === l); return `${w}-${l}${L ? ' ' + L.name : ''}`; };
function renderChallengeForm() {
  const f = $('chFriend'), prev = f.value || state.preFriend;
  f.replaceChildren(...(state.friends.length ? state.friends.map(x => el('option', { value: x.id }, x.username)) : [el('option', { value: '' }, 'Aún no tienes amigos')]));
  if (prev && state.friends.some(x => x.id === prev)) f.value = prev;
  const lv = $('chLevel'); if (!lv.children.length) {
    const list = window.SENA_LEVELS ? window.SENA_LEVELS() : [];
    lv.replaceChildren(...list.map(x => el('option', { value: `${x.world}-${x.level}` }, `${x.world}-${x.level}  ${x.name}`)));
  }
  $('chSend').disabled = !state.friends.length;
}
function challengeRow(c) {
  const me = state.user.id, mineIsCreator = c.creator_id === me;
  const other = mineIsCreator ? c.opponent : c.creator;
  const mine = mineIsCreator ? c.creator_result : c.opponent_result, theirs = mineIsCreator ? c.opponent_result : c.creator_result;
  const expired = c.status !== 'finished' && new Date(c.expires_at) < new Date();
  const head = el('div', { class: 'pinfo' }, el('b', {}, `${mineIsCreator ? 'Reto a' : 'Reto de'} ${other ? other.username : '?'}`),
    el('small', {}, `${KINDS[c.kind]} - nivel ${levelLabel(c.world, c.level)}`));
  const acts = []; let status = '';
  if (expired) status = 'Vencido';
  else if (c.status === 'pending') {
    if (mineIsCreator) { status = 'Esperando respuesta'; acts.push(el('button', { class: 'mini', onclick: () => cancelChallenge(c.id) }, 'Cancelar')); }
    else acts.push(el('button', { class: 'mini ok', onclick: () => answerChallenge(c.id, true) }, 'Aceptar'), el('button', { class: 'mini', onclick: () => answerChallenge(c.id, false) }, 'Rechazar'));
  } else if (c.status === 'active') {
    if (mine == null) acts.push(el('button', { class: 'mini ok', onclick: () => playChallenge(c) }, 'Jugar'));
    else status = `Tu resultado: ${mine}. Esperando a ${other ? other.username : 'tu rival'}`;
    if (mineIsCreator) acts.push(el('button', { class: 'mini', onclick: () => cancelChallenge(c.id) }, 'Cancelar'));
  } else if (c.status === 'finished') {
    const win = mine > theirs, tie = mine === theirs;
    status = `${tie ? 'Empate' : win ? 'Ganaste' : 'Perdiste'}: tú ${mine} - ${other ? other.username : 'rival'} ${theirs}`;
  } else if (c.status === 'declined') status = 'Rechazado';
  const row = el('div', { class: 'prow col' }, el('div', { class: 'prow in' }, head, el('div', { class: 'pact' }, acts)));
  if (status) row.append(el('div', { class: 'cstatus' + (c.status === 'finished' ? (mine > theirs ? ' win' : mine < theirs ? ' lose' : '') : '') }, status));
  return row;
}
function renderChallenges() {
  const list = state.challenges, box = $('chList');
  box.replaceChildren(...(list.length ? [el('div', { class: 'ptitle' }, 'Tus retos'), ...list.map(challengeRow)] : [el('div', { class: 'pempty' }, 'Todavía no tienes retos. Elige un amigo, un nivel y qué cuenta para ganar.')]));
}
async function sendChallenge() {
  const opp = $('chFriend').value, kind = $('chKind').value, [w, l] = $('chLevel').value.split('-').map(Number);
  if (!opp) return setMsg('Primero agrega a un amigo');
  $('chSend').disabled = true;
  const { error } = await db.rpc('create_challenge', { opponent: opp, kind, world: w, level: l });
  $('chSend').disabled = false;
  setMsg(error ? friendly(error) : 'Reto enviado', !error); await loadChallenges();
}
async function answerChallenge(id, accept) { const { error } = await db.rpc('respond_challenge', { challenge: id, accept }); if (error) setMsg(friendly(error)); await loadChallenges(); }
async function cancelChallenge(id) { if (!confirm('¿Cancelar este reto?')) return; const { error } = await db.rpc('cancel_challenge', { challenge: id }); if (error) setMsg(friendly(error)); await loadChallenges(); }
function playChallenge(c) {
  const other = c.creator_id === state.user.id ? c.opponent : c.creator;
  if (window.SENA_PLAY_CHALLENGE && SENA_PLAY_CHALLENGE({ id: c.id, kind: c.kind, world: c.world, level: c.level, rival: other ? other.username : '' })) showScreen('none');
}
// el juego llama a esto al terminar un nivel de reto
async function submitChallenge(id, value) {
  const { error } = await db.rpc('submit_challenge_result', { challenge: id, result: Math.max(0, Math.min(10000000, Math.round(value))) });
  await loadChallenges(); return error ? friendly(error) : '';
}

// ---------- código de recuperación ----------
async function loadRecoveryStatus() {
  const { data } = await db.rpc('has_recovery_code'); state.hasCode = data !== false;
  show('recAlert', !state.hasCode);
  $('recStatus').textContent = state.hasCode ? 'Tienes un código activo. Si generas uno nuevo, el anterior deja de servir.' : 'No tienes código de recuperación. Sin él no podrás recuperar tu contraseña si la olvidas.';
  $('recGen').textContent = state.hasCode ? 'Generar código nuevo' : 'Generar código';
  updateBadges();
}
async function generateCode() {
  if (state.hasCode && !confirm('Se generará un código nuevo y el anterior dejará de funcionar. ¿Continuar?')) return;
  const { data, error } = await db.rpc('create_recovery_code');
  if (error) return setMsg(friendly(error));
  state.afterCode = 'profile'; showCode(data); loadRecoveryStatus();
}
function showCode(code) {
  $('codeText').textContent = code;
  $('codeBoxes').replaceChildren(...code.split('-').map(g => el('span', {}, g)));
  $('codeSaved').checked = false; $('codeDone').disabled = true;
  showScreen('code');
}
function updateBadges() {
  const meId = state.user && state.user.id, pending = state.incoming.length, toPlay = state.challenges.filter(c => {
    const mine = c.creator_id === meId ? c.creator_result : c.opponent_result, exp = new Date(c.expires_at) < new Date();
    return !exp && ((c.status === 'pending' && c.opponent_id === meId) || (c.status === 'active' && mine == null));
  }).length;
  const b = $('chBadge'); b.hidden = toPlay === 0; b.textContent = toPlay;
  chip.classList.toggle('alert', !!state.profile && (pending + toPlay > 0 || !state.hasCode));
}

// ---------- interfaz ----------
function render() {
  const p = state.profile;
  chip.textContent = p ? p.username : state.guest ? 'Invitado: iniciar sesión' : 'Entrar / Crear cuenta';
  chip.title = p ? `Tu ID: ${p.player_code}` : 'Guarda tu progreso y juega con amigos';
  $('tabLogin').classList.toggle('on', state.tab === 'login'); $('tabSignup').classList.toggle('on', state.tab === 'signup');
  $('acctGo').textContent = state.tab === 'login' ? 'ENTRAR' : 'CREAR CUENTA';
  $('acctPass').autocomplete = state.tab === 'login' ? 'current-password' : 'new-password';
  $('acctHint').textContent = state.tab === 'signup' ? 'Elige un usuario de 3 a 16 letras, números o _. Será tu nombre público.' : '';
  show('acctForgot', state.tab === 'login');
  if (state.screen === 'profile') renderProfile();
  updateBadges();
}
function renderProfile() {
  const p = state.profile; if (!p) return;
  $('meName').textContent = p.username; $('meCode').textContent = p.player_code; $('meRename').hidden = !!p.username_changed;
  const ch = window.SENA_CURRENT_CHAR ? SENA_CURRENT_CHAR() : ['Diego', 'Diego'];
  $('pPortrait').src = (window.PORTRAITS && window.PORTRAITS[ch[0]]) || ''; $('pChar').textContent = 'Instructor: ' + ch[1];
  const st = window.SENA_STATS ? SENA_STATS() : { best: 0, levels: 0, totalLevels: 11, powers: 0, totalPowers: 7 };
  const meId = state.user && state.user.id;
  const wins = state.challenges.filter(c => c.status === 'finished' && (c.creator_id === meId ? c.creator_result > c.opponent_result : c.opponent_result > c.creator_result)).length;
  $('stBest').textContent = (st.best || 0).toLocaleString('es'); $('stLevels').textContent = `${st.levels}/${st.totalLevels}`; $('stPowers').textContent = `${st.powers}/${st.totalPowers}`; $('stWins').textContent = wins;
  const pw = window.SENA_POWER_INFO ? SENA_POWER_INFO() : null;
  if (pw) { $('ppName').textContent = pw.name; $('ppText').textContent = pw.unlocked ? pw.desc : `Bloqueado. Misión: ${pw.mission} (${pw.progress}/${pw.goal})`; }
  renderFriends(); renderChallenges(); setSub(state.sub);
}
function setSub(name) {
  state.sub = name;
  for (const [id, key] of [['stFriends', 'friends'], ['stGroups', 'groups'], ['stChallenges', 'challenges'], ['stSecurity', 'security']]) $(id).classList.toggle('on', key === name);
  show('secFriends', name === 'friends'); show('secGroups', name === 'groups'); show('secChallenges', name === 'challenges'); show('secSecurity', name === 'security');
  if (name === 'groups' && window.SenaGroups) SenaGroups.open(); else if (window.SenaGroups) SenaGroups.stop();
  if (name === 'challenges') renderChallengeForm();
}
function personRow(f, actions) {
  const a = ago(f.last_seen);
  return el('div', { class: 'prow' },
    el('div', { class: 'pdot' + (a.on ? ' on' : '') }),
    el('div', { class: 'pinfo clickable', 'data-profile': f.id, title: 'Ver perfil' }, el('b', {}, f.username), el('small', {}, `${f.player_code} - ${a.text}`)),
    el('div', { class: 'pact' }, actions));
}
function renderFriends() {
  const sec = (title, rows) => rows.length ? [el('div', { class: 'ptitle' }, title), ...rows] : [];
  const retar = f => el('button', { class: 'mini ok', onclick: () => { state.preFriend = f.id; setSub('challenges'); $('chFriend').value = f.id; } }, 'Retar');
  $('fList').replaceChildren(
    ...sec(`Solicitudes recibidas (${state.incoming.length})`, state.incoming.map(f => personRow(f, [
      el('button', { class: 'mini ok', onclick: () => respond(f.fid, true) }, 'Aceptar'), el('button', { class: 'mini', onclick: () => respond(f.fid, false) }, 'Rechazar')]))),
    ...sec(`Amigos (${state.friends.length})`, state.friends.map(f => personRow(f, [retar(f), el('button', { class: 'mini', onclick: () => { if (confirm(`¿Quitar a ${f.username} de tus amigos?`)) respond(f.fid, false); } }, 'Quitar')]))),
    ...sec('Solicitudes enviadas', state.outgoing.map(f => personRow(f, [el('button', { class: 'mini', onclick: () => respond(f.fid, false) }, 'Cancelar')]))),
    ...(state.friends.length + state.incoming.length + state.outgoing.length ? [] : [el('div', { class: 'pempty' }, 'Aún no tienes amigos. Búscalos por usuario o por su ID (SB-XXXXXX).')]));
}
async function search() {
  const q = $('fSearch').value.trim(); const out = $('fSearchOut');
  if (q.length < 2) return out.replaceChildren(el('div', { class: 'pempty' }, 'Escribe al menos 2 caracteres'));
  const { data, error } = await db.rpc('search_players', { q });
  if (error) return setMsg(friendly(error));
  const known = new Set([...state.friends, ...state.incoming, ...state.outgoing].map(f => f.id));
  out.replaceChildren(...(data.length ? data.map(f => personRow(f, [known.has(f.id) ? el('small', {}, 'ya agregado') : el('button', { class: 'mini ok', onclick: () => addFriend(f.id) }, 'Agregar')]))
    : [el('div', { class: 'pempty' }, 'No encontramos a nadie con ese usuario o ID')]));
}
async function submit(e) {
  e.preventDefault();
  const u = $('acctUser').value.trim(), pw = $('acctPass').value, btn = $('acctGo');
  if (!USER_RE.test(u)) return setMsg('Usuario inválido: 3 a 16 letras, números o _');
  if (pw.length < 6) return setMsg('La contraseña debe tener mínimo 6 caracteres');
  btn.disabled = true; setMsg('Un momento...', true);
  try {
    let newCode = null;
    if (state.tab === 'signup') {
      const { data: free, error: e1 } = await db.rpc('username_available', { name: u });
      if (e1) throw e1; if (!free) throw { message: window.SENA_BAD && SENA_BAD.test(u.replace(/_/g, ' ')) ? 'Ese usuario no está permitido' : 'Ese usuario ya existe' };
      const { data, error } = await db.auth.signUp({ email: emailFor(u), password: pw, options: { data: { username: u } } });
      if (error) throw error;
      if (!data.session) throw { message: 'Cuenta creada, pero el servidor pide confirmar el correo. Avisa al administrador.' };
      const r = await db.rpc('create_recovery_code'); if (!r.error) newCode = r.data;
    } else {
      const { error } = await db.auth.signInWithPassword({ email: emailFor(u), password: pw });
      if (error) throw error;
    }
    setMsg(''); $('acctPass').value = '';
    if (newCode) { state.afterCode = 'none'; showCode(newCode); }       // se muestra una sola vez, antes de entrar al juego
    await loadProfile();
    if (window.SenaOnline) SenaOnline.queueSave();
  } catch (err) { setMsg(friendly(err)); } finally { btn.disabled = false; }
}
async function recover(e) {
  e.preventDefault();
  const u = $('rcUser').value.trim(), code = $('rcCode').value.trim(), pw = $('rcPass').value, btn = $('rcGo');
  if (!USER_RE.test(u)) return setMsg('Usuario inválido');
  if (pw.length < 6) return setMsg('La contraseña nueva debe tener mínimo 6 caracteres');
  btn.disabled = true; setMsg('Un momento...', true);
  const { data, error } = await db.rpc('recover_password', { uname: u, code, new_password: pw });
  btn.disabled = false;
  if (error) return setMsg(friendly(error));
  if (data === 'locked') return setMsg('Demasiados intentos fallidos. Espera 15 minutos');
  if (data !== 'ok') return setMsg('Usuario o código incorrecto');
  state.tab = 'login'; $('acctUser').value = u; $('acctPass').value = ''; $('rcPass').value = ''; $('rcCode').value = '';
  show('acctRecover', false); show('acctMain', true); render();
  setMsg('Contraseña cambiada. Ya puedes entrar. Después genera un código nuevo en Seguridad.', true);
}
async function deleteAccount() {
  if (!confirm('¿Borrar tu cuenta para siempre? Se pierden tu usuario, tus amigos y tu progreso en la nube.')) return;
  const { error } = await db.rpc('delete_my_account'); if (error) return setMsg(friendly(error));
  await db.auth.signOut();
  setMsg('Cuenta borrada', true);
}

// ---------- eventos ----------
function startGuest() {
  state.guest = true; if (window.SENA_SET_GUEST) SENA_SET_GUEST(true);
  endChecking(); showScreen('none'); render();
}
const openProfile = sub => { showScreen('profile'); if (sub) setSub(sub); loadFriends(); loadChallenges(); loadRecoveryStatus(); };
chip.onclick = () => { if (state.profile) openProfile(); else { showScreen('auth'); setMsg(''); } };
$('guestBtn').onclick = startGuest;
$('profBack').onclick = () => showScreen('none');
addEventListener('keydown', e => { if (e.code === 'Escape' && state.screen === 'profile') showScreen('none'); });
$('tabLogin').onclick = () => { state.tab = 'login'; setMsg(''); render(); };
$('tabSignup').onclick = () => { state.tab = 'signup'; setMsg(''); render(); };
$('acctForm').addEventListener('submit', submit);
$('acctForgot').onclick = () => { setMsg(''); $('rcUser').value = $('acctUser').value; show('acctMain', false); show('acctRecover', true); };
$('rcBack').onclick = () => { setMsg(''); show('acctRecover', false); show('acctMain', true); };
$('acctRecover').addEventListener('submit', recover);
$('codeCopy').onclick = () => { navigator.clipboard?.writeText($('codeText').textContent); setMsg('Código copiado', true); };
$('codeDownload').onclick = () => {
  const blob = new Blob([`SENA Bros - código de recuperación\nUsuario: ${state.profile ? state.profile.username : ''}\nCódigo: ${$('codeText').textContent}\n\nGuárdalo en un lugar seguro. Sirve una sola vez.\n`], { type: 'text/plain' });
  const a = el('a', { href: URL.createObjectURL(blob), download: 'senabros-recuperacion.txt' }); document.body.append(a); a.click(); a.remove();
};
$('codeSaved').onchange = () => { $('codeDone').disabled = !$('codeSaved').checked; };
$('codeDone').onclick = () => { if ($('codeDone').disabled) return; $('codeText').textContent = '----'; showScreen(state.afterCode === 'profile' && state.profile ? 'profile' : 'none'); render(); };
$('acctLogout').onclick = async () => { await pushNow(); await db.auth.signOut(); };
$('acctDelete').onclick = deleteAccount;
$('recGen').onclick = generateCode; $('recAlertGo').onclick = generateCode;
$('stFriends').onclick = () => setSub('friends'); $('stChallenges').onclick = () => { setSub('challenges'); loadChallenges(); }; $('stSecurity').onclick = () => setSub('security');
$('stGroups').onclick = () => setSub('groups');
$('chSend').onclick = sendChallenge; $('chRefresh').onclick = loadChallenges;
$('fGo').onclick = search;
$('fSearch').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); search(); } });
$('meCopy').onclick = () => { navigator.clipboard?.writeText($('meCode').textContent); setMsg('ID copiado', true); };
$('acctGoogle').onclick = async () => {
  const btn = $('acctGoogle'); btn.disabled = true; setMsg('Abriendo Google...', true);
  const { error } = await db.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
  if (error) { setMsg(friendly(error)); btn.disabled = false; }
};
$('meRename').onclick = async () => {
  const n = (prompt('Elige tu usuario (3 a 16 letras, números o _). Solo podrás cambiarlo una vez:', state.profile.username) || '').trim();
  if (!n || n === state.profile.username) return;
  if (!USER_RE.test(n)) return setMsg('Usuario inválido: 3 a 16 letras, números o _');
  const { error } = await db.rpc('change_username', { new_name: n });
  if (error) return setMsg(friendly(error));
  setMsg('Usuario cambiado', true); await loadProfile();
};

window.SenaOnline = {
  queueSave() { clearTimeout(saveTimer); saveTimer = setTimeout(pushNow, 2500); },
  get user() { return state.profile; },
  get friends() { return state.friends; },
  get isGuest() { return state.guest; },
  db,
  openAuth() { showScreen('auth'); },
  refreshFriends: () => loadFriends(),
  // perfil público de otro jugador (js/perfil.js)
  async publicProfile(who) { const { data, error } = await db.rpc('get_public_profile', { who }); return error ? { error: friendly(error) } : { profile: (data || [])[0] }; },
  async addFriendId(id) { const { error } = await db.from('friendships').insert({ requester_id: state.user.id, addressee_id: id }); await loadFriends(); return error ? (error.code === '23505' ? 'Ya existe una solicitud o amistad' : friendly(error)) : null; },
  // niveles de la comunidad (js/editor.js)
  async publishLevel(title, theme, data) { const { data: code, error } = await db.rpc('publish_level', { title, theme, data }); return error ? { error: friendly(error) } : { code }; },
  async listLevels(sort, q) { const { data, error } = await db.rpc('list_levels', { sort, q: q || '' }); return error ? { error: friendly(error) } : { rows: data || [] }; },
  async getLevel(code) { const { data, error } = await db.rpc('get_level', { level_code: code }); return error ? { error: friendly(error) } : { level: (data || [])[0] }; },
  async clearLevel(code) { await db.rpc('clear_level', { level_code: code }); },
  async likeLevel(code, on) { const { data, error } = await db.rpc('like_level', { level_code: code, on_off: on }); return error ? null : data; },
  async reportLevel(code, reason) { const { error } = await db.rpc('report_level', { level_code: code, reason }); return error ? friendly(error) : null; },
  async deleteLevel(code) { const { error } = await db.rpc('delete_level', { level_code: code }); return error ? friendly(error) : null; },
  // ranking semanal, tienda y campeones (js/premios.js)
  async submitScore(board, val) { if (!state.profile) return; const { error } = await db.rpc('submit_score', { board_name: board, val: Math.round(val) }); if (error) console.warn('ranking:', error.message); },
  async ranking(board, weeksAgo = 0) { const { data, error } = await db.rpc('get_ranking', { board_name: board, weeks_ago: weeksAgo }); return error ? { error: friendly(error) } : { rows: data || [] }; },
  async champions() { const { data } = await db.rpc('weekly_champions'); return data || []; },
  async buy(item) {
    if (!state.profile) return { error: 'Inicia sesión para comprar' };
    clearTimeout(saveTimer); await pushNow();   // primero sube las monedas ganadas
    const { data, error } = await db.rpc('buy_item', { item });
    if (error) return { error: friendly(error) };
    localStorage.setItem('senabros_wardrobe', JSON.stringify(data)); SENA_SHOP.setWardrobe(data); return { ok: true };
  },
  async equip(eq) {
    if (!state.profile) return { error: 'Inicia sesión' };
    const { data, error } = await db.rpc('equip_items', { eq });
    if (error) return { error: friendly(error) };
    localStorage.setItem('senabros_wardrobe', JSON.stringify(data)); SENA_SHOP.setWardrobe(data); return { ok: true };
  },
  isOnline,
  submitChallenge,
  openChallenges() { openProfile('challenges'); },
};
render(); loadProfile();
})();
