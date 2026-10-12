import { NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { cancelJob, installModel, installRuntime, localStatus, uninstallModel, uninstallRuntime } from '@/lib/local';
import { accessAllowed } from '@/lib/server-config';

export const dynamic = 'force-dynamic';

/** Local models only ever run on the author's own computer: the desktop app, or a dev server on localhost. */
function local(req: Request): boolean {
  const host = new URL(req.url).hostname;
  return Boolean(process.env.QW_DATA_DIR) || host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

export async function GET(req: Request) {
  if (!accessAllowed(req)) return NextResponse.json({ error: 'This deployment needs an access code.' }, { status: 401 });
  const status = await localStatus();
  return NextResponse.json({ ...status, available: status.available && local(req) });
}

const Body = z.object({
  action: z.enum(['install', 'uninstall', 'cancel']),
  /** A model id, or 'runtime'. */
  id: z.string().min(1).max(100),
  build: z.enum(['cuda', 'vulkan', 'cpu']).optional(),
});

export async function POST(req: Request) {
  if (!accessAllowed(req)) return NextResponse.json({ error: 'This deployment needs an access code.' }, { status: 401 });
  if (!local(req)) return NextResponse.json({ error: 'Local models can only be managed on your own computer.' }, { status: 403 });
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'That was not a local model request.' }, { status: 400 });
  const { action, id, build } = body.data;
  try {
    if (action === 'cancel') cancelJob(id);
    else if (id === 'runtime') await (action === 'install' ? installRuntime(build) : uninstallRuntime());
    else await (action === 'install' ? installModel(id) : uninstallModel(id));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'That did not work.' }, { status: 400 });
  }
  return NextResponse.json(await localStatus());
}
