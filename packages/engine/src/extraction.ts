import { z } from 'zod/v4';
import { hashText } from './manuscript';
import { addCharacter, canonical, findByName, resolveDrafts } from './registry';
import type { Change, ChangeRecord, Project, Sheet, WorldDefs } from './types';

/**
 * Tier 2: the contract between the app and the model that reads prose.
 * The model returns this shape; `applyExtraction` turns it into proposals
 * the author claims or dismisses.
 */

export const CHANGE_KINDS = [
  'gain_item',
  'lose_item',
  'equip',
  'unequip',
  'gain_currency',
  'spend_currency',
  'stat_change',
  'skill',
  'class',
  'title',
  'blessing',
  'appearance',
] as const;

export const ExtractionSchema = z.object({
  characters: z.array(
    z.object({
      name: z.string(),
      role: z.string().nullable(),
      description: z.string().nullable(),
      sameAs: z.string().nullable(),
    }),
  ),
  changes: z.array(
    z.object({
      kind: z.enum(CHANGE_KINDS),
      character: z.string(),
      name: z.string(),
      amount: z.number().nullable(),
      slot: z.string().nullable(),
      rarity: z.enum(['common', 'uncommon', 'rare', 'epic', 'legendary']).nullable(),
      quote: z.string(),
    }),
  ),
});
export type Extraction = z.infer<typeof ExtractionSchema>;

export const EXTRACTION_SYSTEM = `You keep the character sheets for a LitRPG novel while the author writes it. You read one paragraph at a time and report what happens to the characters' game state in that paragraph.

Rules:
- Report only events the paragraph narrates as happening now. Skip plans, wishes, hypotheticals ("if I had a sword"), questions, lies, dreams, and things a character only looks at or talks about.
- Bracketed system messages are tracked separately. Do not report anything a bracketed message already states; the changes it produced are listed for you.
- Attribute each change to the character it happens to. Use the known name or alias when the paragraph refers to a known character, including by pronoun when the previous paragraph makes the referent clear.
- Reuse names from the world definitions when they mean the same thing, so "gold coins" becomes "Gold" and a known skill keeps its exact name.
- amount: for items and currency, a positive count; for stat_change, the signed change. Use null when it does not apply.
- equip: name is the item, slot is a short slot name such as Main hand, Off hand, Head, Chest, Belt, Ring, Back. Equipping something already carried is only an equip.
- appearance: a lasting physical change worth showing on the character's figure, such as a scar, a lost limb or a new tattoo. name is a short description.
- rarity: only when the text signals it (glowing, legendary, a named artifact). Otherwise null.
- characters: every named or clearly identified character present in the paragraph. role and description only from what the text says, otherwise null. sameAs: when the paragraph reveals that a name belongs to someone already known (the stranger turns out to be Lyra), give the known name; otherwise null.
- quote: the shortest exact span of the paragraph that shows the change, copied character for character.
Return empty lists when nothing applies.`;

export interface ExtractionInput {
  paragraph: string;
  previous?: string;
  characters: { name: string; aliases: string[] }[];
  world: WorldDefs;
  sheets: string[];
  parsed: string[];
}

