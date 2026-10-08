import { describe, expect, it } from 'vitest';
import { fold, mentionIndex } from '../src/ledger';
import { flatten, label } from '../src/manuscript';
import type { ChangeRecord, Manuscript } from '../src/types';
import { parsedProject } from './helpers';

const book = (n: number, chapters: string[][]): Manuscript['chapters'] =>
  chapters.map((paras, ci) => ({ id: `b${n}c${ci}`, title: `Chapter ${ci + 1}`, book: `Book ${n}`, paragraphs: paras.map((t, pi) => ({ id: `b${n}c${ci}p${pi}`, text: t })) }));

const series: Manuscript = {
  chapters: [
    ...book(1, [['[System Integration Complete]\nWelcome, Kael. Level 1.', 'Kael found a purse.'], ['[Quest Complete] +50 Gold']]),
    ...book(2, [['Kael walked into town.', '[Level Up! Level 2]']]),
  ],
};

const gold = (id: string, paragraphId: string, change: Partial<{ delta: number; set: number }>): ChangeRecord => ({
  id, paragraphId, textHash: 'x', source: 'author', status: 'applied', change: { kind: 'currency', character: 'kael', currency: 'Gold', delta: 0, ...change },
});

describe('series', () => {
  it('labels paragraphs by book and chapter within the book', () => {
    const f = flatten(series);
    expect(label(f[0]!)).toBe('Bk 1 · Ch 1 ¶1');
    expect(label(f[2]!)).toBe('Bk 1 · Ch 2 ¶1');
    expect(label(f[4]!)).toBe('Bk 2 · Ch 1 ¶2');
  });

  it('marks balances carried into a limited import as unconfirmed until the author sets them', () => {
    const { project } = parsedProject(series);
    project.window = { startParagraphId: 'b2c0p0' };
    expect(fold(project, series).sheets.kael!.unconfirmed).toEqual(['currency:Gold']);
    expect(fold(project, series, 2).sheets.kael!.unconfirmed).toEqual([]);
    project.records.push(gold('fix', 'b2c0p0', { set: 35 }));
    const s = fold(project, series).sheets.kael!;
    expect(s.currencies.Gold).toBe(35);
    expect(s.unconfirmed).toEqual([]);
  });

  it('applies an author correction as a set value from that paragraph on', () => {
    const { project } = parsedProject(series);
    project.records.push(gold('fix', 'b1c0p1', { set: 10 }));
    expect(fold(project, series, 1).sheets.kael!.currencies.Gold).toBe(10);
    expect(fold(project, series).sheets.kael!.currencies.Gold).toBe(60);
  });
});

describe('appearance lock', () => {
  it('ignores story appearance changes while locked', () => {
    const { project } = parsedProject(series);
    project.records.push({ id: 'ap', paragraphId: 'b1c0p1', textHash: 'x', source: 'ai', status: 'applied', change: { kind: 'appearance', character: 'kael', note: 'Burn scar' } });
    expect(fold(project, series).sheets.kael!.appearance).toEqual({ version: 2, notes: ['Burn scar'] });
    project.characters.kael!.lockedAppearance = true;
    expect(fold(project, series).sheets.kael!.appearance).toEqual({ version: 1, notes: [] });
  });
});

describe('mention index', () => {
  it('finds names and aliases on word boundaries only', () => {
    const m: Manuscript = { chapters: [{ id: 'c', title: 'x', paragraphs: [
      { id: 'a', text: 'Kaelith is someone else.' }, { id: 'b', text: 'The boy ran. Kael followed.' }, { id: 'c', text: 'Nothing here.' },
    ] }] };
    const idx = mentionIndex(m, { kael: { id: 'kael', name: 'Kael', aliases: ['the boy'] } });
    expect(idx.get('kael')).toEqual([1]);
  });

  it('keeps folding a long series fast', () => {
    const paras = Array.from({ length: 30000 }, (_, i) => ({ id: `p${i}`, text: i % 50 === 0 ? `[Quest Complete] +1 Gold for Kael on day ${i}.` : `Kael and the others walked on through the long day number ${i}, talking quietly.` }));
    const big: Manuscript = { chapters: [{ id: 'c', title: 'Long', paragraphs: [{ id: 'w', text: '[System] Welcome, Kael. Level 1.' }, ...paras] }] };
    const { project } = parsedProject(big);
    const t0 = performance.now();
    const st = fold(project, big);
    fold(project, big, 15000);
    const ms = performance.now() - t0;
    expect(st.sheets.kael!.currencies.Gold).toBe(600);
    expect(ms).toBeLessThan(1500);
  });
});
