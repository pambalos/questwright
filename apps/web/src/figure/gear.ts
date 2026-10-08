import { slotFor, type Rarity, type Sheet } from '@questwright/engine';

export type WeaponKind = 'sword' | 'dagger' | 'staff' | 'axe' | 'bow' | 'mace' | 'hammer' | 'spear' | 'focus';

/** What a piece of armour is made of, read from its name. */
export type GearMaterial = 'steel' | 'iron' | 'obsidian' | 'gold' | 'silver' | 'bronze' | 'leather' | 'cloth' | 'bone' | 'wood' | 'crystal';

/** Something drawn on a character figure. `key` ties it to a slot or item for hover highlighting. */
export type Feature =
  | { type: 'belt' }
  | { type: 'sheathed'; key: string; kind: WeaponKind; rarity?: Rarity }
  | { type: 'weapon'; key: string; kind: WeaponKind; rarity?: Rarity; material?: GearMaterial }
  | { type: 'shield'; key: string; rarity?: Rarity; material?: GearMaterial }
  | { type: 'helm'; key: string; rarity?: Rarity; material?: GearMaterial }
  | { type: 'hood'; key: string; material?: GearMaterial }
  | { type: 'armor'; key: string; rarity?: Rarity; material?: GearMaterial }
  | { type: 'pauldrons'; key: string; rarity?: Rarity; material?: GearMaterial }
  | { type: 'cape'; key: string; rarity?: Rarity }
  | { type: 'boots'; key: string; rarity?: Rarity; material?: GearMaterial }
  | { type: 'gloves'; key: string; rarity?: Rarity; material?: GearMaterial }
  | { type: 'bracers'; key: string; rarity?: Rarity; material?: GearMaterial }
  | { type: 'greaves'; key: string; rarity?: Rarity; material?: GearMaterial }
  | { type: 'ring'; key: string; rarity?: Rarity }
  | { type: 'amulet'; key: string; rarity?: Rarity }
  | { type: 'trinket'; key: string; rarity?: Rarity }
  | { type: 'potions'; key: string; count: number }
  | { type: 'pouch'; key: string }
  | { type: 'mantle'; key: string }
  | { type: 'pack'; key: string }
  | { type: 'embers' }
  | { type: 'ward'; key: string }
  | { type: 'glow'; key: string }
  | { type: 'frost' }
  | { type: 'sigil'; key: string }
  | { type: 'trophy'; key: string }
  | { type: 'scar' }
  | { type: 'tattoo' };

const has = (s: string, re: RegExp) => re.test(s.toLowerCase());

export function weaponKind(item: string): WeaponKind | null {
  if (has(item, /dagger|knife|dirk|stiletto|shiv/)) return 'dagger';
  if (has(item, /sword|blade|sabre|saber|katana|rapier|falchion/)) return 'sword';
  if (has(item, /staff|wand|rod|stave|sceptre|scepter/)) return 'staff';
  if (has(item, /axe|hatchet|cleaver/)) return 'axe';
  if (has(item, /crossbow|\bbow\b|longbow|shortbow/)) return 'bow';
  if (has(item, /hammer|maul/)) return 'hammer';
  if (has(item, /mace|club|flail|morning ?star/)) return 'mace';
  if (has(item, /spear|lance|halberd|glaive|pike|trident/)) return 'spear';
  return null;
}

/** The material a piece of gear is made of, when its name says so. */
export function materialOf(item: string): GearMaterial | undefined {
  if (has(item, /obsidian|volcanic|black glass|onyx/)) return 'obsidian';
  if (has(item, /mithril|silver/)) return 'silver';
  if (has(item, /gold|golden|gilded/)) return 'gold';
  if (has(item, /bronze|copper|brass/)) return 'bronze';
  if (has(item, /crystal|glass|diamond|jade/)) return 'crystal';
  if (has(item, /\bbone|skull|chitin/)) return 'bone';
  if (has(item, /wood|wooden|bark|makeshift spear/)) return 'wood';
  if (has(item, /leather|hide|fur|pelt|scale(?!.*mail)|bracers|shin ?guards/)) return 'leather';
  if (has(item, /hood|cloth|linen|wool|silk|cotton|robe|tunic|makeshift|bandage/)) return 'cloth';
  if (has(item, /iron|rusty|rusted/)) return 'iron';
  if (has(item, /steel|plate|mail/)) return 'steel';
  return undefined;
}

