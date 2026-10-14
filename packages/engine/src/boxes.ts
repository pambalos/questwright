import { z } from 'zod/v4';
import { draftCard, type GameCard } from './cards';
import type { CompendiumEntry, Sheet } from './types';

/**
 * System boxes written from memory, to put into the story: a character's
 * status screen as the app knows it at that point in the book, or the system's
 * description of a skill, spell or item. Values are written so that reading the
 * box back changes nothing: stats and class say what the sheet already holds,
 * and lists (skills, gear, money) use forms the parser does not count again.
 */

export const BOX_SECTIONS = ['status', 'stats', 'skills', 'equipment', 'inventory', 'currencies', 'titles'] as const;
export type BoxSection = (typeof BOX_SECTIONS)[number];

export const BOX_SECTION_LABEL: Record<BoxSection, string> = {
  status: 'Name, class and level',
  stats: 'Stats',
  skills: 'Skills',
  equipment: 'Equipment',
  inventory: 'Inventory',
  currencies: 'Money',
  titles: 'Titles and blessings',
};

const LEVEL = /^level$/i;
const FREE = /^free points?$/i;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Sections a sheet has something to show in. */
export function boxSections(sheet: Sheet): BoxSection[] {
  const stats = Object.keys(sheet.stats).filter((k) => !LEVEL.test(k));
  const has: Record<BoxSection, boolean> = {
    status: true,
    stats: stats.length > 0,
    skills: sheet.skills.length > 0,
    equipment: Object.keys(sheet.equipment).length > 0,
    inventory: Object.values(sheet.items).some((i) => i.count > 0),
    currencies: Object.keys(sheet.currencies).length > 0,
    titles: sheet.titles.length > 0 || sheet.blessings.length > 0,
  };
  return BOX_SECTIONS.filter((s) => has[s]);
}

/** A status screen for a character, one line per entry, starting "[Status]" and "Name: …". */
export function sheetBox(sheet: Sheet, name: string, sections: BoxSection[], heading = 'Status'): string {
  const on = new Set(sections);
  const lines: string[] = [`[${heading}]`, `Name: ${name}`];
  if (on.has('status')) {
    if (sheet.className) lines.push(`Class: ${sheet.className}`);
    const level = Object.entries(sheet.stats).find(([k]) => LEVEL.test(k));
    if (level) lines.push(`Level: ${level[1]}`);
  }
  const block = (title: string, rows: string[]) => {
    if (rows.length) lines.push(`${title}:`, ...rows.map((r) => `  ${r}`));
  };
  if (on.has('stats')) {
    const stats = Object.entries(sheet.stats).filter(([k]) => !LEVEL.test(k));
    block('Stats', stats.filter(([k]) => !FREE.test(k)).map(([k, v]) => `${k}: ${v}`));
    const free = stats.find(([k]) => FREE.test(k));
    if (free && free[1] > 0) lines.push(`Free points: ${free[1]}`);
  }
  if (on.has('skills'))
    block(
      'Skills',
      sheet.skills.map((s) => `${s.name} (Lv ${s.level}${s.system ? `, ${s.system}` : ''})`),
    );
  if (on.has('equipment'))
    block(
      'Equipment',
      Object.entries(sheet.equipment).map(([slot, e]) => `${cap(slot)}: ${e.item}${e.rarity && e.rarity !== 'common' ? ` (${cap(e.rarity)})` : ''}`),
    );
  if (on.has('inventory'))
    block(
      'Inventory',
      Object.entries(sheet.items)
        .filter(([, i]) => i.count > 0)
        .map(([name, i]) => `${name}${i.count > 1 ? ` ×${i.count}` : ''}${i.rarity && i.rarity !== 'common' ? ` (${cap(i.rarity)})` : ''}`),
    );
  if (on.has('currencies')) for (const [k, v] of Object.entries(sheet.currencies)) lines.push(`${k}: ${v.toLocaleString('en-US')}`);
  if (on.has('titles')) {
    if (sheet.titles.length) lines.push(`Titles: ${sheet.titles.join(', ')}`);
    if (sheet.blessings.length) lines.push(`Blessings: ${sheet.blessings.join(', ')}`);
    if (sheet.blessingPoints) lines.push(`Blessing Points: ${sheet.blessingPoints}`);
  }
  return lines.join('\n');
}

/**
 * The system's description of a skill, spell or item, the way LitRPG books
 * show one: "[Qi Slam (Uncommon)]: Slam the ground… (Cost: 1 Qi, Cooldown: 30 minutes)".
 * From its card when it has one, else from what the book said about it.
 */
export function entryBox(e: CompendiumEntry, card?: GameCard): string {
  const c = card ?? draftCard(e);
  // Nothing known yet: the name and an empty description for the author to write.
  if (!card && !e.facts.length) return `[${e.name}]: `;
  const rarity = c.rarity !== 'common' ? ` (${cap(c.rarity)})` : '';
  const extra = [c.cost ? `Cost: ${c.cost}` : '', ...c.stats.map((s) => `${s.label}: ${s.value}`)].filter(Boolean);
  return `[${e.name}${rarity}]: ${c.text.trim()}${extra.length ? ` (${extra.join(', ')})` : ''}`;
}

/* ---------- in the book's own style ---------- */

export const RestyleSchema = z.object({ text: z.string() });

export const RESTYLE_SYSTEM = `You format system messages ("blue boxes") for a LitRPG novel. You are given a box written in a plain house format and examples of how this book writes its own system boxes. Rewrite the box in the book's style: its brackets, borders, separators, capitalisation, labels, ordering and line layout.

Rules:
- Keep every name, number, level, rarity and value exactly as given. Add nothing, drop nothing that the plain box says, invent no new stats, items or effects.
- Start the first line with "[" so it reads as a system box. Put each entry on its own line.
- Keep a line "Name: <name>" (or the book's own label for the character's name) near the top when the plain box has one.
- Return only the box text, with no commentary.`;

export function restylePrompt(box: string, examples: string[]): string {
  return [`Examples of this book's system boxes:\n${examples.map((x, i) => `--- ${i + 1} ---\n${x}`).join('\n')}`, `The box to rewrite:\n${box}`].join('\n\n');
}

/** System boxes in the book a restyle can learn from: multi-line ones first, most like `kind`. */
export function boxExamples(texts: string[], kind: 'sheet' | 'entry', max = 4): string[] {
  const boxes = texts.filter((t) => t.trimStart().startsWith('[') && t.length < 3000);
  const score = (t: string) =>
    kind === 'sheet'
      ? /\b(status|name|level|class|stats?|str|agi|vit|int)\b/i.test(t) ? 2 + Math.min(t.split('\n').length, 12) / 4 : 0
      : (/\]\s*:/.test(t) ? 2 : 0) + (/\b(cost|cooldown|rarity|duration|damage)\b/i.test(t) ? 1 : 0);
  return [...new Set(boxes)]
    .map((t) => ({ t, s: score(t) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, max)
    .map((x) => x.t);
}
