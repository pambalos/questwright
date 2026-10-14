import { z } from 'zod/v4';
import { LORE_CATEGORIES, type Change, type LoreCategory } from './types';

/**
 * Learned patterns: the author's book formats its system messages its own way.
 * The author shows Claude one example; Claude writes a regular expression and
 * says what each part of a match means. The parser then applies it to every
 * paragraph, for free, like its built-in rules.
 */

export const PATTERN_KINDS = ['skill', 'item', 'lore', 'stat', 'currency', 'class', 'title', 'equip', 'magic'] as const;
export type PatternKind = (typeof PATTERN_KINDS)[number];

/** One change a match makes. Field values are text with $1, $2 … (or $<name>) for the match's groups. */
export interface PatternOutput {
  kind: PatternKind;
  fields: Record<string, string>;
}

export interface LearnedPattern {
  id: string;
  name: string;
  /** A JavaScript regular expression, without slashes. */
  regex: string;
  flags: string;
  produces: PatternOutput[];
  /** The text it was learned from. */
  example: string;
  enabled: boolean;
  createdAt: number;
}

/** Fields each kind takes; the first ones listed are required. */
export const PATTERN_FIELDS: Record<PatternKind, { required: string[]; optional: string[] }> = {
  skill: { required: ['skill'], optional: ['level', 'system', 'requires'] },
  item: { required: ['item'], optional: ['amount', 'rarity'] },
  lore: { required: ['subject', 'fact'], optional: ['category', 'kind'] },
  stat: { required: ['stat'], optional: ['set', 'delta'] },
  currency: { required: ['currency', 'amount'], optional: [] },
  class: { required: ['name'], optional: [] },
  title: { required: ['name'], optional: [] },
  equip: { required: ['item', 'slot'], optional: ['rarity'] },
  magic: { required: ['system'], optional: [] },
};

const RARITY = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;

/** Builds a pattern's regular expression; null when it does not compile. */
export function compilePattern(p: Pick<LearnedPattern, 'regex' | 'flags'>): RegExp | null {
  try {
    const flags = [...new Set(`${p.flags.replace(/[^gimsuy]/g, '')}g`)].join('');
    return new RegExp(p.regex, flags);
  } catch {
    return null;
  }
}

