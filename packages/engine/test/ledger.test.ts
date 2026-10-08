import { describe, expect, it } from 'vitest';
import { fold } from '../src/ledger';
import { SAMPLE } from '../src/sample';
import type { ChangeRecord, Manuscript } from '../src/types';
import { parsedProject } from './helpers';

describe('fold over the sample story', () => {
  const { project } = parsedProject(SAMPLE);

  it('makes the welcomed character the protagonist and promotes them', () => {
    expect(project.protagonistId).toBe('kael');
    const s = fold(project, SAMPLE).sheets.kael!;
    expect(s.promoted).toBe(true);
    expect(s.className).toBe('Ember Warden');
    expect(s.stats).toMatchObject({ Level: 2, STR: 8, AGI: 5, VIT: 8, MANA: 12, 'Free points': 3 });
    expect(s.skills).toEqual([{ name: 'Ember Bulwark', level: 1, evolvedFrom: 'Flame Ward', requires: 'Flame Ward', at: 'p16' }]);
    expect(s.titles).toEqual(['Wolfbane']);
    expect(s.blessingPoints).toBe(1);
    expect(s.panels).toEqual(['stats', 'skills', 'blessings', 'titles']);
  });

  it('shows the sheet as of an earlier paragraph', () => {
    const atCh1 = fold(project, SAMPLE, 6).sheets.kael!;
    expect(atCh1.stats.Level).toBe(1);
    expect(atCh1.skills).toEqual([{ name: 'Flame Ward', level: 1, at: 'p5' }]);
    expect(fold(project, SAMPLE, 6).sheets.lyra).toBeUndefined();
  });

  it('gives Lyra her own sheet from her system line', () => {
    const s = fold(project, SAMPLE).sheets.lyra!;
    expect(s).toMatchObject({ className: 'Lightbinder', stats: { Level: 5 }, promoted: true });
  });

  it('builds world definitions from what has been introduced', () => {
    const w = fold(project, SAMPLE).world;
    expect(w.stats).toEqual(['Level', 'STR', 'AGI', 'VIT', 'MANA', 'Free points']);
    expect(w.blessings).toEqual(['Blessing of the Hearth']);
  });
});

describe('claimed finds and continuity checks', () => {
  const m: Manuscript = {
    chapters: [{ id: 'c', title: 'One', paragraphs: [
      { id: 'a', text: '[System Integration Complete]\nWelcome, Kael. Level 1.' },
      { id: 'b', text: 'He found twenty gold.' },
      { id: 'c', text: 'The guard took thirty gold.' },
    ] }],
  };
  const base = parsedProject(m).project;
  const rec = (id: string, paragraphId: string, delta: number, status: ChangeRecord['status']): ChangeRecord => ({
    id, paragraphId, textHash: 'x', source: 'ai', status, change: { kind: 'currency', character: 'kael', currency: 'Gold', delta },
  });

  it('counts only claimed AI finds', () => {
    const p = { ...base, records: [...base.records, rec('g1', 'b', 20, 'applied'), rec('g2', 'c', -30, 'proposed')] };
    expect(fold(p, m).sheets.kael!.currencies.Gold).toBe(20);
    expect(fold(p, m).warnings).toEqual([]);
  });

  it('warns when a balance goes below zero, at the paragraph that did it', () => {
    const p = { ...base, records: [...base.records, rec('g1', 'b', 20, 'applied'), rec('g2', 'c', -30, 'applied')] };
    const st = fold(p, m);
    expect(st.sheets.kael!.currencies.Gold).toBe(-10);
    expect(st.warnings).toEqual([
      { kind: 'negative-currency', characterId: 'kael', paragraphId: 'c', message: "Kael's Gold goes below zero, to -10 (Ch 1 ¶3)" },
    ]);
  });

  it('counts a merged character towards the one they were merged into', () => {
    const p = structuredClone(base);
    p.characters.stranger = { id: 'stranger', name: 'Hooded stranger', aliases: [], mergedInto: 'kael' };
    p.records.push({ ...rec('g3', 'b', 5, 'applied'), change: { kind: 'currency', character: 'stranger', currency: 'Gold', delta: 5 } });
    const st = fold(p, m);
    expect(st.sheets.kael!.currencies.Gold).toBe(5);
    expect(st.sheets.stranger).toBeUndefined();
  });
});
