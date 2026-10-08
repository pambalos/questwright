import { describe, expect, it } from 'vitest';
import { applyExtraction } from '../src/extraction';
import { fold } from '../src/ledger';
import type { Manuscript } from '../src/types';
import { ids, parsedProject } from './helpers';

const BOOK: Manuscript = {
  chapters: [
    {
      id: 'c1',
      title: 'The Well',
      paragraphs: [
        { id: 'p1', text: 'Russ sat by the well and breathed until the ground hummed back.' },
        { id: 'p2', text: '[Russ · Path Unlocked: Qi Cultivation]' },
        { id: 'p3', text: '[Russ · Skill Acquired: Earth Sense (Lv 1, Qi Cultivation)]' },
        { id: 'p4', text: '[Russ · Skill Evolved: Earth Sense → Earth Veins (Lv 2)]' },
        { id: 'p5', text: '[Russ · Skill Acquired: Iron Skin (Lv 1)]' },
      ],
    },
  ],
};

describe('magic systems', () => {
  it('gives each magic system a character takes up its own panel and a tree in the world', () => {
    const { project } = parsedProject(BOOK);
    const state = fold(project, BOOK);
    const russ = state.sheets.russ!;
    expect(russ.magic).toEqual([{ system: 'Qi Cultivation', at: 'p2' }]);
    // An evolved skill stays in its system and builds on what it evolved from.
    expect(russ.skills.find((k) => k.name === 'Earth Veins')).toMatchObject({ system: 'Qi Cultivation', requires: 'Earth Sense', level: 2 });
    expect(state.world.magic).toEqual([
      {
        name: 'Qi Cultivation',
        skills: [
          { name: 'Earth Sense', at: 'p3', holders: ['russ'] },
          { name: 'Earth Veins', requires: 'Earth Sense', at: 'p4', holders: ['russ'] },
        ],
      },
    ]);
    // Skills outside any system stay on the ordinary Skills panel.
    expect(russ.panels).toContain('skills');
  });

  it("lets the author's word on a skill's system win", () => {
    const { project } = parsedProject(BOOK);
    const state = fold({ ...project, skillPaths: { 'Iron Skin': { system: 'Body Tempering' } } }, BOOK);
    expect(state.sheets.russ!.magic.map((m) => m.system)).toEqual(['Qi Cultivation', 'Body Tempering']);
    expect(state.sheets.russ!.panels).not.toContain('skills');
  });

  it('only shows the tree up to the point in the story being viewed', () => {
    const { project } = parsedProject(BOOK);
    const early = fold(project, BOOK, 2);
    expect(early.world.magic[0]!.skills.map((k) => k.name)).toEqual(['Earth Sense']);
  });

  it('reads a character taking up a magic system from prose', () => {
    const { project } = parsedProject(BOOK);
    const { project: read, proposals } = applyExtraction(project, 'p1', BOOK.chapters[0]!.paragraphs[0]!.text, {
      characters: [],
      changes: [{ kind: 'magic_system', character: 'Russ', name: 'qi cultivation', amount: null, slot: null, rarity: null, system: null, requires: null, quote: 'breathed until the ground hummed back' }],
    }, ids());
    expect(proposals).toBe(1);
    const claimed = { ...read, records: read.records.map((r) => (r.status === 'proposed' ? { ...r, status: 'applied' as const } : r)) };
    // Spelled differently, it is still the same system.
    expect(fold(claimed, BOOK).sheets.russ!.magic).toEqual([{ system: 'qi cultivation', at: 'p1' }]);
  });
});
