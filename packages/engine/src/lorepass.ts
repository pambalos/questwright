import { z } from 'zod/v4';
import { LORE_CATEGORIES, LORE_KINDS } from './types';

/**
 * The lore pass: a chapter read for one purpose, the compendium. Paragraph
 * by paragraph reading is about game state and catches lore in passing; this
 * reads a whole chapter (or a long stretch of one) and collects everything the
 * story says about its people, creatures, places, factions, items and magic.
 */

export const LorePassSchema = z.object({
  lore: z.array(
    z.object({
      n: z.number(),
      subject: z.string(),
      category: z.enum(LORE_CATEGORIES),
      kind: z.enum(LORE_KINDS),
      fact: z.string(),
      speaker: z.string().nullable(),
      quote: z.string(),
    }),
  ),
  relations: z.array(z.object({ n: z.number(), subject: z.string(), relation: z.string(), object: z.string(), quote: z.string() })),
});
export type LorePass = z.infer<typeof LorePassSchema>;

export const LORE_PASS_SYSTEM = `You are the chronicler of a LitRPG novel. You read a chapter, its paragraphs numbered, and record everything it tells the reader about the world's people, creatures, places, factions, items, skills, spells and magic, for the book's compendium (a game codex and bestiary). Be thorough: a good chapter yields dozens of entries.

Record, with n the number of the paragraph it comes from:
- fact: one short, self-contained sentence in present tense about a subject: who they are, their past, family, job, goals, fears and secrets; what a creature is, how it fights, its weaknesses, where it lives, how it behaves; what a place is like and what happens there; who leads or belongs to a faction and what it wants; what an item is made of, does, or is worth; what a skill or spell does, costs or requires; how a magic system works. Include facts given in dialogue, thoughts, flashbacks and system messages.
- trait: each descriptor of how someone or something looks, sounds, dresses, moves or behaves, a few words each ("scarred left cheek", "gravelly voice", "moves like a cat", "smells of sulphur").
- said: lines of dialogue that reveal something about someone or something, or show a character's voice. fact is the exact words; speaker is who said them; subject is who or what it is about (the speaker for a line in their own voice). speaker is null for other kinds.
- relations: lasting links between named subjects the chapter states or makes plain: family, friendship, travelling or fighting together, rivalry, enmity, love, membership, leadership, service, trade, teaching, ownership, where someone lives or something is found, what a skill belongs to. relation reads from subject to object ("is the sister of", "leads", "lives in", "was taught by").

Rules:
- subject is the exact name the story uses; reuse the names in the compendium list when it is the same thing. A character called by a title or description ("the old merchant") uses that until the story names them.
- category: character, creature, place, faction, item, spell (a skill, spell or ability), magic (a magic system, path or discipline), or other (events, history, concepts).
- Only what the text states or makes unmistakable; nothing from general knowledge. Do not repeat what the memory list already records; do record what this chapter adds or changes.
- No passing actions ("he walked to the door"); record what will still be true, or worth remembering, later.
- quote: the shortest exact span of that paragraph that shows it, copied character for character.`;

export interface LorePassInput {
  paragraphs: string[];
  /** Names already in the compendium. */
  compendium: string[];
  /** What is already remembered about the subjects this stretch names. */
  memory: string[];
  chapter: string;
}

export function lorePassPrompt(x: LorePassInput): string {
  return [
    `Chapter: ${x.chapter}`,
    x.compendium.length ? `Compendium names: ${x.compendium.join(', ')}` : '',
    x.memory.length ? `Already remembered:\n${x.memory.map((m) => `- ${m}`).join('\n')}` : '',
    `Paragraphs:\n${x.paragraphs.map((t, i) => `[${i + 1}] ${t}`).join('\n\n')}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** Long chapters are read in stretches of about this many characters. */
export const LORE_PASS_CHARS = 30_000;

/** The stretches a chapter is read in: runs of paragraph indexes, none longer than LORE_PASS_CHARS. */
export function lorePassStretches(texts: string[], max = LORE_PASS_CHARS): number[][] {
  const out: number[][] = [];
  let cur: number[] = [];
  let len = 0;
  texts.forEach((t, i) => {
    if (cur.length && len + t.length > max) {
      out.push(cur);
      cur = [];
      len = 0;
    }
    cur.push(i);
    len += t.length + 6;
  });
  if (cur.length) out.push(cur);
  return out;
}
