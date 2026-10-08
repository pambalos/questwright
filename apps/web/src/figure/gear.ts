import type { Rarity, Sheet } from '@questwright/engine';

export type WeaponKind = 'sword' | 'dagger' | 'staff' | 'axe' | 'bow' | 'mace' | 'focus';

/** Something drawn on a character figure. `key` ties it to a slot or item for hover highlighting. */
export type Feature =
  | { type: 'belt' }
  | { type: 'sheathed'; key: string; kind: WeaponKind; rarity?: Rarity }
  | { type: 'weapon'; key: string; kind: WeaponKind; rarity?: Rarity }
  | { type: 'shield'; key: string; rarity?: Rarity }
  | { type: 'helm'; key: string; rarity?: Rarity }
  | { type: 'armor'; key: string; rarity?: Rarity }
  | { type: 'cape'; key: string; rarity?: Rarity }
  | { type: 'boots'; key: string; rarity?: Rarity }
  | { type: 'gloves'; key: string; rarity?: Rarity }
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
  if (has(item, /bow|crossbow/)) return 'bow';
  if (has(item, /mace|hammer|club|maul|flail/)) return 'mace';
  return null;
}

/** Turns what a sheet says a character has into the things their figure shows. */
export function gearFor(sheet: Sheet): Feature[] {
  const out: Feature[] = [];
  let belt = false;
  let mainHand = false;
  for (const [slot, { item, rarity }] of Object.entries(sheet.equipment)) {
    const s = slot.toLowerCase();
    const kind = weaponKind(item);
    if (/belt|waist|hip/.test(s)) {
      belt = true;
      if (kind) out.push({ type: 'sheathed', key: slot, kind, rarity });
      else out.push({ type: 'trinket', key: slot, rarity });
    } else if (/off|left|shield/.test(s) || has(item, /shield|buckler/)) out.push({ type: 'shield', key: slot, rarity });
    else if (/main|right|weapon|two.?hand/.test(s) || (kind && !/ring|neck|head/.test(s))) {
      if (!mainHand) out.push({ type: 'weapon', key: slot, kind: kind ?? 'focus', rarity });
      mainHand = true;
    } else if (/ring|finger/.test(s)) out.push({ type: 'ring', key: slot, rarity });
    else if (/neck|amulet|pendant|necklace/.test(s)) out.push({ type: 'amulet', key: slot, rarity });
    else if (/head|helm|hat|crown|hood|circlet/.test(s)) out.push({ type: 'helm', key: slot, rarity });
    else if (/chest|body|armou?r|torso/.test(s)) out.push({ type: 'armor', key: slot, rarity });
    else if (/back|cloak|cape/.test(s)) out.push({ type: 'cape', key: slot, rarity });
    else if (/feet|foot|boot/.test(s)) out.push({ type: 'boots', key: slot, rarity });
    else if (/hand|glove|gauntlet|wrist|bracer/.test(s)) out.push({ type: 'gloves', key: slot, rarity });
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
