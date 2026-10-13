import { describe, expect, it } from 'vitest';
import { boxExamples, boxSections, entryBox, sheetBox } from '../src/boxes';
import { fold } from '../src/ledger';
import { parseParagraph } from '../src/parser';
import type { Manuscript } from '../src/types';
import { parsedProject } from './helpers';

const para = (id: string, text: string) => ({ id, text });

const book = (extra: string[] = []): Manuscript => ({
  chapters: [
    {
      id: 'c1',
      title: 'One',
      paragraphs: [
        para('p1', '[Welcome, Russ. Class assigned: Brawler. Level 3]'),
        para('p2', '[Russ · STR 12 · AGI 9]'),
        para('p3', '[Kael · Level 5. Class: Ranger. Skill Acquired: Quick Shot (Lv 2)]'),
        para('p4', '[Kael · Item Acquired: Wolf Pelt x3]'),
        para('p5', '[Kael · Equipped: Ash Bow (Main hand)]'),
        para('p6', '[Kael · gained 120 Gold]'),
        ...extra.map((t, i) => para(`x${i}`, t)),
      ],
    },
  ],
});

describe('system boxes from memory', () => {
  it('writes a status screen that changes nothing when read back', () => {
    const before = fold(parsedProject(book()).project, book());
    const kael = Object.values(before.sheets).find((s) => s.className === 'Ranger')!;
    const box = sheetBox(kael, 'Kael', boxSections(kael));
    expect(box).toContain('Name: Kael');
    expect(box).toContain('Level: 5');
    expect(box).toContain('Quick Shot (Lv 2)');
    expect(box).toContain('Wolf Pelt ×3');
    expect(box).toContain('Main hand: Ash Bow');
    expect(box).toContain('Gold: 120');

    const after = fold(parsedProject(book([box])).project, book([box]));
    const strip = (s: typeof kael) => ({ ...s, lastSeen: 0, firstSeen: 0 });
    for (const id of Object.keys(before.sheets)) expect(strip(after.sheets[id]!)).toEqual(strip(before.sheets[id]!));
  });

  it("puts a named status screen's lines on that character, not the protagonist", () => {
    const changes = parseParagraph('[Status]\nName: Kael\nClass: Ranger\nSTR: 14', { protagonist: 'Russ' }).map((c) => c.change);
    expect(changes).toContainEqual({ kind: 'class', character: 'Kael', name: 'Ranger' });
    expect(changes).toContainEqual({ kind: 'stat', character: 'Kael', stat: 'STR', set: 14 });
    expect(changes.some((c) => 'character' in c && c.character === 'Russ')).toBe(false);
  });

  it('writes a description box the parser reads as the same description', () => {
    const e = {
      key: 'lore:qi slam', name: 'Qi Slam', category: 'spell' as const, firstAt: 'p1', aliases: [], said: [], relations: [],
      facts: [{ fact: 'Slam the ground to knock enemies back. (Cost: 1 Qi, Cooldown: 30 minutes)', at: 'p1', recordId: 'r1' }],
      traits: [{ text: 'uncommon', at: 'p1', recordId: 'r2' }],
    };
    const box = entryBox(e);
    expect(box).toBe('[Qi Slam (Uncommon)]: Slam the ground to knock enemies back. (Cost: 1 Qi, Cooldown: 30 minutes)');
    const lore = parseParagraph(box).map((c) => c.change);
    expect(lore).toContainEqual({ kind: 'lore', subject: 'Qi Slam', category: 'spell', fact: 'uncommon', lore: 'trait' });
  });

  it('picks status-like boxes from the book as style examples', () => {
    const ex = boxExamples(['Plain prose.', '[Name: Russ\nLevel: 3\nSTR: 12]', '[Ding!]'], 'sheet');
    expect(ex).toEqual(['[Name: Russ\nLevel: 3\nSTR: 12]']);
  });
});
