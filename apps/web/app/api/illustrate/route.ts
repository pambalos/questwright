import { ASPECTS } from '@questwright/engine';
import { NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { PROVIDER_IDS } from '@/lib/image-providers';
import { ImageError, paint } from '@/lib/images';
import { accessAllowed } from '@/lib/server-config';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const Body = z.object({
  provider: z.enum(PROVIDER_IDS as [string, ...string[]]),
  quality: z.enum(['final', 'draft']),
  prompt: z.string().min(1).max(8000),
  aspect: z.enum(ASPECTS),
  refs: z
    .array(z.object({ role: z.enum(['subject', 'style']), mime: z.enum(['image/png', 'image/jpeg', 'image/webp']), data: z.string().max(8_000_000) }))
    .max(10),
});

/** Paints one picture with the chosen image service. The key stays on the server. */
export async function POST(req: Request) {
  if (!accessAllowed(req)) return NextResponse.json({ error: 'This deployment needs an access code.' }, { status: 401 });
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'That was not a painting request.' }, { status: 400 });
  const { provider, ...job } = body.data;
  try {
    const painting = await paint(provider as (typeof PROVIDER_IDS)[number], job);
    return NextResponse.json(painting);
  } catch (e) {
    if (e instanceof ImageError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof Error && e.name === 'TimeoutError') return NextResponse.json({ error: 'The image service took too long.' }, { status: 504 });
    throw e;
  }
}
