// Gamut Repair — desktop shell.
// The screens live on the factory server; this app opens them full-screen on each PC.
// Updating the server updates every PC at once — nothing to reinstall on the PCs.
const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const CONFIG_FILE = path.join(app.getPath('userData'), 'config.json');

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeConfig(cfg) {
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

function normalizeUrl(raw) {
  let url = String(raw || '').trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  try {
    const u = new URL(url);
    return u.origin;
  } catch {
    return null;
  }
}

let win;
let retryTimer;

async function serverReachable(url) {
  try {
    const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(4000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function openApp() {
  clearTimeout(retryTimer);
  const { serverUrl } = readConfig();
  if (!serverUrl) {
    win.loadFile(path.join(__dirname, 'setup.html'));
    return;
  }
  if (await serverReachable(serverUrl)) {
    win.loadURL(serverUrl);
  } else {
    win.loadFile(path.join(__dirname, 'offline.html'), { query: { server: serverUrl } });
    retryTimer = setTimeout(openApp, 5000);
  }
}

function createWindow() {
  const cfg = readConfig();
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f8f9fa',
    title: 'Gamut Repair',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  if (cfg.fullscreen !== false) win.maximize();
  if (cfg.kiosk) win.setKiosk(true);
  win.once('ready-to-show', () => win.show());

  // Only the factory server is allowed inside the window.
  win.webContents.on('will-navigate', (e, url) => {
    const { serverUrl } = readConfig();
    if (url.startsWith('file://')) return;
    if (!serverUrl || !url.startsWith(serverUrl)) e.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // If the server drops while working, the page shows its own red banner and reconnects.
  // If the page itself cannot load, go to the offline screen and keep retrying.
  win.webContents.on('did-fail-load', (_e, code, _desc, url) => {
    if (code === -3 || url.startsWith('file://')) return; // -3 = aborted navigation
    openApp();
  });

  openApp();
}

function buildMenu() {
  const template = [
    {
      label: 'Gamut',
      submenu: [
        { label: 'Reload', accelerator: 'F5', click: () => openApp() },
        { label: 'Full screen', accelerator: 'F11', click: () => win.setFullScreen(!win.isFullScreen()) },
        { type: 'separator' },
        {
          label: 'Change server address…',
          click: () => {
            const cfg = readConfig();
            delete cfg.serverUrl;
            writeConfig(cfg);
            openApp();
          },
        },
        { label: 'Developer tools', accelerator: 'Ctrl+Shift+I', click: () => win.webContents.toggleDevTools() },
        { type: 'separator' },
        { role: 'quit', label: 'Quit' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.handle('gamut:set-server', async (_e, raw) => {
  const url = normalizeUrl(raw);
  if (!url) return { ok: false, error: 'invalid' };
  if (!(await serverReachable(url))) return { ok: false, error: 'unreachable' };
  writeConfig({ ...readConfig(), serverUrl: url });
  openApp();
  return { ok: true };
});
ipcMain.handle('gamut:get-config', () => readConfig());
ipcMain.handle('gamut:retry', () => openApp());

// One window per PC.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(() => {
    buildMenu();
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}

// Never open external links inside the app.
app.on('web-contents-created', (_e, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
});
