import { app, BrowserWindow, ipcMain, net, protocol, safeStorage, shell, utilityProcess, type UtilityProcess } from 'electron';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { spawn, type ChildProcess } from 'node:child_process';
import { delimiter, dirname, join } from 'node:path';
import { format } from 'node:util';

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
let quitting = false;

const settingsPath = () => join(app.getPath('userData'), 'settings.json');
const logPath = () => join(app.getPath('logs'), 'main.log');

/** Packaged builds have no console on Windows, so everything also goes to a log file. */
function log(...args: unknown[]) {
  const line = `${new Date().toISOString()} ${format(...args)}`;
  console.log(line);
  try {
    mkdirSync(app.getPath('logs'), { recursive: true });
    appendFileSync(logPath(), `${line}\n`);
  } catch {
    /* logging must never take the app down */
  }
}

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

/**
 * The author's Claude Code CLI, used to read with their Claude subscription when
 * no API key is saved. Apps opened from the dock or Start menu may not get the
 * shell's PATH, so the usual install locations are checked as well.
 */
function findClaude(): string | undefined {
  const exe = process.platform === 'win32' ? 'claude.exe' : 'claude';
  const home = app.getPath('home');
  const dirs = [
    ...(process.env.PATH ?? '').split(delimiter),
    join(home, '.local', 'bin'),
    join(home, '.claude', 'local'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ];
  for (const dir of dirs) {
    if (!dir) continue;
    const p = join(dir, exe);
    if (existsSync(p)) return p;
  }
  return undefined;
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

async function waitForServer(p: number, gaveUp: () => boolean, ms = 60000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (gaveUp()) throw new Error('The Questwright server stopped while starting.');
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
  const claude = findClaude();
  log(`starting server ${script} on port ${port} (AI: ${key ? 'API key' : claude ? `Claude Code at ${claude}` : 'none'})`);
  const child = utilityProcess.fork(script, [], {
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
      ...(claude ? { QW_CLAUDE_CLI: claude } : {}),
    },
  });
  server = child;
  child.stdout?.on('data', (d) => log(`[server] ${String(d).trimEnd()}`));
  child.stderr?.on('data', (d) => log(`[server:err] ${String(d).trimEnd()}`));
  let exited: number | null = null;
  child.once('exit', (code) => {
    exited = code;
    log(`server exited with code ${code}`);
    if (server === child) server = null;
  });
  await waitForServer(port, () => exited !== null);
  log('server ready');
}

function stopServer() {
  server?.kill();
  server = null;
}

/** A self-contained page shown while the server starts, or if it cannot. */
function statusPage(title: string, detail: string): string {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  const html = `<!doctype html><meta charset="utf-8"><title>Questwright</title>
<style>body{margin:0;height:100vh;display:grid;place-items:center;background:#eceff5;color:#1c2333;font:15px system-ui,sans-serif}
main{text-align:center;max-width:560px;padding:24px}h1{font-size:22px;margin:0 0 8px}p{margin:0;color:#4a5368;white-space:pre-wrap;word-break:break-word}</style>
<main><h1>${esc(title)}</h1><p>${esc(detail)}</p></main>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

let serverReady: Promise<void> = Promise.resolve();

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
  const w = win;
  w.once('ready-to-show', () => w.show());
  // Let the page finish writing the book before the window goes.
  let saved = false;
  w.on('close', (e) => {
    if (saved || !w.webContents.getURL().startsWith(ORIGIN)) return;
    e.preventDefault();
    const timeout = new Promise((r) => setTimeout(r, 3000));
    void Promise.race([w.webContents.executeJavaScript('window.__questwrightFlush?.()', true), timeout])
      .catch((err: unknown) => log('save before close failed:', err))
      .finally(() => {
        saved = true;
        if (!w.isDestroyed()) w.close();
        if (quitting) app.quit();
      });
  });
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
  await w.loadURL(statusPage('Questwright', 'Starting…'));
  try {
    await serverReady;
  } catch (e) {
    if (!w.isDestroyed()) await w.loadURL(statusPage('Questwright could not start', `${(e as Error).message}\n\nDetails are in ${logPath()}`));
    return;
  }
  if (!w.isDestroyed()) await w.loadURL(`${ORIGIN}/`);
}

ipcMain.handle('qw:hasKey', () => Boolean(apiKey()));
ipcMain.handle('qw:setKey', async (_e, key: unknown) => {
  if (key !== null && (typeof key !== 'string' || !/^\S{20,300}$/.test(key))) throw new Error('That does not look like an API key.');
  storeKey(key as string | null);
  await startServer();
  return true;
});
/* ---------- Questwright Studio (the Unreal character creator in /studio) ---------- */

let studio: ChildProcess | null = null;
const studioFile = () => join(app.getPath('userData'), 'studio', 'character.json');

/** The Unreal editor binary and the studio project, from QW_STUDIO_EDITOR / QW_STUDIO_PROJECT or the usual places. */
function studioPaths(): { editor: string; project: string } | null {
  let editor = process.env.QW_STUDIO_EDITOR;
  if (!editor && process.platform === 'win32') {
    try {
      const installed = JSON.parse(readFileSync('C:\\ProgramData\\Epic\\UnrealEngineLauncher\\LauncherInstalled.dat', 'utf8')) as { InstallationList: { AppName: string; InstallLocation: string }[] };
      const ue = installed.InstallationList.find((i) => i.AppName === 'UE_5.5');
      if (ue) editor = join(ue.InstallLocation, 'Engine', 'Binaries', 'Win64', 'UnrealEditor.exe');
    } catch {
      /* no Epic launcher */
    }
  }
  if (!editor && process.platform === 'darwin') editor = '/Users/Shared/Epic Games/UE_5.5/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor';
  let project = process.env.QW_STUDIO_PROJECT;
  // During development the app runs from inside the repository: look upwards for studio/.
  for (let dir = app.getAppPath(); !project && dir !== dirname(dir); dir = dirname(dir)) {
    const p = join(dir, 'studio', 'QuestwrightStudio.uproject');
    if (existsSync(p)) project = p;
  }
  return editor && project && existsSync(editor) ? { editor, project } : null;
}

ipcMain.handle('qw:openStudio', (_e, json: unknown, launch: unknown) => {
  if (typeof json !== 'string' || json.length > 1_000_000) throw new Error('That is not a character.');
  JSON.parse(json);
  mkdirSync(dirname(studioFile()), { recursive: true });
  writeFileSync(studioFile(), json);
  // A running studio notices the file change and reloads it.
  if (studio && studio.exitCode === null) return null;
  if (launch !== true) return null;
  const paths = studioPaths();
  if (!paths) return 'Questwright Studio was not found. It needs Unreal Engine 5.5 and the studio project (see studio/README.md).';
  log(`starting studio: ${paths.editor} ${paths.project}`);
  studio = spawn(paths.editor, [paths.project, '-game', '-windowed', '-ResX=1600', '-ResY=900', '-nosplash', `-Character=${studioFile()}`], { stdio: 'ignore' });
  studio.on('exit', (code) => {
    log(`studio exited with code ${code}`);
    studio = null;
  });
  return null;
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
  log(`Questwright ${app.getVersion()} starting (packaged: ${app.isPackaged})`);
  serverReady = startServer().catch((e: unknown) => {
    log('server failed to start:', e);
    throw e;
  });
  await createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('before-quit', () => {
  quitting = true;
  stopServer();
});
