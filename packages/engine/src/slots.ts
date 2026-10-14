/**
 * Where a piece of gear is worn, guessed from its name, so the author can put
 * on something the story only handed over ("he pulled out a full set").
 * Returns undefined for things that are not worn or held.
 */
export function slotFor(item: string): string | undefined {
  const s = item.toLowerCase();
  const has = (re: RegExp) => re.test(s);
  // Most specific first: "shin guards" are legs, "gauntlets" are hands, "backpack" is back.
  if (has(/\b(back ?pack|pack|rucksack|knapsack|quiver|cloak|cape|mantle)\b/)) return 'Back';
  if (has(/\b(helm|helmet|hood|hat|cap|crown|circlet|coif|mask|headband|cowl)\b/)) return 'Head';
  if (has(/\b(gloves?|gauntlets?|mitts?|handwraps?)\b/)) return 'Hands';
  if (has(/\b(bracers?|vambraces?|armguards?|arm guards?|wristguards?)\b/)) return 'Arms';
  if (has(/\b(boots?|sabatons?|shoes?|sandals?|greaves? of the feet)\b/)) return 'Feet';
  if (has(/\b(legs|leggings|greaves?|cuisses|tassets|pants|trousers|breeches|shin ?guards?|leg ?guards?|kneepads?)\b/)) return 'Legs';
  if (has(/\b(chest ?plate|breast ?plate|cuirass|hauberk|chain ?mail|mail shirt|armou?r|brigandine|jerkin|vest|tunic|robe|coat|shirt|chest ?piece)\b/)) return 'Chest';
  if (has(/\b(pauldrons?|spaulders?|shoulder ?guards?)\b/)) return 'Shoulders';
  if (has(/\b(belt|sash|girdle)\b/)) return 'Belt';
  if (has(/\b(ring|band|signet)\b/)) return 'Ring';
  if (has(/\b(amulet|necklace|pendant|talisman|torc|choker)\b/)) return 'Neck';
  if (has(/\b(shield|buckler|aegis)\b/)) return 'Off hand';
  if (has(/\b(sword|blade|sabre|saber|katana|rapier|dagger|knife|axe|hatchet|mace|hammer|club|maul|flail|spear|lance|halberd|glaive|pike|staff|wand|rod|bow|crossbow)\b/)) return 'Main hand';
  return undefined;
}

/** Slot names the story (or the AI) uses for the same place on the body, mapped to one name each. */
const SLOT_ALIASES: [RegExp, string][] = [
  [/^(main ?hand|right ?hand|weapon|primary|hand|hands? \(weapon\)|wielded)$/, 'Main hand'],
  [/^(off ?hand|left ?hand|secondary|shield)$/, 'Off hand'],
  [/^(head|helm|helmet|headgear|face)$/, 'Head'],
  [/^(chest|body|torso|armou?r|body armou?r|top|shirt|upper body)$/, 'Chest'],
  [/^(legs?|leggings|pants|trousers|lower body|shins?|knees?)$/, 'Legs'],
  [/^(feet|foot|boots?|shoes?)$/, 'Feet'],
  [/^(hands|gloves?|gauntlets?)$/, 'Hands'],
  [/^(arms?|forearms?|wrists?|bracers?|vambraces?)$/, 'Arms'],
  [/^(shoulders?|pauldrons?)$/, 'Shoulders'],
  [/^(back|pack|backpack|cloak|cape)$/, 'Back'],
  [/^(belt|waist|hip|hips|sash)$/, 'Belt'],
  [/^(neck|necklace|amulet)$/, 'Neck'],
  [/^(ring|finger|rings?|ring \d|(left|right) ring)$/, 'Ring'],
];

/**
 * One name for each place gear goes, so "Forearms" and "Arms" are the same
 * slot and new bracers replace the old. Unknown slot names are kept as written.
 */
export function canonicalSlot(slot: string): string {
  const s = slot.trim().toLowerCase().replace(/\s+slot$/, '');
  for (const [re, name] of SLOT_ALIASES) if (re.test(s)) return name;
  return slot.trim();
}
