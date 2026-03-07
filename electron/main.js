const path = require('node:path');
const os = require('node:os');
const { app, BrowserWindow, session } = require('electron');
const { createIpcHandlers } = require('./midi-ipc');

const isWSL =
  process.platform === 'linux' &&
  (Boolean(process.env.WSL_DISTRO_NAME) || os.release().toLowerCase().includes('microsoft'));

app.commandLine.appendSwitch('enable-blink-features', 'WebMidi,WebMidiSysex');
app.commandLine.appendSwitch('allow-file-access-from-files');
if (isWSL) {
  app.commandLine.appendSwitch('no-sandbox');
}

function allowMidiPermissions() {
  const ses = session.defaultSession;

  ses.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'midi' || permission === 'midiSysex');
  });

  ses.setPermissionCheckHandler((_webContents, permission) => {
    return permission === 'midi' || permission === 'midiSysex';
  });

  ses.setDevicePermissionHandler((details) => {
    return details.deviceType === 'midi';
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 800,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: !isWSL,
    },
  });

  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const levelLabels = ['debug', 'info', 'warn', 'error'];
    const label = levelLabels[level] ?? 'log';
    const source = sourceId ? `${sourceId}:${line}` : `line ${line}`;
    console.log(`[renderer:${label}] ${message} (${source})`);
  });

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[main] Renderer failed to load (${errorCode}): ${errorDescription}. URL=${validatedURL}`);
  });

  win.webContents.on('render-process-gone', (_event, details) => {
    console.error(`[main] Renderer process gone: reason=${details.reason}, exitCode=${details.exitCode}`);
  });

  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(() => {
  allowMidiPermissions();
  createIpcHandlers(app);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
