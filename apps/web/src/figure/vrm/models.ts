import type { Character, Look } from '@questwright/engine';

export interface BuiltInModel {
  id: string;
  label: string;
  url: string;
  /** Materials tinted with the character's hair colour. */
  hair: RegExp;
  /** Materials tinted with the character's clothing colour. */
  cloth: RegExp;
  /** Meshes that do not fit a fantasy setting and are hidden. */
  hide: RegExp | null;
  /** Materials that do not fit a fantasy setting and are hidden. */
  hideMaterials: RegExp | null;
  /** The model has bare feet, so it gets simple boots. */
  barefoot: boolean;
  credit: string;
}

export const MODELS: BuiltInModel[] = [
  {
    id: 'seed-san',
    label: 'Seed-san (masculine)',
    url: '/models/seed-san.vrm',
    hair: /^hair$/i,
    cloth: /huku|wear/i,
    hide: /robo_arm/i,
    hideMaterials: /backpack|anim_logo|armgear|arm_mat|arm_plastic|green_emit|robo_face|glass/i,
    barefoot: true,
    credit: 'Seed-san © VirtualCast, Inc. (VRM Public License 1.0)',
  },
  {
    id: 'vrm-sample',
    label: 'Aria (feminine)',
    url: '/models/vrm-sample.vrm',
    hair: /_HAIR$/,
    cloth: /_CLOTH$/,
    hide: null,
    hideMaterials: null,
    barefoot: false,
    credit: 'VRM1 sample model © pixiv Inc. (VRM Public License 1.0)',
  },
];

export const CUSTOM = 'custom';

/** Which built-in body suits a character, from the pronouns the prose uses near their name. */
export function frameFromProse(texts: string[], names: string[]): 'seed-san' | 'vrm-sample' | undefined {
  const re = new RegExp(`\\b(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'i');
  let he = 0;
  let she = 0;
  for (let i = 0; i < texts.length; i++) {
    const at = texts[i]!.search(re);
    if (at < 0) continue;
    // Pronouns in the rest of the sentence that names the character, and the one after it.
    const near = texts[i]!.slice(at).split(/(?<=[.!?])\s+/).slice(0, 2).join(' ').toLowerCase();
    he += near.match(/\b(he|him|his|himself)\b/g)?.length ?? 0;
    she += near.match(/\b(she|her|hers|herself)\b/g)?.length ?? 0;
  }
  if (he > she * 1.5 && he >= 2) return 'seed-san';
  if (she > he * 1.5 && she >= 2) return 'vrm-sample';
  return undefined;
}

export function modelFor(look: Look, c: Pick<Character, 'id' | 'description' | 'role'>, fromProse?: string): string {
  if (look.model) return look.model;
  const text = `${c.description ?? ''} ${c.role ?? ''}`.toLowerCase();
  if (/\b(she|her|girl|woman|lady|queen|princess|priestess|mother|sister|daughter)\b/.test(text)) return 'vrm-sample';
  if (/\b(he|him|boy|man|lord|king|prince|father|brother|son)\b/.test(text)) return 'seed-san';
  if (fromProse) return fromProse;
  let h = 0;
  for (const ch of c.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return MODELS[h % MODELS.length]!.id;
}

export const builtIn = (id: string) => MODELS.find((m) => m.id === id);
