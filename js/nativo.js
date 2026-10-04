// App de Windows y de Android: detecta dónde se juega, ofrece la descarga desde la web y
// avisa de las actualizaciones (con porcentaje) cuando se juega desde la app instalada.
// Los instaladores salen de GitHub Releases (los arma .github/workflows/release.yml al subir una etiqueta vN.N.N).
(() => {
'use strict';
const REPO = 'CristianT71/senabros', BASE = '/descargar/';   // la descarga sale de este mismo sitio (api/descargar.js la trae de GitHub Releases)
const FILES = { windows: 'SenaBros-Setup.exe', android: 'SenaBros.apk' };
const cap = window.Capacitor, desk = window.senaNative;
const kind = desk ? 'windows' : (cap && cap.isNativePlatform && cap.isNativePlatform()) ? 'android' : 'web';
const ua = navigator.userAgent, target = /Android/i.test(ua) ? 'android' : /Windows NT/i.test(ua) ? 'windows' : null;
const $ = id => document.getElementById(id);
const el = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') e.className = v; else if (k.startsWith('on')) e[k] = v; else if (k === 'html') e.innerHTML = v; else e.setAttribute(k, v); } e.append(...kids.filter(k => k != null)); return e; };
const toast = t => { const m = $('toast'); if (!m) return; m.textContent = t; m.classList.add('show'); setTimeout(() => m.classList.remove('show'), 2600); };
const mb = n => (n / 1048576).toFixed(1);
const APP = window.SENA_APP = { kind, native: kind !== 'web', target, version: '', check: () => check(true) };
document.body.classList.add('app-' + kind);
if (APP.native) document.body.classList.add('app-native');

// ---------- Android: plugin propio (descarga el APK con progreso y abre el instalador) ----------
const Apk = kind === 'android' ? cap.registerPlugin('ApkUpdater') : null;
APP.openExternal = url => { if (kind === 'android') Apk.openUrl({ url }).catch(() => {}); else window.open(url, '_blank'); };
const onAuth = u => { if (window.SENA_AUTH_CALLBACK) SENA_AUTH_CALLBACK(u); };
if (kind === 'windows') desk.onAuthUrl && desk.onAuthUrl(onAuth); else if (Apk) Apk.addListener('authUrl', d => onAuth(d.url));
const newer = (a, b) => { const x = String(a).replace(/^v/, '').split('.').map(Number), y = String(b).replace(/^v/, '').split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] | 0) !== (y[i] | 0)) return (x[i] | 0) > (y[i] | 0); } return false; };

