import 'server-only';

export const MODEL = process.env.QW_MODEL || 'claude-opus-5-5';

const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type Effort = (typeof EFFORTS)[number];
export const EFFORT: Effort = (EFFORTS as readonly string[]).includes(process.env.QW_EFFORT ?? '') ? (process.env.QW_EFFORT as Effort) : 'low';

export type AiBackend = 'api' | 'claude-cli';

/** An API key wins; otherwise the author's Claude Code CLI (their subscription) when one is set up. */
export function aiBackend(): AiBackend | null {
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return 'api';
  if (process.env.QW_CLAUDE_CLI) return 'claude-cli';
  return null;
}

export function aiConfigured(): boolean {
  return aiBackend() !== null;
}

export function accessCodeRequired(): boolean {
  return Boolean(process.env.QW_ACCESS_CODE);
}

export function accessAllowed(req: Request): boolean {
  const code = process.env.QW_ACCESS_CODE;
  return !code || req.headers.get('x-qw-access') === code;
}
