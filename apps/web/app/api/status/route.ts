import { NextResponse } from 'next/server';
import { accessAllowed, accessCodeRequired, aiConfigured, MODEL } from '@/lib/server-config';

export const dynamic = 'force-dynamic';

export function GET(req: Request) {
  return NextResponse.json({
    ai: aiConfigured(),
    model: MODEL,
    locked: accessCodeRequired() && !accessAllowed(req),
  });
}
