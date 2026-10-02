// Cuentas, amigos y progreso en la nube (Supabase). Todo es opcional: si no hay conexión o no hay sesión,
// el juego funciona igual con el progreso guardado en el navegador.
(() => {
'use strict';
const cfg = window.SENA_CONFIG, lib = window.supabase;
const $ = id => document.getElementById(id);
const chip = $('acctChip'), modal = $('acctModal');
if (!cfg || !lib || !chip) { if (chip) chip.style.display = 'none'; return; }

const db = lib.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true } });
const state = { user: null, profile: null, friends: [], incoming: [], outgoing: [], tab: 'login' };
const USER_RE = /^[A-Za-z0-9_]{3,16}$/;
const emailFor = u => u.toLowerCase() + '@' + cfg.emailDomain;

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
const ago = iso => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 150) return { on: true, text: 'conectado' };
  const m = s / 60; return { on: false, text: m < 60 ? `hace ${Math.round(m)} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d` };
};

// ---------- sesión y perfil ----------
async function loadProfile() {
  const { data: { session } } = await db.auth.getSession();
  state.user = session ? session.user : null;
  if (!state.user) { state.profile = null; return render(); }
  const { data, error } = await db.from('profiles').select('id,username,player_code,character_name,last_seen').eq('id', state.user.id).maybeSingle();
  state.profile = error ? null : data;
  render();
  if (state.profile) { await syncDown(); loadFriends(); db.rpc('touch_presence'); }
}
db.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') { state.user = state.profile = null; state.friends = state.incoming = state.outgoing = []; render(); } });
setInterval(() => { if (state.profile) db.rpc('touch_presence'); }, 60000);