function fill(template: string, m: RegExpMatchArray): string {
  return template
    .replace(/\$<(\w+)>/g, (_, n: string) => m.groups?.[n] ?? '')
    .replace(/\$(\d)/g, (_, d: string) => m[Number(d)] ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

const num = (s: string | undefined) => {
  if (!s) return undefined;
  const n = Number(s.replace(/[,\s+]/g, ''));
  return Number.isFinite(n) ? (s.trim().startsWith('-') ? -Math.abs(n) : n) : undefined;
};

/** The changes one pattern finds in a paragraph. `who` is the character system text is about. */
export function applyPattern(p: LearnedPattern, text: string, who: string | undefined): { change: Change; quote: string }[] {
  const re = compilePattern(p);
  if (!re) return [];
  const out: { change: Change; quote: string }[] = [];
  for (const m of text.matchAll(re)) {
    if (!m[0]) break;
    for (const o of p.produces) {
      const f: Record<string, string> = {};
      for (const [k, v] of Object.entries(o.fields)) f[k] = fill(v, m);
      if (PATTERN_FIELDS[o.kind].required.some((k) => !f[k])) continue;
      const rarity = RARITY.find((r) => r === f.rarity?.toLowerCase());
      const quote = m[0].slice(0, 160);
      const push = (change: Change) => out.push({ change, quote });
      switch (o.kind) {
        case 'lore': {
          const category = (LORE_CATEGORIES as readonly string[]).includes(f.category ?? '') ? (f.category as LoreCategory) : 'other';
          push({ kind: 'lore', subject: f.subject!, category, fact: f.fact!, lore: f.kind === 'trait' ? 'trait' : 'fact' });
          break;
        }
        case 'skill':
          if (who) push({ kind: 'skill', character: who, skill: f.skill!, level: num(f.level) ?? 1, ...(f.system ? { system: f.system } : {}), ...(f.requires ? { requires: f.requires } : {}) });
          break;
        case 'item':
          if (who) push({ kind: 'item', character: who, item: f.item!, delta: num(f.amount) ?? 1, ...(rarity ? { rarity } : {}) });
          break;
        case 'stat': {
          const set = num(f.set);
          const delta = num(f.delta);
          if (who && (set !== undefined || delta !== undefined)) push({ kind: 'stat', character: who, stat: f.stat!, ...(set !== undefined ? { set } : { delta }) });
          break;
        }
        case 'currency': {
          const delta = num(f.amount);
          if (who && delta !== undefined) push({ kind: 'currency', character: who, currency: f.currency!, delta });
          break;
        }
        case 'class':
          if (who) push({ kind: 'class', character: who, name: f.name! });
          break;
        case 'title':
          if (who) push({ kind: 'title', character: who, name: f.name! });
          break;
        case 'equip':
          if (who) push({ kind: 'equip', character: who, item: f.item!, slot: f.slot!, ...(rarity ? { rarity } : {}) });
          break;
        case 'magic':
          if (who) push({ kind: 'magic', character: who, system: f.system! });
          break;
      }
    }
  }
  return out;
}

/** Changes whenever the enabled patterns do, so the book is read again with them. */
export function patternsStamp(patterns: LearnedPattern[] | undefined): string {
  const on = (patterns ?? []).filter((p) => p.enabled);
  if (!on.length) return '';
  let h = 2166136261;
  const s = JSON.stringify(on.map((p) => [p.regex, p.flags, p.produces]));
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/* ---------- asking Claude to write one ---------- */

export const PatternSchema = z.object({
  name: z.string(),
  regex: z.string(),
  flags: z.string(),
  produces: z.array(z.object({ kind: z.enum(PATTERN_KINDS), fields: z.array(z.object({ field: z.string(), value: z.string() })) })),
  explanation: z.string(),
});
export type PatternDraft = z.infer<typeof PatternSchema>;

export const PATTERN_SYSTEM = `You write parsing rules for a LitRPG writing app. The author selected an example of how their book formats a system message (a skill, item, stat, title, description, etc.). Write ONE JavaScript regular expression that matches this kind of message wherever it appears (not just this exact text), and say what each match means.

Rules:
- regex: JavaScript syntax without slashes. Generalise names, numbers and descriptions into capture groups; keep the fixed punctuation and keywords of the format. Prefer named groups like (?<name>...). Do not anchor with ^ or $ unless the format always fills a whole line (then use the m flag). Avoid catastrophic backtracking: use [^\\]\\n]+ style classes rather than .* where you can.
- flags: any of i, m, s, u (g is added for you).
- produces: the changes one match makes. kind is one of skill, item, lore, stat, currency, class, title, equip, magic. fields is a list of {field, value}; values are text with $<group> or $1 placeholders.
  skill: skill (required), level, system, requires. item: item (required), amount, rarity. lore: subject and fact (required), category (character, creature, place, faction, item, spell, magic, other), kind (fact or trait). stat: stat (required), set or delta. currency: currency and amount (required). class/title: name. equip: item and slot. magic: system.
  A description of a skill or item is lore (category spell or item) with the description as fact; its rarity can be a second lore output with kind trait.
  Only report a skill or item gain when the format announces one (acquired, learned, obtained), not when it only describes something.
- name: a short name for the format, e.g. "Skill description" or "Loot line".
- explanation: one plain sentence on what it captures.`;

export function patternPrompt(example: string, context?: string): string {
  return [`Example the author selected:\n<<<\n${example}\n>>>`, context && context !== example ? `The paragraph it came from:\n<<<\n${context}\n>>>` : ''].filter(Boolean).join('\n\n');
}

/** A draft from Claude as a pattern ready to save. */
export function patternFromDraft(d: PatternDraft, id: string, example: string): LearnedPattern {
  return {
    id,
    name: d.name.trim() || 'Learned pattern',
    regex: d.regex,
    flags: d.flags,
    produces: d.produces.map((o) => ({ kind: o.kind, fields: Object.fromEntries(o.fields.map((f) => [f.field, f.value])) })),
    example,
    enabled: true,
    createdAt: Date.now(),
  };
}
