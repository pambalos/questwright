import { describe, expect, it } from 'vitest';
import { ART_STYLES, artPrompt, illustrationSignature, paintable, PAINTED_STYLE } from '../src/art';
import type { CompendiumEntry } from '../src/types';

const entry = (over: Partial<CompendiumEntry> = {}): CompendiumEntry => ({
  key: 'lore:ash wolf',
  name: 'Ash Wolf',
  category: 'creature',
  firstAt: 'p1',
  facts: [
    { recordId: 'r1', at: 'p1', fact: 'A wolf with grey, smouldering fur.' },
    { recordId: 'r2', at: 'p2', fact: 'Hunts in packs near the burned forest.' },
  ],
  traits: [],
  said: [],
  relations: [],
  aliases: [],
  ...over,
});

describe('illustration art direction', () => {
  it('briefs the art director with memory, framing and the house style', () => {
    const p = artPrompt(entry(), { references: { subject: true, style: 2 } });
    expect(p).toContain('smouldering fur');
    expect(p).toContain('full-body bestiary plate');
    expect(p).toContain('2 house style examples');
    expect(p.endsWith(PAINTED_STYLE)).toBe(true);
  });

  it('lists equipped gear for characters', () => {
    const p = artPrompt(entry({ category: 'character', characterId: 'russ' }), { gear: ['Chest: Ironbark Cuirass (rare)'] });
    expect(p).toContain('- Chest: Ironbark Cuirass (rare)');
    expect(p).toContain('three-quarter-length character portrait');
  });

  it('changes signature when the look changes, not when plot facts arrive', () => {
    const char = entry({ category: 'character', characterId: 'russ' });
    const a = illustrationSignature(char, { description: 'tall', gear: ['Chest: Cuirass'] });
    const more = entry({ category: 'character', characterId: 'russ', facts: [...char.facts, { recordId: 'r3', at: 'p3', fact: 'Won a duel.' }] });
    expect(illustrationSignature(more, { description: 'tall', gear: ['Chest: Cuirass'] })).toBe(a);
    expect(illustrationSignature(char, { description: 'tall', gear: ['Chest: Cuirass', 'Head: Helm'] })).not.toBe(a);
    expect(illustrationSignature(entry({ traits: [{ recordId: 't', at: 'p1', text: 'huge' }] }))).not.toBe(illustrationSignature(entry()));
  });

  it('waits for enough to paint', () => {
    expect(paintable(entry())).toBe(true);
    expect(paintable(entry({ facts: [] }))).toBe(false);
    expect(paintable(entry({ facts: [] }), { description: 'a hooded stranger' })).toBe(true);
  });

  it('paints in the chosen style, and asks for a short prompt for local models', () => {
    const p = artPrompt(entry(), { style: 'ink' });
    expect(p).toContain(ART_STYLES.ink.text);
    expect(p).not.toContain(PAINTED_STYLE);
    expect(artPrompt(entry(), { short: true })).toContain('40 to 60 words');
    for (const s of Object.values(ART_STYLES)) expect(s.text).toMatch(/No text/);
  });
});