/** Turns what a sheet says a character has into the things their figure shows. */
export function gearFor(sheet: Sheet): Feature[] {
  const out: Feature[] = [];
  let belt = false;
  let mainHand = false;
  for (const [slot, { item, rarity }] of Object.entries(sheet.equipment)) {
    const s = slot.toLowerCase();
    const kind = weaponKind(item);
    const material = materialOf(item);
    // The item's own name says more than the slot the story put it in: "Shin guards" in "Legs".
    const place = (slotFor(item) ?? slot).toLowerCase();
    if (/belt|waist|hip/.test(s)) {
      belt = true;
      if (kind) out.push({ type: 'sheathed', key: slot, kind, rarity });
      else out.push({ type: 'trinket', key: slot, rarity });
    } else if (has(item, /shield|buckler/) || (/off|left/.test(s) && !kind)) out.push({ type: 'shield', key: slot, rarity, material });
    else if (/off|left/.test(s)) continue; // An off-hand weapon: one weapon in hand is shown.
    else if (/main|right|weapon|two.?hand/.test(s) || /main hand/.test(place)) {
      if (!mainHand) out.push({ type: 'weapon', key: slot, kind: kind ?? 'focus', rarity, material });
      mainHand = true;
    } else if (/ring|finger/.test(place)) out.push({ type: 'ring', key: slot, rarity });
    else if (/neck|amulet|pendant|necklace/.test(place)) out.push({ type: 'amulet', key: slot, rarity });
    else if (/head|helm|hat|crown|hood|circlet/.test(place)) {
      if (has(item, /hood|cowl|hat|cap|bandana|scarf/) && material !== 'obsidian' && material !== 'steel' && material !== 'iron') out.push({ type: 'hood', key: slot, material });
      else out.push({ type: 'helm', key: slot, rarity, material });
    } else if (/shoulder/.test(place)) out.push({ type: 'pauldrons', key: slot, rarity, material });
    else if (/chest|body|armou?r|torso/.test(place)) out.push({ type: 'armor', key: slot, rarity, material });
    else if (/back|cloak|cape/.test(place)) out.push(has(item, /pack|bag|sack|quiver/) ? { type: 'pack', key: slot } : { type: 'cape', key: slot, rarity });
    else if (/feet|foot|boot/.test(place)) out.push({ type: 'boots', key: slot, rarity, material });
    else if (/legs?|thigh|shin|knee/.test(place)) out.push({ type: 'greaves', key: slot, rarity, material });
    else if (/arms?|wrist|bracer/.test(place)) out.push({ type: 'bracers', key: slot, rarity, material });
    else if (/hand|glove|gauntlet/.test(place)) out.push({ type: 'gloves', key: slot, rarity, material });
    else out.push({ type: 'trinket', key: slot, rarity });
  }
  const potions = Object.entries(sheet.items).filter(([n]) => has(n, /potion|elixir|tonic|vial|draught/));
  const potionCount = potions.reduce((n, [, v]) => n + v.count, 0);
  if (potionCount) out.push({ type: 'potions', key: potions[0]![0], count: potionCount });
  const gold = Object.entries(sheet.currencies).find(([n, v]) => v > 0 && has(n, /gold|silver|copper|coin|crown/));
  if (gold) out.push({ type: 'pouch', key: gold[0] });
  const pelt = Object.keys(sheet.items).find((n) => has(n, /pelt|fur|hide|fleece/));
  if (pelt) out.push({ type: 'mantle', key: pelt });
  const carried = Object.values(sheet.items).reduce((n, v) => n + v.count, 0);
  if (carried >= 8) out.push({ type: 'pack', key: 'Inventory' });
  if (belt || potionCount || gold) out.push({ type: 'belt' });

  for (const sk of sheet.skills) {
    const n = sk.name;
    if (has(n, /ward|shield|bulwark|barrier|aegis|guard/)) out.push({ type: 'ward', key: n });
    if (has(n, /flame|fire|ember|burn|blaze|inferno|ash/)) out.push({ type: 'embers' });
    if (has(n, /heal|mend|light|holy|radian|bless|restor/)) out.push({ type: 'glow', key: n });
    if (has(n, /frost|ice|cold|winter|chill/)) out.push({ type: 'frost' });
  }
  if (sheet.blessings.length) out.push({ type: 'sigil', key: 'Blessing' });
  if (sheet.titles.length) out.push({ type: 'trophy', key: sheet.titles[sheet.titles.length - 1]! });
  for (const note of sheet.appearance.notes) {
    if (has(note, /scar|burn|cut|wound/)) out.push({ type: 'scar' });
    if (has(note, /tattoo|mark|brand|rune/)) out.push({ type: 'tattoo' });
  }
  // One of each effect is enough.
  const seen = new Set<string>();
  return out.filter((f) => {
    const id = ['embers', 'frost', 'scar', 'tattoo', 'belt'].includes(f.type) ? f.type : `${f.type}:${'key' in f ? f.key : ''}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#c8ccd8', uncommon: '#62c07a', rare: '#5b9bf0', epic: '#b07ae6', legendary: '#f0a64a',
};
