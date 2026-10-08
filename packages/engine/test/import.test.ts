import { describe, expect, it } from 'vitest';
import { naturalCompare, splitBook } from '../src/import';
import { parseParagraph } from '../src/parser';

describe('splitBook', () => {
  const text = `Prologue

The rain had not stopped for three days.
Kael watched it from the shrine door.

[Status] STR 6 · AGI 5
[Skill Acquired: Flame Ward (Lv 1)]

Chapter 1: The Road

He walked.

Then he ran.`;

  it('splits chapters and blank-line paragraphs, joining wrapped lines', () => {
    const ch = splitBook(text, 'Book 1', 'b1');
    expect(ch.map((c) => c.title)).toEqual(['Prologue', 'Chapter 1: The Road']);
    expect(ch[0]!.paragraphs.map((p) => p.text)).toEqual([
      'The rain had not stopped for three days. Kael watched it from the shrine door.',
      '[Status] STR 6 · AGI 5\n[Skill Acquired: Flame Ward (Lv 1)]',
    ]);
    expect(ch[1]!.paragraphs.map((p) => p.id)).toEqual(['b1c1p0', 'b1c1p1']);
    expect(ch.every((c) => c.book === 'Book 1')).toBe(true);
  });

  it('keeps a system box readable by the parser', () => {
    const box = splitBook(text, 'Book 1', 'b1')[0]!.paragraphs[1]!.text;
    expect(parseParagraph(box, { protagonist: 'Kael' }).map((x) => x.change.kind)).toEqual(['stat', 'stat', 'skill']);
  });

  it('treats each line as a paragraph when the book has no blank lines', () => {
    const ch = splitBook('# Chapter One\nHe walked.\nShe ran.\n[Title Earned: Swift]', 'B', 'x');
    expect(ch[0]!.paragraphs.map((p) => p.text)).toEqual(['He walked.', 'She ran.', '[Title Earned: Swift]']);
  });

  it('keeps unbracketed lines inside a system box block', () => {
    const ch = splitBook('Chapter 1\n\n[System Integration Complete]\nWelcome, Kael. Level 1.\n\nHe stood.', 'B', 'x');
    expect(ch[0]!.paragraphs.map((p) => p.text)).toEqual(['[System Integration Complete]\nWelcome, Kael. Level 1.', 'He stood.']);
    const flat = splitBook('Chapter 1\n[Level Up! Level 2]\n+2 STR · +1 VIT\nHe grinned.', 'B', 'y');
    expect(flat[0]!.paragraphs.map((p) => p.text)).toEqual(['[Level Up! Level 2]\n+2 STR · +1 VIT', 'He grinned.']);
  });

  it('sorts book files by their numbers', () => {
    expect(['Book 10.txt', 'Book 2.txt', 'Book 1.txt'].sort(naturalCompare)).toEqual(['Book 1.txt', 'Book 2.txt', 'Book 10.txt']);
  });
});
