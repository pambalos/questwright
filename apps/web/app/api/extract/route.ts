import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import {
  LORE_PASS_SYSTEM,
  LorePassSchema,
  lorePassPrompt,
  applyPattern,
  compilePattern,
  PATTERN_SYSTEM,
  patternFromDraft,
  patternPrompt,
  PatternSchema,
  ART_SYSTEM,
  ArtSchema,
  BATCH_EXTRACTION_SYSTEM,
  CODEX_SYSTEM,
  CodexSchema,
  BatchExtractionSchema,
  batchExtractionPrompt,
  EXTRACTION_SYSTEM,
  ExtractionSchema,
  extractionPrompt,
  SKIM_SYSTEM,
  SkimSchema,
  skimPrompt,
  splitBatch,
} from '@questwright/engine';
import { NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { CliError, runClaude } from '@/lib/claude-cli';
import { accessAllowed, aiBackend, EFFORT, MODEL, type Effort } from '@/lib/server-config';

export const dynamic = 'force-dynamic';

const short = z.string().max(200);
const Known = z.array(z.object({ name: short, aliases: z.array(short).max(50) })).max(2000);
const World = z.object({
  currencies: z.array(short).max(200),
  stats: z.array(short).max(200),
  slots: z.array(short).max(200),
  skills: z.array(short).max(1000),
  blessings: z.array(short).max(200),
  magic: z
    .array(
      z.object({
        name: short,
        skills: z.array(z.object({ name: short, requires: short.optional(), at: z.string().max(100), holders: z.array(short).max(500) })).max(500),
      }),
    )
    .max(100)
    .default([]),
});
const Parsed = z.array(z.string().max(500)).max(100);

const SkimBody = z.object({
  mode: z.literal('skim'),
  chapter: z.string().min(1).max(200000),
  characters: Known,
});

const Body = z.object({
  mode: z.literal('read').optional(),
  paragraph: z.string().min(1).max(12000),
  previous: z.string().max(12000).optional(),
  characters: z.array(z.object({ name: short, aliases: z.array(short).max(50) })).max(500),
  world: World,
  sheets: z.array(z.string().max(4000)).max(200),
  compendium: z.array(short).max(1000).optional(),
  memory: z.array(z.string().max(1200)).max(30).optional(),
  parsed: Parsed,
});

const BatchBody = z.object({
  mode: z.literal('batch'),
  paragraphs: z.array(z.object({ text: z.string().min(1).max(12000), parsed: Parsed })).min(1).max(60),
  previous: z.string().max(12000).optional(),
  characters: Known,
  world: World,
  sheets: z.array(z.string().max(4000)).max(200),
  compendium: z.array(short).max(1000).optional(),
  memory: z.array(z.string().max(1200)).max(30).optional(),
});

/** Writing a codex entry: the notes are the entry's memory, laid out by codexPrompt. */
const CodexBody = z.object({ mode: z.literal('codex'), notes: z.string().min(1).max(30000) });
/** Art direction: the entry's memory and framing, laid out by artPrompt; the answer is an image prompt. */
const ArtBody = z.object({ mode: z.literal('art'), notes: z.string().min(1).max(30000) });
/** Learning a format: an example the author selected, and the paragraph around it. */
/** The lore pass: a chapter (or a stretch of one) read only for the compendium. */
const LoreBody = z.object({
  mode: z.literal('lore'),
  chapter: short,
  paragraphs: z.array(z.string().min(1).max(12000)).min(1).max(400),
  compendium: z.array(short).max(2000),
  memory: z.array(z.string().max(1200)).max(40),
});
const PatternBody = z.object({ mode: z.literal('pattern'), example: z.string().min(3).max(4000), context: z.string().max(12000).optional() });

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

/** One structured request, on whichever backend this server has. `what` names the text in error messages. */
async function ask<T>(job: { system: string; prompt: string; schema: z.ZodType<T>; what: 'paragraph' | 'passage' | 'chapter'; effort?: Effort }): Promise<{ result: T } | Response> {
  if (aiBackend() === 'claude-cli') {
    try {
      return { result: await runClaude(job) };
    } catch (e) {
      if (e instanceof CliError) return fail(e.status, e.message);
      throw e;
    }
  }
  const verb = job.what === 'chapter' ? 'skim' : 'read';
  try {
    const response = await new Anthropic().beta.messages.parse({
      model: MODEL,
      max_tokens: job.what === 'paragraph' ? 16000 : 32000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: job.system,
      output_config: { effort: job.effort ?? EFFORT, format: betaZodOutputFormat(job.schema) },
      messages: [{ role: 'user', content: job.prompt }],
    });
    if (response.stop_reason === 'refusal') return fail(422, `The model declined to ${verb} this ${job.what}.`);
    if (response.stop_reason === 'max_tokens') return fail(502, `The ${verb === 'skim' ? 'skim' : 'reading'} was cut off before it finished.`);
    if (!response.parsed_output) return fail(502, `The ${verb === 'skim' ? 'skim' : 'reading'} came back in an unexpected shape.`);
    return { result: response.parsed_output as T };
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return fail(503, 'The server API key was rejected.');
    if (error instanceof Anthropic.RateLimitError) return fail(429, 'Rate limited. Paragraphs will be retried shortly.');
    if (error instanceof Anthropic.BadRequestError) return fail(502, `The model request was rejected: ${error.message}`);
    if (error instanceof Anthropic.APIError) return fail(502, `The model service failed (${error.status ?? 'network'}).`);
    throw error;
  }
}

export async function POST(req: Request) {
  if (!aiBackend()) return fail(503, 'AI extraction is off. Set ANTHROPIC_API_KEY on the server to turn it on.');
  if (!accessAllowed(req)) return fail(401, 'This deployment needs an access code.');

  const json = await req.json().catch(() => null);

  const skim = SkimBody.safeParse(json);
  if (skim.success) {
    const r = await ask({ system: SKIM_SYSTEM, prompt: skimPrompt(skim.data.chapter, skim.data.characters), schema: SkimSchema, what: 'chapter' });
    return r instanceof Response ? r : NextResponse.json({ result: r.result, model: MODEL });
  }

  const codex = CodexBody.safeParse(json);
  if (codex.success) {
    const r = await ask({ system: CODEX_SYSTEM, prompt: codex.data.notes, schema: CodexSchema, what: 'passage' });
    return r instanceof Response ? r : NextResponse.json({ result: r.result, model: MODEL });
  }

  const lore = LoreBody.safeParse(json);
  if (lore.success) {
    if (lore.data.paragraphs.reduce((n, p) => n + p.length, 0) > 60000) return fail(400, 'That stretch is too long for one request.');
    // Read with more care than paragraph reading: the point of this pass is to miss less.
    const r = await ask({ system: LORE_PASS_SYSTEM, prompt: lorePassPrompt(lore.data), schema: LorePassSchema, what: 'chapter', effort: 'medium' });
    return r instanceof Response ? r : NextResponse.json({ result: r.result, model: MODEL });
  }

  const learn = PatternBody.safeParse(json);
  if (learn.success) {
    const { example, context } = learn.data;
    // Claude writes the rule; it is kept only if it compiles and finds something in the example. One retry, told what went wrong.
    let prompt = patternPrompt(example, context);
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await ask({ system: PATTERN_SYSTEM, prompt, schema: PatternSchema, what: 'passage' });
      if (r instanceof Response) return r;
      const pattern = patternFromDraft(r.result, 'draft', example);
      const problem = !compilePattern(pattern) ? 'The regex does not compile in JavaScript.' : null;
      const preview = problem ? [] : applyPattern(pattern, example, 'the character').map((x) => x.change);
      if (!problem && preview.length) return NextResponse.json({ result: { pattern, explanation: r.result.explanation, preview }, model: MODEL });
      prompt = `${patternPrompt(example, context)}

Your previous answer did not work: ${problem ?? 'its regex matched nothing in the example, or a match lacked a required field'}. Previous regex: ${r.result.regex}. Write a corrected rule.`;
    }
    return fail(422, 'Claude could not write a rule that matches this example. Try selecting just the system message.');
  }

  const art = ArtBody.safeParse(json);
  if (art.success) {
    const r = await ask({ system: ART_SYSTEM, prompt: art.data.notes, schema: ArtSchema, what: 'passage' });
    return r instanceof Response ? r : NextResponse.json({ result: r.result, model: MODEL });
  }

  const batch = BatchBody.safeParse(json);
  if (batch.success) {
    if (batch.data.paragraphs.reduce((n, p) => n + p.text.length, 0) > 200000) return fail(400, 'That passage is too long for one request.');
    const r = await ask({ system: BATCH_EXTRACTION_SYSTEM, prompt: batchExtractionPrompt(batch.data), schema: BatchExtractionSchema, what: 'passage' });
    return r instanceof Response ? r : NextResponse.json({ result: splitBatch(r.result, batch.data.paragraphs.length), model: MODEL });
  }

  const body = Body.safeParse(json);
  if (!body.success) return fail(400, 'The request was not a paragraph and its context.');
  const r = await ask({ system: EXTRACTION_SYSTEM, prompt: extractionPrompt(body.data), schema: ExtractionSchema, what: 'paragraph' });
  return r instanceof Response ? r : NextResponse.json({ result: r.result, model: MODEL });
}
