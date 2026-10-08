import { app, BrowserWindow, ipcMain, net, protocol, safeStorage, shell, utilityProcess, type UtilityProcess } from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';

/**
 * Questwright desktop: runs the web app's own server privately on this machine
 * and shows it under a fixed questwright:// address, so the book saved in the
 * window's storage is there on every launch. The Anthropic key never leaves
 * this computer except in requests to Anthropic.
 */

const SCHEME = 'questwright';
const ORIGIN = `${SCHEME}://app`;
protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

let server: UtilityProcess | null = null;
let port = 0;
let win: BrowserWindow | null = null;

const settingsPath = () => join(app.getPath('userData'), 'settings.json');

interface Settings {
  /** The API key, encrypted with the operating system's keychain when available. */
  apiKey?: { encrypted: boolean; value: string };
}

function readSettings(): Settings {
  try {
    return JSON.parse(readFileSync(settingsPath(), 'utf8')) as Settings;
  } catch {
    return {};
  }
}

function writeSettings(s: Settings) {
  mkdirSync(app.getPath('userData'), { recursive: true });
  writeFileSync(settingsPath(), JSON.stringify(s, null, 2), { mode: 0o600 });
}

function apiKey(): string | undefined {
  const k = readSettings().apiKey;
  if (!k) return undefined;
  try {
    return k.encrypted ? safeStorage.decryptString(Buffer.from(k.value, 'base64')) : k.value;
  } catch {
    return undefined;
  }
}

function storeKey(key: string | null) {
  const s = readSettings();
  if (!key) delete s.apiKey;
  else if (safeStorage.isEncryptionAvailable()) s.apiKey = { encrypted: true, value: safeStorage.encryptString(key).toString('base64') };
  else s.apiKey = { encrypted: false, value: key };
  writeSettings(s);
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const p = (srv.address() as { port: number }).port;
      srv.close(() => resolve(p));
    });
  });
}

function serverScript(): string {
  const base = app.isPackaged ? join(process.resourcesPath, 'web') : join(__dirname, '../web');
  return join(base, 'apps/web/server.js');
}

async function waitForServer(p: number, ms = 30000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const res = await net.fetch(`http://127.0.0.1:${p}/api/status`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('The Questwright server did not start.');
}

async function startServer() {
  stopServer();
  const script = serverScript();
  if (!existsSync(script)) throw new Error(`Missing web build at ${script}. Run "npm run desktop:stage" first.`);
  port = await freePort();
  const key = apiKey();
  server = utilityProcess.fork(script, [], {
    cwd: join(script, '..'),
    stdio: 'pipe',
    serviceName: 'Questwright server',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
      NEXT_TELEMETRY_DISABLED: '1',
      ...(key ? { ANTHROPIC_API_KEY: key } : {}),
    },
  });
  server.stdout?.on('data', (d) => process.stdout.write(`[server] ${d}`));
  server.stderr?.on('data', (d) => process.stderr.write(`[server] ${d}`));
  await waitForServer(port);
}

function stopServer() {
  server?.kill();
  server = null;
}

async function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 900,
    minHeight: 600,
    title: 'Questwright',
    backgroundColor: '#eceff5',
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.once('ready-to-show', () => win?.show());
  // Links to the web open in the default browser; the window only ever shows the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(ORIGIN)) {
      e.preventDefault();
      if (/^https?:/.test(url)) void shell.openExternal(url);
    }
  });
  await win.loadURL(`${ORIGIN}/`);
}

ipcMain.handle('qw:hasKey', () => Boolean(apiKey()));
ipcMain.handle('qw:setKey', async (_e, key: unknown) => {
  if (key !== null && (typeof key !== 'string' || !/^\S{20,300}$/.test(key))) throw new Error('That does not look like an API key.');
  storeKey(key as string | null);
  await startServer();
  return true;
});
ipcMain.handle('qw:info', () => ({ version: app.getVersion(), platform: process.platform, keyEncrypted: safeStorage.isEncryptionAvailable() }));

app.whenReady().then(async () => {
  protocol.handle(SCHEME, (req) => {
    const u = new URL(req.url);
    const init: RequestInit & { duplex?: 'half' } = { method: req.method, headers: req.headers, redirect: 'manual' };
    if (req.body && !['GET', 'HEAD'].includes(req.method)) {
      init.body = req.body;
      init.duplex = 'half';
    }
    return net.fetch(`http://127.0.0.1:${port}${u.pathname}${u.search}`, init);
  });
  try {
    await startServer();
  } catch (e) {
    console.error(e);
  }
  await createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('before-quit', stopServer);
