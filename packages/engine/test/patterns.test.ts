import { describe, expect, it } from 'vitest';
import { fold } from '../src/ledger';
import { parseParagraph } from '../src/parser';
import { applyPattern, compilePattern, patternFromDraft, patternsStamp, type LearnedPattern } from '../src/patterns';
import { reconcile } from '../src/reconcile';
import type { Manuscript, Project } from '../src/types';

const loot: LearnedPattern = patternFromDraft(
  {
    name: 'Loot line',
    regex: String.raw`<<\s*Loot:\s*(?<item>[^×<]+?)\s*×\s*(?<n>\d+)\s*\|\s*(?<rarity>\w+)\s*>>`,
    flags: 'i',
    produces: [
      { kind: 'item', fields: [{ field: 'item', value: '$<item>' }, { field: 'amount', value: '$<n>' }, { field: 'rarity', value: '$<rarity>' }] },
      { kind: 'lore', fields: [{ field: 'subject', value: '$<item>' }, { field: 'fact', value: '$<rarity>' }, { field: 'category', value: 'item' }, { field: 'kind', value: 'trait' }] },
    ],
    explanation: 'An item looted, with how many and its rarity.',
  },
  'p1',
  '<< Loot: Wolf Pelt × 3 | Uncommon >>',
);

describe('learned patterns', () => {
  it('turns each match into changes, filling in the groups', () => {
    expect(compilePattern(loot)?.flags).toContain('g');
    const out = applyPattern(loot, 'They searched the den. << Loot: Wolf Pelt × 3 | Uncommon >> and << loot: Fang × 1 | Common >>', 'Kael').map((x) => x.change);
    expect(out).toContainEqual({ kind: 'item', character: 'Kael', item: 'Wolf Pelt', delta: 3, rarity: 'uncommon' });
    expect(out).toContainEqual({ kind: 'item', character: 'Kael', item: 'Fang', delta: 1, rarity: 'common' });
    expect(out).toContainEqual({ kind: 'lore', subject: 'Fang', category: 'item', fact: 'Common', lore: 'trait' });
  });

  it('runs in the parser, even outside brackets, and a broken pattern does nothing', () => {
    expect(parseParagraph('<< Loot: Fang × 2 | Rare >>', { protagonist: 'Kael', patterns: [loot] }).map((x) => x.change.kind)).toEqual(['item', 'lore']);
    expect(parseParagraph('<< Loot: Fang × 2 | Rare >>', { protagonist: 'Kael', patterns: [{ ...loot, regex: '(' }] })).toEqual([]);
    expect(parseParagraph('<< Loot: Fang × 2 | Rare >>', { protagonist: 'Kael', patterns: [{ ...loot, enabled: false }] })).toEqual([]);
  });

  it('reads the whole book again when a pattern is added', () => {
    const book: Manuscript = { chapters: [{ id: 'c', title: 'C', paragraphs: [{ id: 'p1', text: '[Welcome, Kael.] << Loot: Fang × 2 | Rare >>' }] }] };
    let n = 0;
    const base: Project = { id: 'b', title: 'B', characters: {}, records: [], parsed: {}, extracted: {} };
    const first = reconcile(base, book, () => `r${n++}`).project;
    expect(fold(first, book).sheets.kael?.items).toEqual({});
    expect(patternsStamp([loot])).not.toBe('');
    const learned = reconcile({ ...first, patterns: [loot] }, book, () => `r${n++}`).project;
    expect(fold(learned, book).sheets.kael?.items).toEqual({ Fang: { count: 2, rarity: 'rare' } });
  });
});
