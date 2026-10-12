import 'server-only';
import { createWriteStream, existsSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export interface Progress {
  done: number;
  total: number;
}

/**
 * Downloads `url` to `dest`, resuming a `.part` file left by an earlier,
 * interrupted download. The file only takes its final name once complete,
 * so a half-downloaded model never looks installed.
 */
export async function download(url: string, dest: string, opts: { expectedBytes?: number; signal?: AbortSignal; onProgress?(p: Progress): void } = {}): Promise<void> {
  if (existsSync(dest) && (!opts.expectedBytes || statSync(dest).size === opts.expectedBytes)) return;
  const part = `${dest}.part`;
  let have = existsSync(part) ? statSync(part).size : 0;
  const res = await fetch(url, { headers: have ? { range: `bytes=${have}-` } : {}, redirect: 'follow', signal: opts.signal });
  if (res.status === 416) {
    // The part file is already whole.
    renameSync(part, dest);
    return;
  }
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}) for ${new URL(url).pathname.split('/').pop()}`);
  if (have && res.status !== 206) {
    // The server ignored the range: start over.
    unlinkSync(part);
    have = 0;
  }
  const length = Number(res.headers.get('content-length') ?? 0);
  const total = opts.expectedBytes ?? (length ? have + length : 0);
  let done = have;
  let last = 0;
  const body = Readable.fromWeb(res.body as import('node:stream/web').ReadableStream<Uint8Array>);
  body.on('data', (chunk: Buffer) => {
    done += chunk.length;
    const now = Date.now();
    if (now - last > 250) {
      last = now;
      opts.onProgress?.({ done, total });
    }
  });
  await pipeline(body, createWriteStream(part, { flags: have ? 'a' : 'w' }), { signal: opts.signal });
  opts.onProgress?.({ done, total });
  if (opts.expectedBytes && statSync(part).size !== opts.expectedBytes) throw new Error(`The download of ${dest.split(/[\\/]/).pop()} came out the wrong size; try again.`);
  renameSync(part, dest);
}
