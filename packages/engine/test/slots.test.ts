import { describe, expect, it } from 'vitest';
import { applyExtraction, type Extraction } from '../src/extraction';
import { SAMPLE } from '../src/sample';
import { slotFor } from '../src/slots';
import { ids, parsedProject } from './helpers';

describe('slotFor', () => {
  it('places a full armour set', () => {
    expect(['Obsidian helmet', 'Obsidian chestplate', 'Obsidian gloves', 'Obsidian legs', 'Obsidian boots'].map(slotFor)).toEqual(['Head', 'Chest', 'Hands', 'Legs', 'Feet']);
  });

  it('reads the specific word before the general one', () => {
    expect(slotFor('Shin guards')).toBe('Legs');
    expect(slotFor('Bracers')).toBe('Arms');
    expect(slotFor('Backpack')).toBe('Back');
    expect(slotFor('Makeshift hood')).toBe('Head');
    expect(slotFor('Hammer')).toBe('Main hand');
    expect(slotFor('Shield')).toBe('Off hand');
  });

  it('leaves things that are not worn alone', () => {
    expect(slotFor('Raw raptor meat')).toBeUndefined();
    expect(slotFor('Beast Core')).toBeUndefined();
    expect(slotFor('Wallet')).toBeUndefined();
  });
});

describe('re-reading a paragraph', () => {
  it('does not propose again what the author already claimed', () => {
    const p4 = SAMPLE.chapters[0]!.paragraphs[3]!;
    const reading: Extraction = {
      characters: [],
      changes: [{ kind: 'gain_item', character: 'Kael', name: 'Obsidian helmet', amount: 1, slot: null, rarity: null, system: null, requires: null, quote: 'dagger' }],
      lore: [],
    };
    const first = applyExtraction(parsedProject(SAMPLE).project, 'p4', p4.text, reading, ids()).project;
    const claimed = { ...first, records: first.records.map((r) => (r.status === 'proposed' ? { ...r, status: 'applied' as const } : r)) };
    const again = applyExtraction(claimed, 'p4', p4.text, reading, ids());
    expect(again.proposals).toBe(0);
    expect(again.project.records.filter((r) => r.change.kind === 'item' && r.change.item === 'Obsidian helmet')).toHaveLength(1);
  });
});
