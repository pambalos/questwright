import 'server-only';
import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, statfsSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { Aspect } from '@questwright/engine';
import { download } from './download';
import { localModel, LOCAL_MODELS, RUNTIME, type LocalFile, type LocalModel, type LocalStatus, type RuntimeBuild } from './local-catalog';

/**
 * Installs, removes and runs local image models. Files live in the app's data
 * folder (QW_DATA_DIR, which the desktop app sets) under local-models/: the
 * runtime in runtime/, model files in files/ (one copy of a file several
 * models share). Nothing here is gated or
 * needs an account; downloads resume after an interruption.
 */

const exec = promisify(execFile);

export const localAvailable = () => process.platform === 'win32' || process.platform === 'linux' || process.platform === 'darwin';
const root = () => join(process.env.QW_DATA_DIR || join(homedir(), '.questwright'), 'local-models');
const runtimeDir = () => join(root(), 'runtime');
/** Model files, shared between models that use the same one (a VAE or text encoder). */
const fileDir = () => join(root(), 'files');
const filePath = (f: LocalFile) => join(fileDir(), f.name);
const onDisk = (f: LocalFile) => (existsSync(filePath(f)) ? statSync(filePath(f)).size : existsSync(`${filePath(f)}.part`) ? statSync(`${filePath(f)}.part`).size : 0);
const manifestPath = () => join(root(), 'installed.json');

interface Manifest {
  runtime?: { build: RuntimeBuild['id']; version: string };
  models: Record<string, { installedAt: number }>;
}

function manifest(): Manifest {
  try {
    return JSON.parse(readFileSync(manifestPath(), 'utf8')) as Manifest;
  } catch {
    return { models: {} };
  }
}
function saveManifest(m: Manifest) {
  mkdirSync(root(), { recursive: true });
  writeFileSync(manifestPath(), JSON.stringify(m, null, 2));
}

/* ---------- jobs (installs) ---------- */

type Job = { done: number; total: number; error?: string; file?: string; abort: AbortController };
const jobs = new Map<string, Job>();
let painting = false;

let gpuCache: LocalStatus['gpu'] | undefined;
async function gpu(): Promise<LocalStatus['gpu']> {
  if (gpuCache !== undefined) return gpuCache;
  try {
    const { stdout } = await exec('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits'], { timeout: 5000, windowsHide: true });
    const [name, mib] = stdout.trim().split('\n')[0]!.split(',').map((x) => x.trim());
    gpuCache = { name: name!, vramGB: Math.round(Number(mib) / 1024) };
  } catch {
    gpuCache = null;
  }
  return gpuCache;
}

export async function localStatus(): Promise<LocalStatus> {
  const m = manifest();
  let freeGB: number | null = null;
  try {
    mkdirSync(root(), { recursive: true });
    const fs = statfsSync(root());
    freeGB = Math.round((fs.bavail * fs.bsize) / 1024 ** 3);
  } catch {
    /* unknown */
  }
  const models: LocalStatus['models'] = {};
  for (const lm of LOCAL_MODELS) models[lm.id] = { installed: Boolean(m.models[lm.id]) && lm.files.every((f) => existsSync(filePath(f))), bytesOnDisk: lm.files.reduce((n, f) => n + onDisk(f), 0) };
  return {
    available: localAvailable(),
    dir: root(),
    runtime: { installed: Boolean(m.runtime) && existsSync(join(runtimeDir(), RUNTIME.exe)), build: m.runtime?.build, version: m.runtime?.version },
    gpu: await gpu(),
    freeGB,
    models,
    jobs: Object.fromEntries([...jobs].map(([k, j]) => [k, { done: j.done, total: j.total, error: j.error, file: j.file }])),
    busy: painting,
  };
}