// ---------- progreso en la nube ----------
// Une lo local con lo de la nube sin perder nada: lo mejor de cada lado.
function mergeProgress(a, b) {
  const A = a || {}, B = b || {}, pick = (x, y) => [Math.max(x?.[0] | 0, y?.[0] | 0), Math.max(x?.[1] | 0, y?.[1] | 0)];
  const done = pick(A.done, B.done);
  const useA = (A.done?.[0] | 0) + (A.done?.[1] | 0) >= (B.done?.[0] | 0) + (B.done?.[1] | 0);
  return { done, node: (useA ? A.node : B.node) || [0, 0], world: Math.max(A.world | 0, B.world | 0) };
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
const readLocal = key => { try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch (_) { return {}; } };
let saveTimer = 0, syncing = false;
async function syncDown() {
  syncing = true;
  try {
    const { data, error } = await db.from('game_progress').select('progress,powers,best_score').eq('user_id', state.user.id).maybeSingle();
    if (error || !data) return;
    const progress = mergeProgress(readLocal('senabros_progress'), data.progress), powers = mergePowers(readLocal('senabros_powers'), data.powers);
    localStorage.setItem('senabros_progress', JSON.stringify(progress)); localStorage.setItem('senabros_powers', JSON.stringify(powers));
    if (window.SENA_RELOAD) window.SENA_RELOAD();
    await db.from('game_progress').update({ progress, powers, updated_at: new Date().toISOString() }).eq('user_id', state.user.id);
  } finally { syncing = false; }
}
async function pushNow() {
  if (!state.profile || syncing) return;
  const patch = { progress: readLocal('senabros_progress'), powers: readLocal('senabros_powers'), updated_at: new Date().toISOString() };
  const best = window.SENA_BEST_SCORE ? window.SENA_BEST_SCORE() : 0;
  if (best > 0) patch.best_score = best;
  await db.from('game_progress').update(patch).eq('user_id', state.user.id);
}
window.SenaOnline = { queueSave() { clearTimeout(saveTimer); saveTimer = setTimeout(pushNow, 2500); }, get user() { return state.profile; } };

// ---------- amigos ----------
async function loadFriends() {
  const cols = 'id,username,player_code,character_name,last_seen';
  const { data, error } = await db.from('friendships').select(`id,status,requester_id,addressee_id,requester:profiles!friendships_requester_id_fkey(${cols}),addressee:profiles!friendships_addressee_id_fkey(${cols})`);
  if (error) return;
  const me = state.user.id;
  state.friends = data.filter(f => f.status === 'accepted').map(f => ({ fid: f.id, ...(f.requester_id === me ? f.addressee : f.requester) }));
  state.incoming = data.filter(f => f.status === 'pending' && f.addressee_id === me).map(f => ({ fid: f.id, ...f.requester }));
  state.outgoing = data.filter(f => f.status === 'pending' && f.requester_id === me).map(f => ({ fid: f.id, ...f.addressee }));
  renderFriends();
}
async function addFriend(id) {
  const { error } = await db.from('friendships').insert({ requester_id: state.user.id, addressee_id: id });
  setMsg(error ? (error.code === '23505' ? 'Ya existe una solicitud o amistad con esa persona' : friendly(error)) : '¡Solicitud enviada!', !error);
  await loadFriends(); $('fSearchOut').replaceChildren();
}
async function respond(fid, accept) {
  const { error } = accept ? await db.from('friendships').update({ status: 'accepted' }).eq('id', fid) : await db.from('friendships').delete().eq('id', fid);
  if (error) setMsg(friendly(error)); await loadFriends();
}

// ---------- interfaz ----------
function setMsg(text, good = false) { const m = $('acctMsg'); m.textContent = text || ''; m.className = good ? 'good' : ''; }
function render() {
  const p = state.profile;
  chip.textContent = p ? `👤 ${p.username}` : '👤 Entrar / Crear cuenta';
  chip.title = p ? `Tu ID: ${p.player_code}` : 'Guarda tu progreso y juega con amigos';
  $('acctOut').hidden = !!p; $('acctIn').hidden = !p;
  if (p) {
    $('meName').textContent = p.username; $('meCode').textContent = p.player_code;
    renderFriends();
  } else {
    $('tabLogin').classList.toggle('on', state.tab === 'login'); $('tabSignup').classList.toggle('on', state.tab === 'signup');
    $('acctGo').textContent = state.tab === 'login' ? 'ENTRAR' : 'CREAR CUENTA';
    $('acctPass').autocomplete = state.tab === 'login' ? 'current-password' : 'new-password';
    $('acctHint').textContent = state.tab === 'signup' ? 'Elige un usuario de 3 a 16 letras, números o _. Será tu nombre público.' : '';
  }
}
function personRow(f, actions) {
  const a = ago(f.last_seen);
  return el('div', { class: 'prow' },
    el('div', { class: 'pdot' + (a.on ? ' on' : '') }),
    el('div', { class: 'pinfo' }, el('b', {}, f.username), el('small', {}, `${f.player_code} · ${a.text}`)),
    el('div', { class: 'pact' }, actions));
}
function renderFriends() {
  const sec = (title, rows) => rows.length ? [el('div', { class: 'ptitle' }, title), ...rows] : [];
  $('fList').replaceChildren(
    ...sec(`Solicitudes recibidas (${state.incoming.length})`, state.incoming.map(f => personRow(f, [
      el('button', { class: 'mini ok', onclick: () => respond(f.fid, true) }, 'Aceptar'), el('button', { class: 'mini', onclick: () => respond(f.fid, false) }, 'Rechazar')]))),
    ...sec(`Amigos (${state.friends.length})`, state.friends.map(f => personRow(f, [el('button', { class: 'mini', onclick: () => { if (confirm(`¿Quitar a ${f.username} de tus amigos?`)) respond(f.fid, false); } }, 'Quitar')]))),
    ...sec('Solicitudes enviadas', state.outgoing.map(f => personRow(f, [el('button', { class: 'mini', onclick: () => respond(f.fid, false) }, 'Cancelar')]))),
    ...(state.friends.length + state.incoming.length + state.outgoing.length ? [] : [el('div', { class: 'pempty' }, 'Aún no tienes amigos. Búscalos por usuario o por su ID (SB-XXXXXX).')]));
  chip.classList.toggle('alert', state.incoming.length > 0);
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
    if (state.tab === 'signup') {
      const { data: free, error: e1 } = await db.rpc('username_available', { name: u });
      if (e1) throw e1; if (!free) throw { message: 'Ese usuario ya existe' };
      const { data, error } = await db.auth.signUp({ email: emailFor(u), password: pw, options: { data: { username: u } } });
      if (error) throw error;
      if (!data.session) throw { message: 'Cuenta creada, pero el servidor pide confirmar el correo. Avisa al administrador.' };
    } else {
      const { error } = await db.auth.signInWithPassword({ email: emailFor(u), password: pw });
      if (error) throw error;
    }
    setMsg(''); $('acctPass').value = ''; await loadProfile();
    if (window.SenaOnline) SenaOnline.queueSave();
  } catch (err) { setMsg(friendly(err)); } finally { btn.disabled = false; }
}
async function deleteAccount() {
  if (!confirm('¿Borrar tu cuenta para siempre? Se pierden tu usuario, tus amigos y tu progreso en la nube.')) return;
  const { error } = await db.rpc('delete_my_account'); if (error) return setMsg(friendly(error));
  await db.auth.signOut(); setMsg('Cuenta borrada', true); render();
}

chip.onclick = () => { modal.classList.add('show'); setMsg(''); if (state.profile) loadFriends(); };
$('acctClose').onclick = () => modal.classList.remove('show');
modal.addEventListener('pointerdown', e => { if (e.target === modal) modal.classList.remove('show'); });
addEventListener('keydown', e => { if (e.code === 'Escape' && modal.classList.contains('show')) modal.classList.remove('show'); });
$('tabLogin').onclick = () => { state.tab = 'login'; setMsg(''); render(); };
$('tabSignup').onclick = () => { state.tab = 'signup'; setMsg(''); render(); };
$('acctForm').addEventListener('submit', submit);
$('acctLogout').onclick = async () => { await db.auth.signOut(); modal.classList.remove('show'); };
$('acctDelete').onclick = deleteAccount;
$('fGo').onclick = search;
$('fSearch').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); search(); } });
$('meCopy').onclick = () => { navigator.clipboard?.writeText($('meCode').textContent); setMsg('ID copiado', true); };

render(); loadProfile();
})();
