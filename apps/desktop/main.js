// SENA Bros para Windows: abre el juego en una ventana y busca actualizaciones en GitHub Releases.
const { app, BrowserWindow, protocol, net, ipcMain, shell } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const { autoUpdater } = require('electron-updater');

const WWW = app.isPackaged ? path.join(process.resourcesPath, 'www') : path.join(__dirname, '..', 'www');
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

if (!app.requestSingleInstanceLock()) app.quit();
let win = null;
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 720, minWidth: 800, minHeight: 500, backgroundColor: '#0b1d0a', autoHideMenuBar: true, title: 'SENA Bros',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  win.removeMenu();
  win.loadURL('app://senabros/index.html');
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('before-input-event', (e, i) => {
    if (i.type !== 'keyDown') return;
    if (i.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    else if (i.key === 'Escape' && win.isFullScreen() && false) win.setFullScreen(false);
  });
  win.on('closed', () => { win = null; });
}

app.whenReady().then(() => {
  protocol.handle('app', req => {
    let p = decodeURIComponent(new URL(req.url).pathname); if (p === '/' || !p) p = '/index.html';
    const f = path.normalize(path.join(WWW, p));
    if (!f.startsWith(WWW)) return new Response('no', { status: 403 });
    return net.fetch(pathToFileURL(f).toString());
  });
  createWindow();
  app.on('activate', () => { if (!win) createWindow(); });
});
app.on('window-all-closed', () => app.quit());

// ---------- Actualizaciones ----------
const send = d => { if (win && !win.isDestroyed()) win.webContents.send('upd', d); };
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.on('update-available', i => send({ state: 'available', version: i.version }));
autoUpdater.on('update-not-available', () => send({ state: 'none' }));
autoUpdater.on('download-progress', p => send({ state: 'progress', percent: p.percent, done: p.transferred, total: p.total, speed: p.bytesPerSecond }));
autoUpdater.on('update-downloaded', () => send({ state: 'ready' }));
autoUpdater.on('error', e => send({ state: 'error', message: String((e && e.message) || e).slice(0, 160) }));
ipcMain.on('app:version', e => { e.returnValue = app.getVersion(); });
ipcMain.handle('upd:check', async () => { if (!app.isPackaged) return send({ state: 'none' }); try { await autoUpdater.checkForUpdates(); } catch (_) {} });
ipcMain.handle('upd:download', async () => { try { await autoUpdater.downloadUpdate(); } catch (_) {} });
ipcMain.handle('upd:install', () => { autoUpdater.quitAndInstall(true, true); });