async function runJob(key: string, files: { url: string; dest: string; bytes: number; label: string }[], finish: () => Promise<void> | void) {
  if (jobs.get(key) && !jobs.get(key)!.error) return;
  const job: Job = { done: 0, total: files.reduce((n, f) => n + f.bytes, 0), abort: new AbortController() };
  jobs.set(key, job);
  void (async () => {
    let before = 0;
    try {
      for (const f of files) {
        job.file = f.label;
        await download(f.url, f.dest, { expectedBytes: f.bytes || undefined, signal: job.abort.signal, onProgress: (p) => (job.done = before + p.done) });
        before += f.bytes || statSync(f.dest).size;
        job.done = before;
      }
      await finish();
      jobs.delete(key);
    } catch (e) {
      job.error = job.abort.signal.aborted ? 'Cancelled.' : e instanceof Error ? e.message : 'The install failed.';
    }
  })();
}

/** Installs the runtime build that suits this computer (CUDA when an NVIDIA card is found). */
export async function installRuntime(buildId?: RuntimeBuild['id']) {
  const g = await gpu();
  const build = RUNTIME.builds.find((b) => b.id === buildId) ?? RUNTIME.builds.find((b) => b.id === (g ? 'cuda' : 'vulkan')) ?? RUNTIME.builds[0];
  if (!build) throw new Error('No runtime build is listed for this computer.');
  const dir = runtimeDir();
  mkdirSync(dir, { recursive: true });
  const archives = [build, ...(build.extras ?? [])].map((a, i) => ({ url: a.url, bytes: a.bytes, dest: join(dir, `download-${i}.zip`), label: a.url.split('/').pop()! }));
  await runJob('runtime', archives, async () => {
    for (const a of archives) {
      // Windows 10 and later ship bsdtar, which unpacks zip files.
      await exec('tar', ['-xf', a.dest, '-C', dir], { windowsHide: true });
      unlinkSync(a.dest);
    }
    flattenExe(dir);
    if (!existsSync(join(dir, RUNTIME.exe))) throw new Error(`The runtime archive had no ${RUNTIME.exe}.`);
    const m = manifest();
    m.runtime = { build: build.id, version: RUNTIME.version };
    saveManifest(m);
  });
}

/** Some release zips put everything in a sub-folder: lift it up a level. */
function flattenExe(dir: string) {
  if (existsSync(join(dir, RUNTIME.exe))) return;
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const sub = join(dir, d.name);
    if (!existsSync(join(sub, RUNTIME.exe))) continue;
    for (const f of readdirSync(sub)) {
      rmSync(join(dir, f), { recursive: true, force: true });
      renameSync(join(sub, f), join(dir, f));
    }
    rmSync(sub, { recursive: true, force: true });
    return;
  }
}

export function uninstallRuntime() {
  jobs.get('runtime')?.abort.abort();
  jobs.delete('runtime');
  rmSync(runtimeDir(), { recursive: true, force: true });
  const m = manifest();
  delete m.runtime;
  saveManifest(m);
}

export async function installModel(id: string) {
  const lm = localModel(id);
  if (!lm) throw new Error('That model is not in the catalogue.');
  mkdirSync(fileDir(), { recursive: true });
  await runJob(
    id,
    lm.files.map((f) => ({ url: f.url, bytes: f.bytes, dest: filePath(f), label: f.name })),
    () => {
      const m = manifest();
      m.models[id] = { installedAt: Date.now() };
      saveManifest(m);
    },
  );
}

export function cancelJob(key: string) {
  const j = jobs.get(key);
  if (!j) return;
  j.abort.abort();
  jobs.delete(key);
}

/** Removes a model, and every file of it that no other installed model uses. */
export function uninstallModel(id: string) {
  cancelJob(id);
  const lm = localModel(id);
  const m = manifest();
  delete m.models[id];
  saveManifest(m);
  if (!lm) return;
  const kept = new Set(LOCAL_MODELS.filter((o) => o.id !== id && (m.models[o.id] || jobs.has(o.id))).flatMap((o) => o.files.map((f) => f.name)));
  for (const f of lm.files) {
    if (kept.has(f.name)) continue;
    rmSync(filePath(f), { force: true });
    rmSync(`${filePath(f)}.part`, { force: true });
  }
}

/* ---------- painting ---------- */

