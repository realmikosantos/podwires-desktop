/**
 * Podwires Desktop — Electron main process.
 *
 * Wraps podwires.com in a native desktop window.
 *
 *   - Remembers window size & position between launches
 *   - Opens external (non-podwires.com) links in the user's default browser
 *   - Supports desktop push notifications via the existing site service worker
 *   - Provides a native app menu with back / forward / reload / zoom
 *   - Single-instance lock: a second launch focuses the first window
 */

'use strict';

const path = require('node:path');
const {
  app,
  BrowserWindow,
  Menu,
  shell,
  nativeTheme,
  dialog,
  session,
} = require('electron');

const Store = require('electron-store');

/* =============================================
   CONFIG
   ============================================= */

const APP_URL        = 'https://podwires.com/';
const APP_HOST       = 'podwires.com';
const PROTOCOL       = 'podwires';
const USER_AGENT_TAG = 'PodwiresDesktop';

const store = new Store({
  defaults: {
    window: { width: 1280, height: 840, x: undefined, y: undefined, maximized: false },
  },
});

/** Reference to the main window — kept for single-instance focus handling. */
let mainWindow = null;

/* =============================================
   SINGLE-INSTANCE LOCK
   ============================================= */

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) {
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

/* =============================================
   PROTOCOL (podwires://path)
   ============================================= */

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL);
}

/* =============================================
   WINDOW
   ============================================= */

function createWindow() {
  const saved = store.get('window');

  mainWindow = new BrowserWindow({
    width:  saved.width,
    height: saved.height,
    x:      saved.x,
    y:      saved.y,
    minWidth:  900,
    minHeight: 600,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#13122a' : '#f4f4f8',
    title: 'Podwires',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      spellcheck: true,
    },
  });

  if (saved.maximized) mainWindow.maximize();

  // Brand the User-Agent so the site can detect the desktop app if it wants to.
  const ua = `${mainWindow.webContents.getUserAgent()} ${USER_AGENT_TAG}/${app.getVersion()}`;
  mainWindow.webContents.setUserAgent(ua);

  mainWindow.loadURL(APP_URL, { userAgent: ua });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Persist window bounds.
  const saveBounds = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const maximized = mainWindow.isMaximized();
    const bounds = mainWindow.getNormalBounds();
    store.set('window', { ...bounds, maximized });
  };
  mainWindow.on('resize', saveBounds);
  mainWindow.on('move', saveBounds);
  mainWindow.on('close', saveBounds);

  // Open external links (anything outside podwires.com) in the user's default browser.
  const isInternal = (url) => {
    try {
      const u = new URL(url);
      return u.hostname === APP_HOST || u.hostname.endsWith(`.${APP_HOST}`);
    } catch {
      return false;
    }
  };

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isInternal(url)) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isInternal(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Graceful error page if the site is unreachable on launch.
  mainWindow.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL) => {
    if (errorCode === -3) return; // user-initiated abort
    const html = `<!doctype html><meta charset="utf-8"><title>Podwires — offline</title>
      <style>
        body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; background:#13122a;
               color:#f1f0ff; display:flex; align-items:center; justify-content:center;
               height:100vh; margin:0; text-align:center; padding:2rem; }
        .card { max-width: 420px; }
        h1 { font-size: 1.4rem; margin: 0 0 .5rem; }
        p { color:#9795b5; line-height:1.6; margin:0 0 1.25rem; }
        button { background:#4840B0; color:#fff; border:0; border-radius:10px;
                 padding:.75rem 1.5rem; font-size:.95rem; font-weight:600; cursor:pointer; }
        button:hover { background:#6C63D5; }
        code { color:#9795b5; font-size:.8rem; }
      </style>
      <div class="card">
        <h1>Can't reach Podwires</h1>
        <p>${errorDescription || 'The site is unreachable right now.'}</p>
        <button onclick="location.href='${APP_URL}'">Try again</button>
        <p><code>${validatedURL || ''}</code></p>
      </div>`;
    mainWindow.webContents.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/* =============================================
   MENU
   ============================================= */

function buildMenu() {
  const isMac = process.platform === 'darwin';

  /** @type {Electron.MenuItemConstructorOptions[]} */
  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Home',
          accelerator: 'CmdOrCtrl+H',
          click: () => mainWindow?.loadURL(APP_URL),
        },
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow?.webContents.reload(),
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(isMac ? [
          { role: 'pasteAndMatchStyle' },
          { role: 'delete' },
          { role: 'selectAll' },
        ] : [
          { role: 'delete' },
          { type: 'separator' },
          { role: 'selectAll' },
        ]),
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        {
          label: 'Toggle Developer Tools',
          accelerator: isMac ? 'Alt+Cmd+I' : 'Ctrl+Shift+I',
          click: () => mainWindow?.webContents.toggleDevTools(),
        },
      ],
    },
    {
      label: 'Navigate',
      submenu: [
        {
          label: 'Back',
          accelerator: isMac ? 'Cmd+Left' : 'Alt+Left',
          click: () => mainWindow?.webContents.navigationHistory.canGoBack() && mainWindow.webContents.navigationHistory.goBack(),
        },
        {
          label: 'Forward',
          accelerator: isMac ? 'Cmd+Right' : 'Alt+Right',
          click: () => mainWindow?.webContents.navigationHistory.canGoForward() && mainWindow.webContents.navigationHistory.goForward(),
        },
      ],
    },
    {
      role: 'window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [
          { type: 'separator' },
          { role: 'front' },
          { type: 'separator' },
          { role: 'window' },
        ] : [
          { role: 'close' },
        ]),
      ],
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Open podwires.com in browser',
          click: () => shell.openExternal(APP_URL),
        },
        {
          label: 'Job Board',
          click: () => mainWindow?.loadURL(`${APP_URL}jobs/`),
        },
        {
          label: 'Find Producers',
          click: () => mainWindow?.loadURL(`${APP_URL}members/`),
        },
        { type: 'separator' },
        {
          label: 'About Podwires Desktop',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Podwires Desktop',
              message: `Podwires Desktop v${app.getVersion()}`,
              detail: `Electron ${process.versions.electron}\nChromium ${process.versions.chrome}\nNode.js ${process.versions.node}\n\npodwires.com`,
              buttons: ['OK'],
            });
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* =============================================
   SECURITY HARDENING
   ============================================= */

app.on('web-contents-created', (_event, contents) => {
  // Block attempts to attach a <webview>.
  contents.on('will-attach-webview', (event) => event.preventDefault());
});

/* =============================================
   PERMISSIONS (notifications, etc.)
   ============================================= */

function configurePermissions() {
  const allowed = new Set(['notifications', 'clipboard-sanitized-write', 'fullscreen']);

  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback, details) => {
    try {
      const originHost = new URL(details.requestingUrl).hostname;
      const originOk = originHost === APP_HOST || originHost.endsWith(`.${APP_HOST}`);
      callback(originOk && allowed.has(permission));
    } catch {
      callback(false);
    }
  });
}

/* =============================================
   APP LIFECYCLE
   ============================================= */

app.whenReady().then(() => {
  configurePermissions();
  buildMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
