import type { Character, Look, Sheet } from '@questwright/engine';
import { gearFor, materialOf } from './gear';

/** What Questwright Studio (the Unreal character creator in /studio) reads: see studio/Source/QuestwrightStudio/QWSpec.cpp. */
export interface StudioCharacter {
  name: string;
  description: string;
  frame: 'masculine' | 'feminine';
  height: number;
  build: number;
  skin: string;
  hairColor: string;
  cloth: string;
  accent: string;
  gear: { type: string; slot: string; item: string; kind?: string; material?: string; rarity?: string }[];
}

/** The studio's copy of a character: their look and the gear the story has them wearing, resolved the same way as the in-app figure. */
export function studioCharacter(character: Character, sheet: Sheet, look: Look, model: string): StudioCharacter {
  const gear: StudioCharacter['gear'] = [];
  for (const f of gearFor(sheet)) {
    if (!('key' in f)) continue;
    const worn = sheet.equipment[f.key];
    if (!worn) continue; // Inventory-driven extras (potions, coin pouch) stay in the app for now.
    gear.push({
      type: f.type,
      slot: f.key,
      item: worn.item,
      kind: 'kind' in f ? f.kind : undefined,
      material: ('material' in f ? f.material : undefined) ?? materialOf(worn.item),
      rarity: worn.rarity,
    });
  }
  return {
    name: character.name,
    description: [character.role, character.description].filter(Boolean).join('. '),
    frame: model === 'vrm-sample' ? 'feminine' : 'masculine',
    height: look.build,
    build: 1,
    skin: look.skin,
    hairColor: look.hairColor,
    cloth: look.cloth,
    accent: look.accent,
    gear,
  };
}
