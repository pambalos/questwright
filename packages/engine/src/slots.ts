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
