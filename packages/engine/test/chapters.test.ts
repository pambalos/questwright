import { describe, expect, it } from 'vitest';
import { isBookMarker, isChapterMarker } from '../src/import';

describe('chapter markers', () => {
  it('recognises the ways books mark chapters', () => {
    for (const t of ['Chapter 1 - Initialization', 'Chapter 17- The Hydra Emerges', 'CHAPTER THREE: The Swamp', 'Ch 5', 'Ch. 12 Rescue', 'Chap. 4', 'Prologue', 'Epilogue: After', 'Side Story: Lyra', '~ Chapter 4 ~', '## Chapter 2', 'Interlude', 'Chapter 23'])
      expect(isChapterMarker(t), t).toBe(true);
  });

  it('leaves prose alone', () => {
    for (const t of ['Chapters of his life flashed by.', 'Chess was never his game', 'The chapter house stood empty.', 'He opened the book to chapter three and read.', '5:00', ''])
      expect(isChapterMarker(t), t).toBe(false);
  });

  it('tells books from chapters', () => {
    expect(isBookMarker('Book 2: The Swamp')).toBe(true);
    expect(isBookMarker('Volume III')).toBe(true);
    expect(isBookMarker('Chapter 2')).toBe(false);
  });
});
