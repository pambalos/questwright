import { ASPECTS } from '@questwright/engine';
import { NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { PROVIDER_IDS, type ImageProvider } from '@/lib/image-providers';
import { ImageError, paint } from '@/lib/images';
import { LocalError, paintLocal } from '@/lib/local';
import { accessAllowed } from '@/lib/server-config';

export const dynamic = 'force-dynamic';
export const maxDuration = 900;

const Body = z.object({
  provider: z.enum(['local', ...PROVIDER_IDS]),
  quality: z.enum(['final', 'draft']),
  prompt: z.string().min(1).max(8000),
  aspect: z.enum(ASPECTS),
  refs: z
    .array(z.object({ role: z.enum(['subject', 'style']), mime: z.enum(['image/png', 'image/jpeg', 'image/webp']), data: z.string().max(8_000_000) }))
    .max(10),
  /** The installed model, when the provider is 'local'. */
  localModel: z.string().max(100).optional(),
});

/** Paints one picture with the chosen image service, or a model on this computer. Keys stay on the server. */
export async function POST(req: Request) {
  if (!accessAllowed(req)) return NextResponse.json({ error: 'This deployment needs an access code.' }, { status: 401 });
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'That was not a painting request.' }, { status: 400 });
  const { provider, localModel, ...job } = body.data;
  try {
    if (provider === 'local') {
      if (!localModel) return NextResponse.json({ error: 'Choose a local model in Settings.' }, { status: 400 });
      return NextResponse.json(await paintLocal(localModel, { prompt: job.prompt, aspect: job.aspect, init: job.refs.find((r) => r.role === 'subject') }));
    }
    return NextResponse.json(await paint(provider as ImageProvider, job));
  } catch (e) {
    if (e instanceof ImageError || e instanceof LocalError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof Error && e.name === 'TimeoutError') return NextResponse.json({ error: 'The image service took too long.' }, { status: 504 });
    throw e;
  }
}
