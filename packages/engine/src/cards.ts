import { z } from 'zod/v4';
import { codexPrompt } from './memory';
import type { CompendiumEntry, Rarity } from './types';

/**
 * Tabletop cards for skills, spells, magic systems and items: a name, a type
 * line, a few stats, rules text and a line of flavour, written by Claude from
 * what the book remembers. The art is the entry's icon or painting.
 */

export interface GameCard {
  title: string;
  /** "Spell · Earth Qi", "Weapon · Hammer", "Magic system". */
  typeLine: string;
  rarity: Rarity | 'unique';
  /** What using it costs, if the book says: "1 Qi", "20 Mana". */
  cost?: string;
  /** Up to four short stats: Cooldown 30 min, Range 3 m, Damage +4. */
  stats: { label: string; value: string }[];
  /** What it does, in plain game terms. */
  text: string;
  /** One line of flavour: a quote from the book, or the codex's voice. */
  flavor: string;
  /** Who said the flavour quote, when it is one. */
  flavorBy?: string;
  /** How many memories it was written from; a card is stale once the entry has more. */
  from: number;
}

export const CardSchema = z.object({
  title: z.string(),
  typeLine: z.string(),
  rarity: z.enum(['common', 'uncommon', 'rare', 'epic', 'legendary', 'unique']),
  cost: z.string().nullable(),
  stats: z.array(z.object({ label: z.string(), value: z.string() })),
  text: z.string(),
  flavor: z.string(),
  flavorBy: z.string().nullable(),
});
export type CardDraft = z.infer<typeof CardSchema>;

export const CARD_SYSTEM = `You design tabletop game cards (like a fantasy card game or a role-playing game's spell and item cards) for the skills, spells, magic systems and items of a LitRPG novel, from what the book says about them.

- title: the exact name.
- typeLine: kind and family, short: "Active skill · Earth Qi", "Passive skill", "Spell · Fire", "Weapon · Hammer", "Armour · Chest", "Consumable", "Magic system", "Crafting material".
- rarity: as the book states it (Common, Uncommon, Rare, Epic, Legendary, Unique); otherwise judge from how it is described, defaulting to common.
- cost: what using it costs if the book says (e.g. "1 Qi", "20 Mana", "1 use"), else null.
- stats: up to four short label/value pairs the book gives or makes plain: Cooldown, Duration, Range, Damage, Defence, Heals, Level, Durability, Weight, Effect area. Never invent numbers; leave stats out rather than guess.
- text: one to three short sentences of rules text in plain game terms, second person or imperative ("Slam the ground: enemies within 3 m are knocked back."), from what the book says.
- flavor: one short evocative line. Prefer a memorable quote about it from the book (then flavorBy is who said it); otherwise a single line in a chronicler's voice drawn from the book's facts (flavorBy null).
Use only what the notes say. Keep everything short enough to fit on a playing card.`;

export function cardPrompt(e: CompendiumEntry): string {
  return codexPrompt(e);
}

export function cardFromDraft(d: CardDraft, from: number): GameCard {
  return {
    title: d.title.trim(),
    typeLine: d.typeLine.trim(),
    rarity: d.rarity,
    ...(d.cost ? { cost: d.cost } : {}),
    stats: d.stats.slice(0, 4).filter((s) => s.label && s.value),
    text: d.text.trim(),
    flavor: d.flavor.trim(),
    ...(d.flavorBy ? { flavorBy: d.flavorBy } : {}),
    from,
  };
}

/** Entries that make good cards. */
export const cardable = (e: CompendiumEntry) => e.category === 'spell' || e.category === 'magic' || e.category === 'item';

const KIND_LINE: Partial<Record<CompendiumEntry['category'], string>> = { spell: 'Skill', magic: 'Magic system', item: 'Item' };
const RARITIES: GameCard['rarity'][] = ['unique', 'legendary', 'epic', 'rare', 'uncommon', 'common'];

/**
 * A card drafted straight from what the book says, before Claude writes one:
 * the first description as rules text, "(Cost: 1 Qi, Cooldown: 30 minutes)"
 * style details as cost and stats, a rarity from its traits, and a line said
 * about it (or another fact) as flavour.
 */
export function draftCard(e: CompendiumEntry): GameCard {
  const facts = e.facts.map((f) => f.fact);
  const stats: GameCard['stats'] = [];
  let cost: string | undefined;
  const clean = (s: string) =>
    s.replace(/\(([^()]*:[^()]*)\)/g, (_, inner: string) => {
      for (const part of inner.split(/[,;]/)) {
        const m = /^\s*([A-Za-z][\w ]{1,20}?)\s*:\s*(.+?)\s*\.?\s*$/.exec(part);
        if (!m) continue;
        if (/^cost$/i.test(m[1]!)) cost ??= m[2]!.replace(/\s*Cost$/i, '');
        else if (stats.length < 4) stats.push({ label: m[1]!.trim(), value: m[2]!.trim() });
      }
      return '';
    }).replace(/\s+([.,])/g, '$1').replace(/\s{2,}/g, ' ').trim();
  const lines = facts.map(clean).filter(Boolean);
  const traits = e.traits.map((t) => t.text.toLowerCase());
  const said = e.said[0];
  return {
    title: e.name,
    typeLine: KIND_LINE[e.category] ?? 'Lore',
    rarity: RARITIES.find((r) => traits.includes(r)) ?? 'common',
    ...(cost ? { cost } : {}),
    stats,
    text: lines[0] ?? 'The story has not said what it does yet.',
    flavor: said ? said.text : lines[1] ?? '',
    ...(said?.speaker ? { flavorBy: said.speaker } : {}),
    from: 0,
  };
}