/** Everything the model needs to read one paragraph, as plain text. */
export function extractionPrompt(input: ExtractionInput): string {
  const list = (xs: string[]) => (xs.length ? xs.join(', ') : 'none yet');
  return [
    `Known characters: ${input.characters.length ? input.characters.map((c) => (c.aliases.length ? `${c.name} (also: ${c.aliases.join(', ')})` : c.name)).join('; ') : 'none yet'}`,
    `World definitions. Currencies: ${list(input.world.currencies)}. Stats: ${list(input.world.stats)}. Equipment slots: ${list(input.world.slots)}. Skills: ${list(input.world.skills)}.`,
    `Current sheets:\n${input.sheets.length ? input.sheets.join('\n') : 'none yet'}`,
    `Already tracked from system messages in this paragraph: ${input.parsed.length ? input.parsed.join('; ') : 'nothing'}`,
    input.previous ? `<previous_paragraph>\n${input.previous}\n</previous_paragraph>` : '',
    `<paragraph>\n${input.paragraph}\n</paragraph>`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** One line per character, small enough to send with every paragraph. */
export function summarizeSheet(name: string, s: Sheet): string {
  const parts: string[] = [];
  if (s.stats.Level !== undefined) parts.push(`Level ${s.stats.Level}${s.className ? ` ${s.className}` : ''}`);
  const cur = Object.entries(s.currencies).map(([k, v]) => `${v} ${k}`);
  if (cur.length) parts.push(cur.join(', '));
  const items = Object.entries(s.items).map(([k, v]) => `${k} x${v.count}`);
  if (items.length) parts.push(`carries ${items.join(', ')}`);
  const eq = Object.entries(s.equipment).map(([slot, v]) => `${v.item} (${slot})`);
  if (eq.length) parts.push(`equipped ${eq.join(', ')}`);
  if (s.skills.length) parts.push(`skills ${s.skills.map((k) => k.name).join(', ')}`);
  return `${name}: ${parts.join('; ') || 'no game state yet'}`;
}

export function describeChange(c: Change, nameOf: (id: string) => string = (x) => x): string {
  const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);
  switch (c.kind) {
    case 'mention':
      return `${nameOf(c.character)} appears`;
    case 'stat':
      return c.set !== undefined ? `${c.stat} ${c.set}` : `${c.stat} ${sign(c.delta ?? 0)}`;
    case 'class':
      return `Class: ${c.name}`;
    case 'title':
      return `Title: ${c.name}`;
    case 'currency':
      return `${sign(c.delta)} ${c.currency}`;
    case 'skill':
      return c.replaces ? `${c.replaces} evolves into ${c.skill} (Lv ${c.level})` : `Skill: ${c.skill} (Lv ${c.level})`;
    case 'item':
      return `${sign(c.delta)} ${c.item}`;
    case 'equip':
      return `${c.item} → ${c.slot} slot`;
    case 'unequip':
      return `Unequips ${c.slot}`;
    case 'blessing':
      return `${c.blessing}${c.points ? ` · +${c.points} Blessing Points` : ''}`;
    case 'appearance':
      return `Appearance: ${c.note}`;
    case 'merge':
      return `Same person? ${nameOf(c.from)} is ${nameOf(c.into)}`;
  }
}

function toChange(x: Extraction['changes'][number]): Change | null {
  const who = x.character;
  const n = Math.abs(x.amount ?? 1) || 1;
  const rarity = x.rarity ?? undefined;
  switch (x.kind) {
    case 'gain_item':
      return { kind: 'item', character: who, item: x.name, delta: n, rarity };
    case 'lose_item':
      return { kind: 'item', character: who, item: x.name, delta: -n };
    case 'equip':
      return { kind: 'equip', character: who, item: x.name, slot: x.slot ?? 'Gear', rarity };
    case 'unequip':
      return x.slot ? { kind: 'unequip', character: who, slot: x.slot } : null;
    case 'gain_currency':
      return { kind: 'currency', character: who, currency: x.name, delta: n };
    case 'spend_currency':
      return { kind: 'currency', character: who, currency: x.name, delta: -n };
    case 'stat_change':
      return x.amount ? { kind: 'stat', character: who, stat: x.name, delta: x.amount } : null;
    case 'skill':
      return { kind: 'skill', character: who, skill: x.name, level: Math.max(1, x.amount ?? 1) };
    case 'class':
      return { kind: 'class', character: who, name: x.name };
    case 'title':
      return { kind: 'title', character: who, name: x.name };
    case 'blessing':
      return { kind: 'blessing', character: who, blessing: x.name, points: Math.max(0, x.amount ?? 0) };
    case 'appearance':
      return { kind: 'appearance', character: who, note: x.name };
  }
}

/** Identity of a change for spotting duplicates between the parser and the model. */
export function changeKey(c: Change): string {
  switch (c.kind) {
    case 'merge':
      return `merge:${c.from}:${c.into}`;
    case 'stat':
      return `stat:${c.character}:${c.stat}`;
    case 'currency':
      return `currency:${c.character}:${c.currency}:${c.delta}`;
    case 'item':
      return `item:${c.character}:${c.item}:${c.delta}`;
    case 'equip':
      return `equip:${c.character}:${c.item}`;
    case 'skill':
      return `skill:${c.character}:${c.skill}`;
    case 'blessing':
      return `blessing:${c.character}:${c.blessing}`;
    case 'class':
    case 'title':
      return `${c.kind}:${c.character}:${c.name}`;
    case 'unequip':
      return `unequip:${c.character}:${c.slot}`;
    case 'appearance':
      return `appearance:${c.character}:${c.note}`;
    case 'mention':
      return `mention:${c.character}`;
  }
}

/**
 * Records the model's reading of one paragraph: new characters join the
 * registry and show up as appearances right away; everything else waits as a
 * proposal. Pure: returns a new project.
 */
export function applyExtraction(
  input: Project,
  paragraphId: string,
  text: string,
  result: Extraction,
  newId: () => string,
): { project: Project; proposals: number; created: string[] } {
  const project: Project = structuredClone(input);
  const reg = project.characters;
  const textHash = hashText(text);
  const created: string[] = [];
  const records: ChangeRecord[] = [];
  const merges: Change[] = [];

  for (const c of result.characters) {
    let hit = findByName(reg, c.name);
    if (!hit) {
      hit = addCharacter(reg, c.name, { role: c.role ?? undefined, description: c.description ?? undefined });
      created.push(hit.id);
      const known = c.sameAs ? findByName(reg, c.sameAs) : undefined;
      if (known && known.id !== hit.id) merges.push({ kind: 'merge', from: hit.id, into: known.id });
    } else {
      if (!hit.description && c.description) hit.description = c.description;
      if (!hit.role && c.role) hit.role = c.role;
      const known = c.sameAs ? findByName(reg, c.sameAs) : undefined;
      if (known && canonical(reg, hit.id) !== canonical(reg, known.id)) merges.push({ kind: 'merge', from: hit.id, into: known.id });
    }
    records.push({ id: newId(), paragraphId, textHash, source: 'ai', status: 'applied', change: { kind: 'mention', character: hit.id } });
  }

  const drafts = result.changes.map((x) => ({ change: toChange(x), quote: x.quote })).filter((d): d is { change: Change; quote: string } => d.change !== null);
  const resolved = resolveDrafts(reg, drafts.map((d) => d.change));
  created.push(...resolved.created);

  const existing = new Set(
    project.records.filter((r) => r.paragraphId === paragraphId && r.source !== 'ai').map((r) => changeKey(withCanonical(r.change, project))),
  );
  let proposals = 0;
  resolved.changes.forEach((change, i) => {
    if (existing.has(changeKey(withCanonical(change, project)))) return;
    const quote = drafts[i]!.quote;
    records.push({ id: newId(), paragraphId, textHash, source: 'ai', status: 'proposed', change, quote: text.includes(quote) ? quote : undefined });
    proposals++;
  });
  for (const m of merges) {
    records.push({ id: newId(), paragraphId, textHash, source: 'ai', status: 'proposed', change: m });
    proposals++;
  }

  const stale = (r: ChangeRecord) =>
    r.paragraphId === paragraphId && r.source === 'ai' && (r.status === 'proposed' || r.change.kind === 'mention');
  project.records = [...project.records.filter((r) => !stale(r)), ...records];
  project.extracted[paragraphId] = textHash;
  return { project, proposals, created };
}

function withCanonical(c: Change, p: Project): Change {
  if (c.kind === 'merge') return c;
  return { ...c, character: canonical(p.characters, c.character) };
}
