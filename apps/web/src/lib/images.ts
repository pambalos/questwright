import 'server-only';
import type { Aspect } from '@questwright/engine';
import { PROVIDERS, type ImageProvider, type ImageQuality } from './image-providers';

/** One image to steer the painting: the subject's approved portrait, or a house style example. */
export interface Reference {
  role: 'subject' | 'style';
  mime: string;
  /** Base64, no data: prefix. */
  data: string;
}

export interface PaintJob {
  prompt: string;
  aspect: Aspect;
  quality: ImageQuality;
  refs: Reference[];
}

export interface Painting {
  mime: string;
  data: string;
  model: string;
}

export class ImageError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const imageKey = (p: ImageProvider) => process.env[PROVIDERS[p].env];

/** Which providers this server holds a key for. */
export const imageProviders = (): Record<ImageProvider, boolean> => ({ gemini: Boolean(imageKey('gemini')), openai: Boolean(imageKey('openai')), flux: Boolean(imageKey('flux')) });

export function modelFor(p: ImageProvider, q: ImageQuality): string {
  return process.env[`QW_IMAGE_MODEL_${p.toUpperCase()}_${q.toUpperCase()}`] || PROVIDERS[p].models[q];
}

export async function paint(provider: ImageProvider, job: PaintJob): Promise<Painting> {
  const key = imageKey(provider);
  if (!key) throw new ImageError(503, `No ${PROVIDERS[provider].company} key is set up. Add one in Settings.`);
  const model = modelFor(provider, job.quality);
  const refs = job.refs.slice(0, PROVIDERS[provider].maxRefs);
  const out = provider === 'gemini' ? await gemini(key, model, job, refs) : provider === 'openai' ? await openai(key, model, job, refs) : await flux(key, model, job, refs);
  return { ...out, model };
}

async function failure(res: Response, who: string): Promise<ImageError> {
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } | string; detail?: unknown; message?: string } | null;
  const detail = typeof body?.error === 'string' ? body.error : body?.error?.message ?? body?.message ?? (typeof body?.detail === 'string' ? body.detail : '');
  if (res.status === 401 || res.status === 403) return new ImageError(503, `${who} rejected the key${detail ? `: ${detail}` : '.'}`);
  if (res.status === 429) return new ImageError(429, `${who} is rate limiting or out of credit${detail ? `: ${detail}` : '.'}`);
  if (res.status === 402) return new ImageError(402, `${who} needs billing set up on the account the key belongs to${detail ? `: ${detail}` : '.'}`);
  if (res.status === 400) return new ImageError(422, `${who} declined the request${detail ? `: ${detail}` : '.'}`);
  return new ImageError(502, `${who} failed (${res.status})${detail ? `: ${detail}` : '.'}`);
}

/** The first image anywhere in a response: Gemini puts it in steps[].content[] (or output_image). */
function findImage(v: unknown, depth = 0): { mime: string; data: string } | null {
  if (!v || typeof v !== 'object' || depth > 8) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.data === 'string' && o.data.length > 100 && (o.type === 'image' || typeof o.mime_type === 'string' || typeof o.mimeType === 'string'))
    return { mime: String(o.mime_type ?? o.mimeType ?? 'image/png'), data: o.data };
  for (const k of ['output_image', 'inlineData', 'inline_data']) {
    const hit = findImage(o[k], depth + 1);
    if (hit) return hit;
  }
  for (const x of Object.values(o)) {
    const hit = findImage(x, depth + 1);
    if (hit) return hit;
  }
  return null;
}

async function gemini(key: string, model: string, job: PaintJob, refs: Reference[]) {
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      input: [{ type: 'text', text: job.prompt }, ...refs.map((r) => ({ type: 'image', mime_type: r.mime, data: r.data }))],
      response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: job.aspect, image_size: job.quality === 'final' ? '2K' : '1K' },
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) throw await failure(res, 'Gemini');
  const img = findImage(await res.json());
  if (!img) throw new ImageError(422, 'Gemini returned no image; it may have declined the subject.');
  return img;
}

const OPENAI_SIZE: Record<Aspect, string> = { '2:3': '1024x1536', '3:4': '1024x1536', '1:1': '1024x1024', '4:3': '1536x1024', '3:2': '1536x1024', '16:9': '1536x1024' };

async function openai(key: string, model: string, job: PaintJob, refs: Reference[]) {
  const quality = job.quality === 'final' ? 'high' : 'medium';
  let res: Response;
  if (refs.length) {
    const form = new FormData();
    form.set('model', model);
    form.set('prompt', job.prompt);
    form.set('size', OPENAI_SIZE[job.aspect]);
    form.set('quality', quality);
    refs.forEach((r, i) => form.append('image[]', new Blob([Buffer.from(r.data, 'base64')], { type: r.mime }), `ref-${i}.${r.mime.split('/')[1] ?? 'png'}`));
    res = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(240_000) });
  } else {
    res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, prompt: job.prompt, size: OPENAI_SIZE[job.aspect], quality, moderation: 'low', n: 1 }),
      signal: AbortSignal.timeout(240_000),
    });
  }
  if (!res.ok) throw await failure(res, 'OpenAI');
  const body = (await res.json()) as { data?: { b64_json?: string }[]; output_format?: string };
  const data = body.data?.[0]?.b64_json;
  if (!data) throw new ImageError(422, 'OpenAI returned no image.');
  return { mime: `image/${body.output_format ?? 'png'}`, data };
}

const FLUX_SIZE: Record<Aspect, [number, number]> = { '2:3': [832, 1248], '3:4': [960, 1280], '1:1': [1024, 1024], '4:3': [1280, 960], '3:2': [1248, 832], '16:9': [1344, 768] };

async function flux(key: string, model: string, job: PaintJob, refs: Reference[]) {
  const [width, height] = FLUX_SIZE[job.aspect];
  const images: Record<string, string> = {};
  refs.forEach((r, i) => (images[i ? `input_image_${i + 1}` : 'input_image'] = r.data));
  const start = await fetch(`https://api.bfl.ai/v1/${model}`, {
    method: 'POST',
    headers: { 'x-key': key, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ prompt: job.prompt, width, height, output_format: 'png', safety_tolerance: 5, ...images }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!start.ok) throw await failure(start, 'Black Forest Labs');
  const { polling_url: poll } = (await start.json()) as { polling_url?: string };
  if (!poll) throw new ImageError(502, 'Black Forest Labs did not start the painting.');
  const until = Date.now() + 240_000;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 1500));
    const res = await fetch(poll, { headers: { 'x-key': key, accept: 'application/json' } });
    if (!res.ok) throw await failure(res, 'Black Forest Labs');
    const s = (await res.json()) as { status?: string; result?: { sample?: string } };
    if (s.status === 'Ready' && s.result?.sample) {
      const img = await fetch(s.result.sample);
      if (!img.ok) throw new ImageError(502, 'Could not download the painting from Black Forest Labs.');
      return { mime: img.headers.get('content-type') ?? 'image/png', data: Buffer.from(await img.arrayBuffer()).toString('base64') };
    }
    if (s.status && /moderat/i.test(s.status)) throw new ImageError(422, 'Black Forest Labs declined the subject.');
    if (s.status && /error|failed/i.test(s.status)) throw new ImageError(502, `Black Forest Labs failed: ${s.status}.`);
  }
  throw new ImageError(504, 'Black Forest Labs took too long.');
}
