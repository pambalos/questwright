import { describe, expect, it } from 'vitest';
import { applyExtraction, type Extraction } from '../src/extraction';
import { fold } from '../src/ledger';
import { SAMPLE } from '../src/sample';
import { ids, parsedProject } from './helpers';

const p4 = SAMPLE.chapters[0]!.paragraphs[3]!;
const p6 = SAMPLE.chapters[0]!.paragraphs[5]!;

const reading = (lore: Extraction['lore']): Extraction => ({ characters: [], changes: [], lore });

describe('compendium', () => {
  it("adds facts to a character's story and to the compendium, straight away", () => {
    const base = parsedProject(SAMPLE).project;
    const { project, proposals } = applyExtraction(base, 'p4', p4.text, reading([
      { subject: 'Kael', category: 'character', fact: 'Survived the tutorial in the Ember Reach.', quote: 'The tutorial ended' },
      { subject: 'Ember Reach', category: 'place', fact: 'A burnt frontier where tutorials end in smoke.', quote: 'Ember Reach' },
    ]), ids());
    expect(proposals).toBe(0);
    const state = fold(project, SAMPLE);
    expect(state.sheets.kael!.lore.map((l) => l.fact)).toEqual(['Survived the tutorial in the Ember Reach.']);
    const reach = state.compendium.find((e) => e.name === 'Ember Reach')!;
    expect(reach).toMatchObject({ category: 'place', firstAt: 'p4', facts: [{ fact: 'A burnt frontier where tutorials end in smoke.', at: 'p4' }] });
    // Every character seen so far has an entry, with or without facts.
    expect(state.compendium.some((e) => e.characterId === 'kael')).toBe(true);
  });

  it('keeps one entry per subject however it is spelled, and does not repeat facts on a re-read', () => {
    const base = parsedProject(SAMPLE).project;
    const wolves = reading([{ subject: 'Ridge Wolves', category: 'creature', fact: 'Hunt in packs at dusk.', quote: 'wolves' }]);
    const once = applyExtraction(base, 'p6', p6.text, wolves, ids()).project;
    const twice = applyExtraction(once, 'p6', p6.text, wolves, ids()).project;
    const more = applyExtraction(twice, 'p4', p4.text, reading([{ subject: 'ridge wolves', category: 'other', fact: 'Fear fire.', quote: 'x' }]), ids()).project;
    const entries = fold(more, SAMPLE).compendium.filter((e) => e.key === 'lore:ridge wolves');
    expect(entries).toHaveLength(1);
    expect(entries[0]!.category).toBe('creature');
    expect(entries[0]!.facts.map((f) => f.fact)).toEqual(['Fear fire.', 'Hunt in packs at dusk.']);
  });

  it('shows only what was known at the point being viewed, and drops facts the author struck out', () => {
    const base = parsedProject(SAMPLE).project;
    const { project } = applyExtraction(base, 'p6', p6.text, reading([{ subject: 'Bram', category: 'character', fact: 'An old merchant at the crossroads.', quote: 'old merchant' }]), ids());
    expect(fold(project, SAMPLE, 3).compendium.some((e) => e.name === 'Bram')).toBe(false);
    const struck = { ...project, records: project.records.map((r) => (r.change.kind === 'lore' ? { ...r, status: 'dismissed' as const } : r)) };
    expect(fold(struck, SAMPLE).compendium.find((e) => e.name === 'Bram')?.facts ?? []).toEqual([]);
  });
});
