import { describe, expect, it } from 'vitest';
import { parseParagraph } from '../src/parser';

describe('system descriptions of skills and items', () => {
  it('keeps "[Name (Rarity)]: description" as lore about it', () => {
    const out = parseParagraph('[Tactical Insight (Common)]: Grants a temporary boost to perception. (Duration: 5 minutes, Cooldown: 30 minutes.)').map((x) => x.change);
    expect(out).toContainEqual({ kind: 'lore', subject: 'Tactical Insight', category: 'spell', fact: 'Grants a temporary boost to perception. (Duration: 5 minutes, Cooldown: 30 minutes.)', lore: 'fact' });
    expect(out).toContainEqual({ kind: 'lore', subject: 'Tactical Insight', category: 'spell', fact: 'common', lore: 'trait' });
  });

  it('reads item descriptions, and leaves plain bracketed names and system notices alone', () => {
    const item = parseParagraph('[Obsidian Chestplate (Rare)]: Heavy armour of volcanic glass. Defense +12, Durability 80/80.').map((x) => x.change);
    expect(item[0]).toMatchObject({ kind: 'lore', subject: 'Obsidian Chestplate', category: 'item' });
    expect(parseParagraph('His focus landed on [Qi Slam]. It held appeal.').filter((x) => x.change.kind === 'lore')).toEqual([]);
    expect(parseParagraph('[Skill Acquired: Flame Ward (Lv 1)]').filter((x) => x.change.kind === 'lore')).toEqual([]);
  });

  it('forgives a doubled closing bracket', () => {
    const out = parseParagraph('[Tributary (Unique)]]: Instead of a quarter of all essence being given as tribute, it is shared evenly.').map((x) => x.change);
    expect(out[0]).toMatchObject({ kind: 'lore', subject: 'Tributary', fact: expect.stringContaining('shared evenly') });
  });
});