const FLAG: Record<LocalFile['role'], string> = { model: '-m', diffusion: '--diffusion-model', vae: '--vae', clip_l: '--clip_l', clip_g: '--clip_g', t5xxl: '--t5xxl', llm: '--llm' };

/** Width and height for an aspect, near the model's own resolution, in multiples of 64. */
function size(lm: LocalModel, aspect: Aspect): [number, number] {
  const [a, b] = aspect.split(':').map(Number) as [number, number];
  const area = lm.defaults.width * lm.defaults.height;
  const w = Math.sqrt((area * a) / b);
  const r = (x: number) => Math.max(256, Math.round(x / 64) * 64);
  return [r(w), r(area / w)];
}

export class LocalError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Paints with an installed model. One painting at a time: they share the graphics card. */
export async function paintLocal(id: string, job: { prompt: string; negative?: string; aspect: Aspect; init?: { mime: string; data: string }; strength?: number }): Promise<{ mime: string; data: string; model: string }> {
  const lm = localModel(id);
  if (!lm) throw new LocalError(400, 'That local model is not in the catalogue.');
  const status = await localStatus();
  if (!status.runtime.installed) throw new LocalError(503, 'The local runtime is not installed. Install it in Settings → Local models.');
  if (!status.models[id]?.installed) throw new LocalError(503, `${lm.name} is not installed. Install it in Settings → Local models.`);
  if (painting) throw new LocalError(429, 'A local painting is already running; it will be free in a moment.');
  painting = true;
  const work = join(tmpdir(), `qw-local-${Date.now()}`);
  mkdirSync(work, { recursive: true });
  try {
    const [w, h] = size(lm, job.aspect);
    const out = join(work, 'out.png');
    const args = [
      ...lm.files.flatMap((f) => [FLAG[f.role], filePath(f)]),
      '-p', job.prompt,
      ...(job.negative ?? lm.negative ? ['-n', (job.negative ?? lm.negative)!] : []),
      '-W', String(w), '-H', String(h),
      '--steps', String(lm.defaults.steps),
      '--cfg-scale', String(lm.defaults.cfg),
      '--sampling-method', lm.defaults.sampler,
      ...(lm.defaults.scheduler ? ['--scheduler', lm.defaults.scheduler] : []),
      '-s', String(Math.floor(Math.random() * 2 ** 31)),
      ...(lm.extraArgs ?? []),
      '-o', out,
    ];
    if (job.init) {
      // The subject's approved painting: an edit model works from it; others start from it and repaint.
      const init = join(work, `init.${job.init.mime.split('/')[1] ?? 'png'}`);
      writeFileSync(init, Buffer.from(job.init.data, 'base64'));
      if (lm.reference === 'edit') args.push('-r', init);
      else args.push('-i', init, '--strength', String(job.strength ?? 0.65));
    }
    const log: string[] = [];
    const code = await new Promise<number | null>((resolve, reject) => {
      const child = spawn(join(runtimeDir(), RUNTIME.exe), args, { cwd: runtimeDir(), windowsHide: true });
      const keep = (d: Buffer) => {
        log.push(String(d));
        if (log.length > 200) log.splice(0, log.length - 200);
      };
      child.stdout.on('data', keep);
      child.stderr.on('data', keep);
      const timer = setTimeout(() => child.kill(), 15 * 60_000);
      child.on('error', reject);
      child.on('close', (c) => {
        clearTimeout(timer);
        resolve(c);
      });
    });
    if (code !== 0 || !existsSync(out)) {
      const tail = log.join('').trim().split('\n').slice(-6).join('\n');
      console.error(`[local] ${lm.id} exited ${code}:\n${log.join('')}`);
      throw new LocalError(502, `${lm.name} failed${/out of memory|cudaMalloc|OOM/i.test(tail) ? ': not enough graphics memory. Try a smaller model or aspect.' : `: ${tail.slice(-300)}`}`);
    }
    return { mime: 'image/png', data: readFileSync(out).toString('base64'), model: lm.id };
  } finally {
    painting = false;
    rmSync(work, { recursive: true, force: true });
  }
}
