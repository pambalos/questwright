import { describe, expect, it } from 'vitest';
import { fold } from '../src/ledger';
import { reconcile } from '../src/reconcile';
import { SAMPLE } from '../src/sample';
import type { Manuscript } from '../src/types';
import { ids, parsedProject } from './helpers';

const edit = (m: Manuscript, id: string, text: string): Manuscript => ({
  chapters: m.chapters.map((c) => ({ ...c, paragraphs: c.paragraphs.map((p) => (p.id === id ? { ...p, text } : p)) })),
});

describe('reconcile', () => {
  it('lists only prose paragraphs for AI extraction', () => {
    const { needsExtraction } = parsedProject(SAMPLE);
    expect(needsExtraction.map((p) => p.id)).toEqual(['p1', 'p4', 'p6', 'p7', 'p8', 'p11', 'p13', 'p14', 'p15', 'p17', 'p19']);
  });

  it('re-reads an edited system box and nothing else', () => {
    const first = parsedProject(SAMPLE).project;
    const changed = edit(SAMPLE, 'p5', '[Skill Acquired: Flame Ward (Lv 3)]');
    const { project } = reconcile(first, changed, ids());
    expect(fold(project, changed, 6).sheets.kael!.skills).toEqual([{ name: 'Flame Ward', level: 3 }]);
    expect(project.records.filter((r) => r.source === 'parser').length).toBe(first.records.length);
  });

  it('drops changes when their paragraph is deleted', () => {
    const first = parsedProject(SAMPLE).project;
    const cut: Manuscript = { chapters: SAMPLE.chapters.map((c) => ({ ...c, paragraphs: c.paragraphs.filter((p) => p.id !== 'p18') })) };
    const { project } = reconcile(first, cut, ids());
    expect(fold(project, cut).sheets.kael!.titles).toEqual([]);
    expect(project.parsed.p18).toBeUndefined();
  });

  it('keeps a claimed find while its words survive an edit, and drops pending ones', () => {
    const first = parsedProject(SAMPLE).project;
    first.records.push(
      { id: 'a1', paragraphId: 'p4', textHash: 'old', source: 'ai', status: 'applied', quote: 'twenty gold', change: { kind: 'currency', character: 'kael', currency: 'Gold', delta: 20 } },
      { id: 'a2', paragraphId: 'p4', textHash: 'old', source: 'ai', status: 'proposed', quote: 'iron dagger', change: { kind: 'equip', character: 'kael', item: 'Iron Dagger', slot: 'Belt' } },
    );
    const changed = edit(SAMPLE, 'p4', 'In the rubble lay a coin purse holding twenty gold.');
    const { project, needsExtraction } = reconcile(first, changed, ids());
    expect(project.records.map((r) => r.id)).toContain('a1');
    expect(project.records.map((r) => r.id)).not.toContain('a2');
    expect(needsExtraction.map((p) => p.id)).toContain('p4');
  });
});
