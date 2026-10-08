import 'server-only';
import { execFile, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod/v4';
import { EFFORT, MODEL } from './server-config';

/**
 * Reads through the author's own Claude Code CLI, signed in with their Claude
 * subscription. The CLI keeps its credentials; this only runs it, the same way
 * the author would in a terminal. Personal use only: a shared deployment must
 * use API keys.
 */

export class CliError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Set by the desktop app (or .env.local) to the claude executable. */
export function claudeCli(): string | undefined {
  return process.env.QW_CLAUDE_CLI || undefined;
}

function childEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  // A key in the environment would bill the API instead of the subscription.
  for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT']) delete env[k];
  return env;
}

function workDir(): string {
  // An empty folder, so no project instructions are picked up.
  const dir = join(tmpdir(), 'questwright-claude');
  mkdirSync(dir, { recursive: true });
  return dir;
}

let authCache: { at: number; value: CliAuth } | null = null;
export interface CliAuth {
  loggedIn: boolean;
  plan?: string;
}

/** Whether the CLI is signed in; cached for a minute. */
export function cliAuth(): Promise<CliAuth> {
  const cli = claudeCli();
  if (!cli) return Promise.resolve({ loggedIn: false });
  if (authCache && Date.now() - authCache.at < 60_000) return Promise.resolve(authCache.value);
  return new Promise((resolve) => {
    execFile(cli, ['auth', 'status', '--json'], { env: childEnv(), cwd: workDir(), timeout: 20_000, windowsHide: true }, (_err, stdout) => {
      let value: CliAuth = { loggedIn: false };
      try {
        const j = JSON.parse(stdout) as { loggedIn?: boolean; subscriptionType?: string };
        value = { loggedIn: Boolean(j.loggedIn), plan: j.subscriptionType };
      } catch {
        /* not signed in, or not a CLI we understand */
      }
      authCache = { at: Date.now(), value };
      resolve(value);
    });
  });
}

const TIMEOUT_MS = 10 * 60_000;

/** One headless run: no tools, no settings, no saved session; the answer must match the schema. */
export function runClaude<T>(opts: { system: string; prompt: string; schema: z.ZodType<T> }): Promise<T> {
  const cli = claudeCli();
  if (!cli) return Promise.reject(new CliError('Claude Code is not set up for this app.', 503));
  // The CLI's validator does not know the draft-2020-12 meta-schema tag zod adds.
  const schema: Record<string, unknown> = { ...z.toJSONSchema(opts.schema) };
  delete schema.$schema;
  const args = [
    '-p',
    '--output-format', 'json',
    '--json-schema', JSON.stringify(schema),
    '--system-prompt', opts.system,
    '--model', MODEL,
    '--effort', EFFORT,
    '--tools', '',
    '--strict-mcp-config',
    '--setting-sources', '',
    '--no-session-persistence',
    '--permission-mode', 'dontAsk',
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(cli, args, { cwd: workDir(), env: childEnv(), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let out = '';
    let err = '';
    const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(new CliError(`Could not run Claude Code: ${e.message}`, 503));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      let j: { is_error?: boolean; result?: unknown; structured_output?: unknown } | null = null;
      try {
        j = JSON.parse(out);
      } catch {
        /* handled below */
      }
      if (!j) return reject(new CliError(`Claude Code stopped (${code ?? 'killed'}): ${(err || out).trim().slice(0, 300) || 'no output'}`, 502));
      if (j.is_error || j.structured_output === undefined) {
        const msg = String(j.result ?? 'Claude Code returned no answer.').slice(0, 300);
        if (/limit|quota|rate/i.test(msg)) return reject(new CliError(`Claude subscription limit reached: ${msg}`, 429));
        if (/log ?in|auth|credential|token/i.test(msg)) return reject(new CliError('Claude Code is not signed in. Run `claude` in a terminal and log in.', 503));
        return reject(new CliError(msg, 502));
      }
      const parsed = opts.schema.safeParse(j.structured_output);
      if (!parsed.success) return reject(new CliError('The reading came back in an unexpected shape.', 502));
      resolve(parsed.data);
    });
    child.stdin.end(opts.prompt);
  });
}
