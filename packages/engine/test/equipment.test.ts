import { describe, expect, it } from 'vitest';
import { fold } from '../src/ledger';
import { canonicalSlot } from '../src/slots';
import type { Change, Manuscript, Project } from '../src/types';

const book: Manuscript = { chapters: [{ id: 'c1', title: 'One', paragraphs: ['p1', 'p2', 'p3', 'p4', 'p5'].map((id) => ({ id, text: `Russ ${id}.` })) }] };

function sheet(changes: [string, Change][]) {
  const project: Project = {
    id: 'b',
    title: 'B',
    characters: { russ: { id: 'russ', name: 'Russ', aliases: [] } },
    records: changes.map(([pid, change], i) => ({ id: `r${i}`, paragraphId: pid, textHash: '', source: 'ai', status: 'applied', change })),
    parsed: {},
    extracted: {},
  };
  return fold(project, book).sheets.russ!;
}

describe('inventory and equipment', () => {
  it('keeps everyday items in the inventory', () => {
    const s = sheet([['p1', { kind: 'item', character: 'russ', item: 'Knife', delta: 1 }], ['p2', { kind: 'item', character: 'russ', item: 'Tarp', delta: 2 }]]);
    expect(s.items).toEqual({ Knife: { count: 1, rarity: undefined }, Tarp: { count: 2, rarity: undefined } });
  });

  it('treats slot names that mean the same place as one slot', () => {
    expect(canonicalSlot('Forearms')).toBe('Arms');
    expect(canonicalSlot('right hand')).toBe('Main hand');
    expect(canonicalSlot('Tail')).toBe('Tail');
    const s = sheet([
      ['p1', { kind: 'equip', character: 'russ', item: 'Bracers', slot: 'Arms' }],
      ['p2', { kind: 'equip', character: 'russ', item: 'Leather bracers', slot: 'Forearms' }],
    ]);
    expect(s.equipment).toEqual({ Arms: { item: 'Leather bracers', rarity: undefined, at: 'p2' } });
  });

  it('moves a single item between slots, and takes off gear that is lost', () => {
    const s = sheet([
      ['p1', { kind: 'item', character: 'russ', item: 'Hammer', delta: 1, rarity: 'uncommon' }],
      ['p1', { kind: 'equip', character: 'russ', item: 'Hammer', slot: 'Back' }],
      ['p2', { kind: 'equip', character: 'russ', item: 'Hammer', slot: 'Main hand' }],
      ['p3', { kind: 'item', character: 'russ', item: 'Shield', delta: 1 }],
      ['p3', { kind: 'equip', character: 'russ', item: 'Shield', slot: 'Off hand' }],
      ['p4', { kind: 'item', character: 'russ', item: 'shield', delta: -1 }],
    ]);
    expect(s.equipment).toEqual({ 'Main hand': { item: 'Hammer', rarity: 'uncommon', at: 'p2' } });
    expect(s.items).toEqual({ Hammer: { count: 1, rarity: 'uncommon' } });
  });
});
