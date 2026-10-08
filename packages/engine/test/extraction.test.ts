import { describe, expect, it } from 'vitest';
import { applyExtraction, applySkim, batchExtractionPrompt, BatchExtractionSchema, extractionPrompt, ExtractionSchema, splitBatch, type Extraction } from '../src/extraction';
import { fold } from '../src/ledger';
import { SAMPLE } from '../src/sample';
import { ids, parsedProject } from './helpers';

const p4 = SAMPLE.chapters[0]!.paragraphs[3]!;

const reading: Extraction = {
  characters: [{ name: 'Kael', role: null, description: null, sameAs: null, look: null }],
  changes: [
    { kind: 'equip', character: 'Kael', name: 'Iron Dagger', amount: null, slot: 'Belt', rarity: null, system: null, requires: null, quote: 'slid the dagger into his belt' },
    { kind: 'gain_currency', character: 'he', name: 'Gold', amount: 20, slot: null, rarity: null, system: null, requires: null, quote: 'twenty gold' },
  ],
  lore: [],
};

describe('AI extraction contract', () => {
  it('validates the schema the model is asked to fill', () => {
    expect(ExtractionSchema.parse(reading)).toEqual(reading);
  });

  it('turns a reading into proposals that count only once claimed', () => {
    const base = parsedProject(SAMPLE).project;
    const { project, proposals } = applyExtraction(base, 'p4', p4.text, { ...reading, changes: [reading.changes[0]!, { ...reading.changes[1]!, character: 'Kael' }] }, ids());
    expect(proposals).toBe(2);
    expect(project.extracted.p4).toBeDefined();
    expect(fold(project, SAMPLE).sheets.kael!.equipment).toEqual({});
    const claimed = { ...project, records: project.records.map((r) => (r.status === 'proposed' ? { ...r, status: 'applied' as const } : r)) };
    const s = fold(claimed, SAMPLE).sheets.kael!;
    expect(s.equipment).toEqual({ Belt: { item: 'Iron Dagger', rarity: undefined } });
    expect(s.currencies.Gold).toBe(20);
  });

  it('adds new characters and proposes a merge when the text reveals an identity', () => {
    const base = parsedProject(SAMPLE).project;
    const withStranger = applyExtraction(base, 'p7', SAMPLE.chapters[0]!.paragraphs[6]!.text, {
      characters: [{ name: 'Hooded stranger', role: null, description: 'Watched Kael from the treeline.', sameAs: null, look: { outfit: 'cloak', hair: 'hood', hairColor: null, clothColor: 'not a colour' } }], changes: [], lore: [],
    }, ids()).project;
    expect(withStranger.characters['hooded-stranger']?.description).toBe('Watched Kael from the treeline.');
    expect(withStranger.characters['hooded-stranger']?.lookHints).toEqual({ outfit: 'cloak', hair: 'hood' });
    const p11 = SAMPLE.chapters[1]!.paragraphs[3]!;
    const { project } = applyExtraction(withStranger, 'p11', p11.text, {
      characters: [{ name: 'Hooded stranger', role: null, description: null, sameAs: 'Lyra', look: null }], changes: [], lore: [],
    }, ids());
    expect(project.records.find((r) => r.change.kind === 'merge')).toMatchObject({ status: 'proposed', change: { from: 'hooded-stranger', into: 'lyra' } });
  });

  it('does not re-propose what a system box already applied', () => {
    const base = parsedProject(SAMPLE).project;
    const p5 = SAMPLE.chapters[0]!.paragraphs[4]!;
    const { proposals } = applyExtraction(base, 'p5', p5.text, {
      characters: [], changes: [{ kind: 'skill', character: 'Kael', name: 'Flame Ward', amount: 1, slot: null, rarity: null, system: null, requires: null, quote: 'Flame Ward' }], lore: [],
    }, ids());
    expect(proposals).toBe(0);
  });

  it('re-reading a paragraph replaces its earlier pending finds', () => {
    const base = parsedProject(SAMPLE).project;
    const once = applyExtraction(base, 'p4', p4.text, reading, ids()).project;
    const twice = applyExtraction(once, 'p4', p4.text, reading, ids()).project;
    expect(twice.records.filter((r) => r.paragraphId === 'p4' && r.source === 'ai').length).toBe(
      once.records.filter((r) => r.paragraphId === 'p4' && r.source === 'ai').length,
    );
  });

  it('builds a prompt that carries the paragraph and its context', () => {
    const text = extractionPrompt({ paragraph: 'He paid.', previous: 'Kael walked in.', characters: [{ name: 'Kael', aliases: ['the boy'] }], world: { currencies: ['Gold'], stats: [], slots: [], skills: [], blessings: [], magic: [] }, sheets: ['Kael: 15 Gold'], parsed: [] });
    expect(text).toContain('Kael (also: the boy)');
    expect(text).toContain('<paragraph>\nHe paid.\n</paragraph>');
    expect(text).toContain('Kael: 15 Gold');
  });
});

describe('batch reading', () => {
  it('numbers the paragraphs and notes what system boxes already tracked', () => {
    const text = batchExtractionPrompt({
      paragraphs: [{ text: 'Kael walked in.', parsed: [] }, { text: 'He paid.', parsed: ['Kael: -5 Gold'] }],
      characters: [{ name: 'Kael', aliases: [] }], world: { currencies: ['Gold'], stats: [], slots: [], skills: [], blessings: [], magic: [] }, sheets: [],
    });
    expect(text).toContain('<paragraph n="1">\nKael walked in.\n</paragraph>');
    expect(text).toContain('<paragraph n="2">\nHe paid.\n(Already tracked from system messages in this paragraph: Kael: -5 Gold)\n</paragraph>');
  });

  it('splits a reading back into one per paragraph, empty where the model left one out', () => {
    const result = BatchExtractionSchema.parse({ paragraphs: [{ n: 2, ...reading }, { n: 9, ...reading }] });
    const split = splitBatch(result, 3);
    expect(split).toHaveLength(3);
    expect(split[0]).toEqual({ characters: [], changes: [], lore: [] });
    expect(split[1]).toEqual(reading);
    expect(split[2]).toEqual({ characters: [], changes: [], lore: [] });
  });
});

describe('skim', () => {
  it('adds the cast of a chapter, seen where each is first named', () => {
    const base = parsedProject(SAMPLE).project;
    const ch1 = SAMPLE.chapters[0]!;
    const { project, created } = applySkim(base, ch1, { characters: [{ name: 'Bram', role: 'Merchant', description: null, sameAs: null, look: null }] }, ids());
    expect(created).toEqual(['bram']);
    const st = fold(project, SAMPLE);
    expect(st.sheets.bram!.firstSeen).toBe(5);
    expect(project.extracted.p1).toBeUndefined();
  });
});
