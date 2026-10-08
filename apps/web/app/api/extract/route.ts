import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { EXTRACTION_SYSTEM, ExtractionSchema, extractionPrompt } from '@questwright/engine';
import { NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { accessAllowed, aiConfigured, EFFORT, MODEL } from '@/lib/server-config';

export const dynamic = 'force-dynamic';

const short = z.string().max(200);
const Body = z.object({
  paragraph: z.string().min(1).max(12000),
  previous: z.string().max(12000).optional(),
  characters: z.array(z.object({ name: short, aliases: z.array(short).max(50) })).max(500),
  world: z.object({
    currencies: z.array(short).max(200),
    stats: z.array(short).max(200),
    slots: z.array(short).max(200),
    skills: z.array(short).max(1000),
    blessings: z.array(short).max(200),
  }),
  sheets: z.array(z.string().max(4000)).max(200),
  parsed: z.array(z.string().max(500)).max(100),
});

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  if (!aiConfigured()) return fail(503, 'AI extraction is off. Set ANTHROPIC_API_KEY on the server to turn it on.');
  if (!accessAllowed(req)) return fail(401, 'This deployment needs an access code.');

  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return fail(400, 'The request was not a paragraph and its context.');

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: EXTRACTION_SYSTEM,
      output_config: { effort: EFFORT, format: betaZodOutputFormat(ExtractionSchema) },
      messages: [{ role: 'user', content: extractionPrompt(body.data) }],
    });
    if (response.stop_reason === 'refusal') return fail(422, 'The model declined to read this paragraph.');
    if (response.stop_reason === 'max_tokens') return fail(502, 'The reading was cut off before it finished.');
    if (!response.parsed_output) return fail(502, 'The reading came back in an unexpected shape.');
    return NextResponse.json({ result: response.parsed_output, model: response.model });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return fail(503, 'The server API key was rejected.');
    if (error instanceof Anthropic.RateLimitError) return fail(429, 'Rate limited. Paragraphs will be retried shortly.');
    if (error instanceof Anthropic.BadRequestError) return fail(502, `The model request was rejected: ${error.message}`);
    if (error instanceof Anthropic.APIError) return fail(502, `The model service failed (${error.status ?? 'network'}).`);
    throw error;
  }
}
