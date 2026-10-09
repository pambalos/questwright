import { z } from 'zod/v4';
import { codexPrompt } from './memory';
import type { CompendiumEntry, LoreCategory } from './types';

/**
 * Painted illustrations for compendium entries. Claude acts as art director:
 * it turns what the book remembers about an entry into one image prompt, and
 * an image model paints it. Images themselves live outside the project (they
 * are large); the project keeps each version's details and which one the
 * author approved.
 */

export const ASPECTS = ['2:3', '3:4', '1:1', '4:3', '3:2', '16:9'] as const;
export type Aspect = (typeof ASPECTS)[number];

export interface Illustration {
  id: string;
  /** Which image service painted it, and with which model. */
  provider: string;
  model: string;
  prompt: string;
  caption: string;
  aspect: Aspect;
  /** What the entry looked like when it was painted; see `illustrationSignature`. */
  signature: string;
  createdAt: number;
  /** Estimated cost in US dollars. */
  cost: number;
  auto?: boolean;
}

export interface IllustrationSet {
  /** Oldest first. */
  versions: Illustration[];
  /** The version shown in the codex, and used as the reference that keeps the subject consistent. */
  approved?: string;
}

/** The house look every painting shares, described in plain terms (no artist or brand names). */
export const PAINTED_STYLE =
  'A finished, hand-painted fantasy illustration in the manner of a classic tabletop bestiary or a game codex plate: visible brushwork, layered oil and gouache textures, ' +
  'dramatic chiaroscuro lighting, rich but slightly muted earthy palette with one strong accent colour, believable anatomy, weight and materials (worn leather, dented steel, wet fur, ' +
  'chipped stone), a moody atmospheric background that softens into aged parchment at the edges. Serious, grounded, painterly; not anime, not cartoon, not 3D render, not photograph. ' +
  'No text, lettering, captions, borders, frames, watermarks or user interface.';

const FRAMING: Record<LoreCategory, { aspect: Aspect; framing: string }> = {
  character: { aspect: '2:3', framing: 'a three-quarter-length character portrait, the figure standing and turned slightly, face clearly visible, gear and clothing shown in detail' },
  creature: { aspect: '2:3', framing: 'a full-body bestiary plate of the creature in a characteristic pose, its scale made clear, its most dangerous features prominent' },
  place: { aspect: '16:9', framing: 'a wide establishing landscape painting of the place, with a sense of scale, weather and time of day' },
  faction: { aspect: '3:4', framing: 'an emblematic scene for the faction: members in their typical dress, gathered under their colours or sigil' },
  item: { aspect: '1:1', framing: 'a single-object study of the item, centred on a plain parchment ground, with fine detail of its material and wear' },
  spell: { aspect: '3:4', framing: 'the spell being cast: the magical effect as the clear subject, the caster partly seen' },
  magic: { aspect: '3:4', framing: 'an evocative symbolic painting of this kind of magic: its source, colour and feel' },
  other: { aspect: '3:4', framing: 'an illustration of the subject as a codex plate' },
};

export const defaultAspect = (c: LoreCategory): Aspect => FRAMING[c].aspect;

export const ArtSchema = z.object({
  prompt: z.string(),
  caption: z.string(),
  aspect: z.enum(ASPECTS),
});
export type ArtDirection = z.infer<typeof ArtSchema>;

export const ART_SYSTEM = `You are the art director for the illustrated codex of a LitRPG novel. From what the book says about one entry, write a single prompt for an image model that will paint it.

Rules:
- Describe only what can be seen: build, face, colouring, clothing, gear, materials, posture, setting, light. Turn personality into visible cues (a wary stance, a scarred hand) rather than naming feelings.
- Use only what the notes say or clearly imply. Where they are silent, choose plain, fitting details and keep them modest; never add named people, text, symbols with words, or other characters unless the notes put them in the scene.
- Gear the character has equipped must appear, worn the way it would be worn.
- Begin with the subject and framing, then the details, then light and background. End with the style paragraph given, unchanged.
- One paragraph of 80 to 180 words before the style paragraph. No lists, no camera jargon, no artist or brand names.
- If reference images are mentioned, say how to use them: keep the person's face, build and colouring from the character reference; match the painting style of the style references.
- caption: one short line for under the painting, in the codex's voice (e.g. "Kael at the gates of Emberfall").
- aspect: the ratio suggested, unless the subject clearly needs another.`;

export interface ArtExtra {
  role?: string;
  description?: string;
  /** Equipped gear, as "slot: item (rarity)". */
  gear?: string[];
  /** The author's chosen colours, in words or hex. */
  look?: string;
  /** What the painting can lean on: a portrait of this subject, and house style examples. */
  references?: { subject: boolean; style: number };
}

export function artPrompt(e: CompendiumEntry, extra: ArtExtra = {}): string {
  const f = FRAMING[e.category];
  const refs = extra.references;
  return [
    codexPrompt(e, { role: extra.role, description: extra.description }),
    extra.look ? `The author's chosen colouring: ${extra.look}` : '',
    extra.gear?.length ? `Equipped now:\n${extra.gear.map((g) => `- ${g}`).join('\n')}` : '',
    `Framing: ${f.framing}. Suggested aspect: ${f.aspect}.`,
    refs && (refs.subject || refs.style)
      ? `Reference images sent with the prompt: ${[refs.subject ? 'one approved painting of this same subject (keep their identity)' : '', refs.style ? `${refs.style} house style example${refs.style > 1 ? 's' : ''} (match the painting style only, not the content)` : ''].filter(Boolean).join('; ')}.`
      : '',
    `Style paragraph to end with:\n${PAINTED_STYLE}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/**
 * What a painting of the entry depends on: its description, traits and gear,
 * and for things that are not characters the first few facts (their
 * description, usually). Plot facts added later do not change it, so a new
 * painting is only due when the subject would look different.
 */
export function illustrationSignature(e: CompendiumEntry, extra: Pick<ArtExtra, 'description' | 'gear' | 'look'> = {}): string {
  const traits = [...new Set(e.traits.map((t) => t.text.toLowerCase()))].sort();
  const parts = [extra.description ?? '', traits.join(','), [...(extra.gear ?? [])].sort().join(','), extra.look ?? ''];
  if (!e.characterId) parts.push(e.facts.slice(0, 3).map((f) => f.fact).join('|'));
  return hash(parts.join('\n'));
}

/** Enough is known to paint it: a description, a trait or two, or a few facts. */
export const paintable = (e: CompendiumEntry, extra: Pick<ArtExtra, 'description' | 'gear'> = {}) =>
  Boolean(extra.description) || (extra.gear?.length ?? 0) > 0 || e.traits.length >= 2 || e.facts.length >= 2;
