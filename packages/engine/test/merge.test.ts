import { describe, expect, it } from 'vitest';
import { fold } from '../src/ledger';
import { reconcile } from '../src/reconcile';
import { addCharacter, applyMerge, canonical, repairMerges } from '../src/registry';
import { SAMPLE } from '../src/sample';
import type { Registry } from '../src/types';
import { ids, parsedProject } from './helpers';

const twoNames = (): Registry => {
  const reg: Registry = {};
  addCharacter(reg, 'Russ');
  addCharacter(reg, 'Russel Salazar');
  return reg;
};

describe('merges', () => {
  it('claiming both directions of a merge keeps one character', () => {
    const reg = twoNames();
    applyMerge(reg, 'russel-salazar', 'russ');
    applyMerge(reg, 'russ', 'russel-salazar');
    expect(reg.russ!.mergedInto).toBeUndefined();
    expect(reg['russel-salazar']!.mergedInto).toBe('russ');
    expect(canonical(reg, 'russel-salazar')).toBe('russ');
  });

  it('breaks a merge loop, keeping the character seen first', () => {
    const reg = twoNames();
    reg.russ!.mergedInto = 'russel-salazar';
    reg['russel-salazar']!.mergedInto = 'russ';
    expect(repairMerges(reg)).toEqual(['russ']);
    expect(reg.russ!.mergedInto).toBeUndefined();
    expect(reg['russel-salazar']!.mergedInto).toBe('russ');
    expect(repairMerges(reg)).toEqual([]);
  });

  it('a book saved with a merge loop gets its character back on load', () => {
    const base = parsedProject(SAMPLE).project;
    base.characters.kael!.mergedInto = 'lyra';
    base.characters.lyra!.mergedInto = 'kael';
    const { project } = reconcile(base, SAMPLE, ids());
    expect(fold(project, SAMPLE).sheets.kael).toBeDefined();
    expect(base.characters.kael!.mergedInto).toBe('lyra');
  });
});