// ---------- Ventana de actualización ----------
let box = null, cur = null, busy = false, fromUser = false;
function build() {
  if (box) return box;
  box = el('div', { id: 'updBox', hidden: '' }, el('div', { class: 'upd-card' },
    el('div', { class: 'upd-ico', html: '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="M7 11l5 5 5-5"/><path d="M5 20h14"/></svg>' }),
    el('h3', { id: 'updTitle' }, 'Nueva versión disponible'),
    el('p', { id: 'updText' }),
    el('div', { id: 'updBar', hidden: '' }, el('div', { class: 'upd-track' }, el('i', { id: 'updFill' })), el('div', { class: 'upd-line' }, el('b', { id: 'updPct' }, '0%'), el('span', { id: 'updInfo' }))),
    el('div', { class: 'upd-btns' }, el('button', { id: 'updGo', type: 'button', class: 'go', onclick: start }, 'ACTUALIZAR AHORA'), el('button', { id: 'updLater', type: 'button', class: 'later', onclick: () => { box.hidden = true; chip(); } }, 'Después'))));
  document.body.append(box); return box;
}
function chip() {
  let c = $('updChip');
  if (!cur) { if (c) c.remove(); return; }
  if (!c) { c = el('button', { id: 'updChip', type: 'button', onclick: () => show() }); document.body.append(c); }
  c.textContent = 'Nueva versión ' + cur.version + ' · ACTUALIZAR';
}
function show() {
  build(); $('updChip') && $('updChip').remove();
  $('updTitle').textContent = 'Nueva versión ' + cur.version;
  $('updText').textContent = 'Tu versión es la ' + APP.version + '. Actualiza para tener lo último del juego.';
  $('updBar').hidden = true; $('updGo').hidden = false; $('updGo').disabled = false; $('updLater').hidden = false; box.hidden = false;
}
function progress(pct, info) {
  build(); box.hidden = false; $('updBar').hidden = false; $('updGo').hidden = true; $('updLater').hidden = true;
  const p = Math.max(0, Math.min(100, pct)); $('updFill').style.width = p + '%'; $('updPct').textContent = Math.floor(p) + '%'; $('updInfo').textContent = info || '';
}
function fail(msg) {
  build(); box.hidden = false; busy = false; $('updTitle').textContent = 'No se pudo actualizar'; $('updText').textContent = msg || 'Revisa tu internet e inténtalo de nuevo.';
  $('updBar').hidden = true; $('updGo').hidden = false; $('updGo').textContent = 'REINTENTAR'; $('updLater').hidden = false;
}
async function start() {
  if (!cur || busy) return; busy = true; $('updTitle').textContent = 'Descargando ' + cur.version; $('updText').textContent = 'No cierres el juego mientras se descarga.'; progress(0, 'Conectando...');
  if (kind === 'windows') desk.download();
  else {
    try {
      await Apk.addListener('progress', d => progress(d.percent, mb(d.loaded) + ' / ' + mb(d.total) + ' MB'));
      await Apk.download({ url: cur.url, size: cur.size || 0 });
      progress(100, 'Listo'); $('updTitle').textContent = 'Instalando'; $('updText').textContent = 'Android te pedirá confirmar. Pulsa "Instalar".';
      await Apk.install(); busy = false; $('updLater').hidden = false; $('updGo').hidden = false; $('updGo').textContent = 'ABRIR INSTALADOR'; $('updGo').onclick = () => Apk.install().catch(() => {});
    } catch (e) {
      if (e && e.code === 'permission') { busy = false; $('updTitle').textContent = 'Falta un permiso'; $('updText').textContent = 'Activa "Permitir de esta fuente" para SENA Bros y vuelve a pulsar Actualizar.'; $('updBar').hidden = true; $('updGo').hidden = false; $('updGo').textContent = 'ACTUALIZAR'; $('updGo').onclick = start; $('updLater').hidden = false; }
      else fail();
    }
  }
}
async function check(manual) {
  fromUser = !!manual; if (busy) return;
  try {
    if (kind === 'windows') return await desk.check();
    if (kind !== 'android') return;
    const r = await fetch('https://api.github.com/repos/' + REPO + '/releases/latest', { headers: { Accept: 'application/vnd.github+json' } });
    if (!r.ok) throw 0;
    const j = await r.json(), asset = (j.assets || []).find(a => a.name === FILES.android);
    if (asset && newer(j.tag_name, APP.version)) { cur = { version: String(j.tag_name).replace(/^v/, ''), url: asset.browser_download_url, size: asset.size }; manual || !launched ? (launched = true, show()) : chip(); }
    else if (manual) toast('Ya tienes la última versión (' + APP.version + ')');
  } catch (_) { if (manual) toast('No se pudo buscar actualizaciones'); }
}
let launched = false;
if (kind === 'windows') desk.onUpdate(d => {
  if (d.state === 'available') { cur = { version: d.version }; (!launched || fromUser) ? (launched = true, show()) : chip(); }
  else if (d.state === 'none') { if (fromUser) toast('Ya tienes la última versión (' + APP.version + ')'); }
  else if (d.state === 'progress') progress(d.percent, mb(d.done) + ' / ' + mb(d.total) + ' MB');
  else if (d.state === 'ready') { progress(100, 'Listo'); $('updTitle').textContent = 'Instalando'; $('updText').textContent = 'El juego se va a reiniciar solo.'; setTimeout(() => desk.install(), 900); }
  else if (d.state === 'error') { if (busy) fail(); else if (fromUser) toast('No se pudo buscar actualizaciones'); }
});

// ---------- Descarga desde la web (Ajustes + aviso) ----------
function settingsBox() {
  const note = $('installNote'); if (!note) return;
  const sec = el('div', { id: 'dlBox' });
  if (APP.native) {
    sec.append(el('div', { class: 'ts-sec' }, 'VERSIÓN'), el('small', { class: 'ts-note', id: 'verNote' }, 'SENA Bros ' + (APP.version || '')),
      el('div', { class: 'ts-row' }, el('button', { type: 'button', onclick: () => check(true) }, 'Buscar actualizaciones')));
  } else if (target) {
    const name = target === 'windows' ? 'Windows (.exe)' : 'Android (.apk)';
    sec.append(el('div', { class: 'ts-sec' }, 'DESCARGAR LA APP'),
      el('div', { class: 'ts-row' }, el('a', { class: 'dlbtn', href: BASE + FILES[target], rel: 'noopener' }, 'Descargar para ' + name)),
      el('small', { class: 'ts-note' }, target === 'windows' ? 'Si Windows avisa, pulsa "Más información" y "Ejecutar de todos modos". Se actualiza sola.' : 'Al abrir el archivo, permite instalar desde esta fuente. Se actualiza desde el mismo juego.'));
  } else return;
  note.after(sec);
}
function promo() {
  if (APP.native || !target) return;
  try { if (localStorage.getItem('senabros_dl_hide')) return; } catch (_) {}
  setTimeout(() => {
    const name = target === 'windows' ? 'Windows' : 'Android';
    const p = el('div', { id: 'dlPromo' }, el('div', {}, el('b', {}, 'App para ' + name), el('small', {}, 'Más fluida, a pantalla completa y se actualiza sola.')),
      el('a', { class: 'dlbtn', href: BASE + FILES[target], rel: 'noopener' }, 'Descargar'),
      el('button', { type: 'button', 'aria-label': 'Cerrar', onclick: () => { p.remove(); try { localStorage.setItem('senabros_dl_hide', '1'); } catch (_) {} } }, '×'));
    document.body.append(p); setTimeout(() => p.remove(), 20000);
  }, 6000);
}

(async () => {
  if (kind === 'windows') APP.version = desk.version;
  else if (kind === 'android') { try { APP.version = (await Apk.info()).version; } catch (_) { APP.version = '1.0.0'; } }
  settingsBox(); promo();
  if (APP.native) { setTimeout(() => check(false), 3000); setInterval(() => { if (!busy) check(false); }, 20 * 60 * 1000); }
})();
})();
