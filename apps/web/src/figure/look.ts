import type { ArtStyle, Character, HairStyle, Look, Outfit } from '@questwright/engine';

const SKINS = ['#f1c9a5', '#e3b08c', '#d8a07a', '#c58a64', '#a8714e', '#8a5a3b', '#6b4430'];
const HAIRS = ['#1f1a17', '#2a1c13', '#4a2c1a', '#8a4a2a', '#b07a3a', '#d8b56a', '#b9b4ab', '#2c2f3a'];
const CLOTHS = ['#7a3b22', '#3f5a7a', '#4b5a3a', '#6a4a7a', '#7f8aa6', '#5a5048', '#2f4f4f', '#8a6a3a'];
const ACCENTS = ['#d6a443', '#c0c6d0', '#b8372b', '#3a8a6a', '#5b7fd0'];
const OUTFITS: Outfit[] = ['tunic', 'tunic', 'coat', 'robe', 'cloak', 'armor'];
const HAIR_STYLES: HairStyle[] = ['short', 'spiky', 'long', 'short', 'bald', 'hood'];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** A stable starting look for a character, nudged by words in their description. */
export function defaultLook(c: Pick<Character, 'id' | 'name' | 'description' | 'role'>): Look {
  const h = hash(c.id);
  const pick = <T,>(xs: T[], salt: number) => xs[(h >>> salt) % xs.length]!;
  const text = `${c.description ?? ''} ${c.role ?? ''}`.toLowerCase();
  let outfit = pick(OUTFITS, 3);
  let hair = pick(HAIR_STYLES, 7);
  if (/\b(robe|healer|priest|mage|wizard|cleric)/.test(text)) outfit = 'robe';
  if (/\b(cloak|hood|hooded|stranger|rogue|thief)/.test(text)) { outfit = 'cloak'; hair = 'hood'; }
  if (/\b(armou?r|knight|guard|soldier|paladin)/.test(text)) outfit = 'armor';
  if (/\b(merchant|trader|innkeeper|coat)/.test(text)) outfit = 'coat';
  if (/\b(old|elder|aged|grey-haired|gray-haired)/.test(text)) hair = hair === 'hood' ? hair : 'bald';
  return {
    outfit,
    hair,
    skin: pick(SKINS, 11),
    hairColor: /\b(old|elder|grey|gray|white-haired)/.test(text) ? '#b9b4ab' : pick(HAIRS, 13),
    cloth: pick(CLOTHS, 17),
    accent: pick(ACCENTS, 19),
    build: 0.92 + ((h >>> 23) % 17) / 100,
  };
}

/** The author's choice, else what the story described, else a stable default. The protagonist defaults to adventuring gear. */
export function lookOf(c: Character, protagonistId?: string): Look {
  if (c.look) return c.look;
  const base = defaultLook(c);
  if (c.id === protagonistId && !c.description) Object.assign(base, { outfit: 'tunic', hair: 'spiky' });
  return { ...base, ...c.lookHints };
}

export const STYLE_LABEL: Record<ArtStyle, string> = { painterly: 'Painterly', ink: 'Ink wash', ember: 'Ember glow' };

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

/** Applies the project's art style to a colour and optionally lightens or darkens it. */
export function tone(hex: string, style: ArtStyle, f = 1): string {
  let [r, g, b] = rgb(hex);
  if (style === 'ink') {
    const l = Math.min(235, r * 0.3 + g * 0.59 + b * 0.11 + 20);
    [r, g, b] = [l, l - 4, l - 10];
  } else if (style === 'ember') [r, g, b] = [r + 30, g, b - 30];
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}
