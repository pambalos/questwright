import { z } from 'zod/v4';
import type { CompendiumEntry, WorldState } from './types';

/**
 * The AI's memory of the book: for the people, creatures, places, factions,
 * items and spells a passage names, what earlier chapters said about them.
 * Built from the compendium, so it grows as the book is read and follows the
 * author's corrections (struck-out facts are gone from it).
 */

const CATEGORY: Record<CompendiumEntry['category'], string> = {
  character: 'character', creature: 'creature', place: 'place', faction: 'faction', item: 'item', spell: 'spell', magic: 'magic system', other: 'lore',
};

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** One compact line of everything remembered about an entry. */
export function memoryLine(e: CompendiumEntry, max = 480): string {
  const parts: string[] = [];
  if (e.traits.length) parts.push([...new Set(e.traits.map((t) => t.text))].slice(-6).join(', '));
  if (e.facts.length) parts.push(e.facts.slice(-4).map((f) => f.fact.replace(/\.$/, '')).join('; '));
  const rel = e.relations.slice(-5).map((r) => (r.direction === 'out' ? `${r.relation} ${r.name}` : `${r.name} ${r.relation} them`));
  if (rel.length) parts.push(`links: ${rel.join('; ')}`);
  if (e.said.length) parts.push(e.said.slice(-2).map((q) => `"${clip(q.text, 90)}"${q.speaker ? ` (${q.speaker})` : ''}`).join(' '));
  const aka = e.aliases.length ? ` (also ${e.aliases.slice(0, 3).join(', ')})` : '';
  return clip(`${e.name}${aka} [${CATEGORY[e.category]}]: ${parts.join('. ') || 'nothing known yet'}`, max);
}

/** Entries the texts name, by name or alias, in order of first mention; only those with something to remember. */
export function memoryFor(state: WorldState, texts: string[], max = 14): string[] {
  const text = texts.join('\n').toLowerCase();
  const hits: { at: number; e: CompendiumEntry }[] = [];
  for (const e of state.compendium) {
    if (!e.facts.length && !e.traits.length && !e.relations.length && !e.said.length) continue;
    let at = Infinity;
    for (const n of [e.name, ...e.aliases]) {
      const name = n.trim().toLowerCase();
      if (name.length < 3) continue;
      const m = new RegExp(`(?<![\\p{L}\\p{N}])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'u').exec(text);
      if (m) at = Math.min(at, m.index);
    }
    if (at !== Infinity) hits.push({ at, e });
  }
  return hits.sort((a, b) => a.at - b.at).slice(0, max).map((h) => memoryLine(h.e));
}

/* ---------- writing a codex entry from memory ---------- */

export const CodexSchema = z.object({ text: z.string() });

export const CODEX_SYSTEM = `You write entries for the in-world codex of a LitRPG novel, in the manner of a fantasy game's bestiary and character journal: a chronicler's voice, past or present tense as fits, vivid but plain, two or three short paragraphs. Use only what the notes say; never invent names, events, abilities or weaknesses. Where the notes are thin, write less. Do not mention chapters, notes or the author. Return the entry as text, paragraphs separated by a blank line.`;

export function codexPrompt(e: CompendiumEntry, extra?: { role?: string; description?: string }): string {
  const lines = [
    `Entry: ${e.name}${e.aliases.length ? ` (also called ${e.aliases.join(', ')})` : ''}, a ${CATEGORY[e.category]}.`,
    extra?.role ? `Role: ${extra.role}` : '',
    extra?.description ? `Description: ${extra.description}` : '',
    e.traits.length ? `Traits: ${[...new Set(e.traits.map((t) => t.text))].join(', ')}` : '',
    e.facts.length ? `Facts, oldest first:\n${e.facts.map((f) => `- ${f.fact}`).join('\n')}` : '',
    e.relations.length ? `Links:\n${e.relations.map((r) => `- ${r.direction === 'out' ? `${e.name} ${r.relation} ${r.name}` : `${r.name} ${r.relation} ${e.name}`}`).join('\n')}` : '',
    e.said.length ? `Things said:\n${e.said.map((q) => `- "${q.text}"${q.speaker ? `, said by ${q.speaker}` : ''}`).join('\n')}` : '',
  ];
  return lines.filter(Boolean).join('\n\n');
}

/** How many memories an entry holds: a written entry is stale once this grows past what it was written from. */
export const memoryCount = (e: CompendiumEntry) => e.facts.length + e.traits.length + e.relations.length + e.said.length;
