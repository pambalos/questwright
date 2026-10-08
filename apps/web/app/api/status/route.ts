import { NextResponse } from 'next/server';
import { cliAuth } from '@/lib/claude-cli';
import { accessAllowed, accessCodeRequired, aiBackend, MODEL } from '@/lib/server-config';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const backend = aiBackend();
  const auth = backend === 'claude-cli' ? await cliAuth() : null;
  return NextResponse.json({
    ai: backend === 'api' || Boolean(auth?.loggedIn),
    backend,
    plan: auth?.plan ?? null,
    cliSignedOut: backend === 'claude-cli' && !auth?.loggedIn,
    model: MODEL,
    locked: accessCodeRequired() && !accessAllowed(req),
  });
}
