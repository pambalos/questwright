import { describe, expect, it } from 'vitest';
import { applyExtraction, extractionPrompt, type Extraction } from '../src/extraction';
import { fold } from '../src/ledger';
import { codexPrompt, memoryFor, memoryLine } from '../src/memory';
import { SAMPLE } from '../src/sample';
import { ids, parsedProject } from './helpers';

const p6 = SAMPLE.chapters[0]!.paragraphs[5]!;
const p7 = SAMPLE.chapters[0]!.paragraphs[6]!;

function read(): ReturnType<typeof fold> {
  const base = parsedProject(SAMPLE).project;
  const reading: Extraction = {
    characters: [{ name: 'Bram', role: 'merchant', description: null, sameAs: null, look: null }],
    changes: [],
    lore: [
      { subject: 'Bram', category: 'character', kind: 'trait', speaker: null, fact: 'old', quote: 'old merchant' },
      { subject: 'Bram', category: 'character', kind: 'fact', speaker: null, fact: 'Sells potions at the crossroads.', quote: 'crossroads' },
      { subject: 'Bram', category: 'character', kind: 'said', speaker: 'Bram', fact: "You'll want a potion or three.", quote: 'potion or' },
    ],
    relations: [{ subject: 'Bram', relation: 'trades with', object: 'Kael', quote: 'Kael paid' }],
  };
  const project = applyExtraction(base, 'p6', p6.text, reading, ids()).project;
  return fold(project, SAMPLE);
}

describe('memory graph', () => {
  it('keeps facts, traits, things said and links on each entry', () => {
    const state = read();
    const bram = state.compendium.find((e) => e.name === 'Bram')!;
    expect(bram.facts.map((f) => f.fact)).toEqual(['Sells potions at the crossroads.']);
    expect(bram.traits.map((t) => t.text)).toEqual(['old']);
    expect(bram.said).toMatchObject([{ text: "You'll want a potion or three.", speaker: 'Bram' }]);
    expect(bram.relations).toMatchObject([{ key: 'char:kael', name: 'Kael', relation: 'trades with', direction: 'out' }]);
    // The link shows from the other end too.
    expect(state.compendium.find((e) => e.key === 'char:kael')!.relations).toMatchObject([{ name: 'Bram', direction: 'in' }]);
    // Only facts make up a character's story; traits and quotes stay on the entry.
    expect(state.sheets.bram!.lore.map((l) => l.fact)).toEqual(['Sells potions at the crossroads.']);
  });

  it('gives spells and magic systems entries without any AI reading', () => {
    const state = fold(parsedProject(SAMPLE).project, SAMPLE);
    expect(state.compendium.find((e) => e.name === 'Flame Ward')).toMatchObject({ category: 'spell' });
  });

  it('briefs the AI on whoever a passage names, and on no one else', () => {
    const state = read();
    const lines = memoryFor(state, [p7.text, 'Bram counted the coins again.']);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe(memoryLine(state.compendium.find((e) => e.name === 'Bram')!));
    expect(lines[0]).toContain('old');
    expect(lines[0]).toContain('trades with Kael');
    expect(memoryFor(state, ['The road was empty.'])).toEqual([]);
    const prompt = extractionPrompt({ paragraph: 'Bram waved.', characters: [], world: state.world, sheets: [], parsed: [], memory: lines });
    expect(prompt).toContain('What you remember');
  });

  it('writes the codex prompt from memory only', () => {
    const bram = read().compendium.find((e) => e.name === 'Bram')!;
    const prompt = codexPrompt(bram, { role: 'merchant' });
    expect(prompt).toContain('Sells potions at the crossroads.');
    expect(prompt).toContain('Bram trades with Kael');
    expect(prompt).toContain('said by Bram');
  });
});
