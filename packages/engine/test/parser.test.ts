import { describe, expect, it } from 'vitest';
import { parseParagraph } from '../src/parser';

const kinds = (text: string, protagonist = 'Kael') => parseParagraph(text, { protagonist }).map((p) => p.change);

describe('system-box parser', () => {
  it('reads class, level and the welcomed character', () => {
    const out = kinds('[System Integration Complete]\nWelcome, Kael. Class assigned: Ember Warden. Level 1.', undefined as unknown as string);
    expect(out).toContainEqual({ kind: 'mention', character: 'Kael' });
    expect(out).toContainEqual({ kind: 'class', character: 'Kael', name: 'Ember Warden' });
    expect(out).toContainEqual({ kind: 'stat', character: 'Kael', stat: 'Level', set: 1 });
  });

  it('reads a status block as set values', () => {
    expect(kinds('[Status] STR 6 · AGI 5 · VIT 7 · MANA 12')).toEqual([
      { kind: 'stat', character: 'Kael', stat: 'STR', set: 6 },
      { kind: 'stat', character: 'Kael', stat: 'AGI', set: 5 },
      { kind: 'stat', character: 'Kael', stat: 'VIT', set: 7 },
      { kind: 'stat', character: 'Kael', stat: 'MANA', set: 12 },
    ]);
  });

  it('reads level-up deltas and free points without double counting', () => {
    expect(kinds('[Level Up! Level 2]\n+2 STR · +1 VIT · 3 free points')).toEqual([
      { kind: 'stat', character: 'Kael', stat: 'Level', set: 2 },
      { kind: 'stat', character: 'Kael', stat: 'STR', delta: 2 },
      { kind: 'stat', character: 'Kael', stat: 'VIT', delta: 1 },
      { kind: 'stat', character: 'Kael', stat: 'Free points', set: 3 },
    ]);
  });

  it('reads acquired and evolved skills', () => {
    expect(kinds('[Skill Acquired: Flame Ward (Lv 1)]')).toEqual([{ kind: 'skill', character: 'Kael', skill: 'Flame Ward', level: 1 }]);
    expect(kinds('[Skill Evolved: Flame Ward → Ember Bulwark (Lv 1)]')).toEqual([
      { kind: 'skill', character: 'Kael', skill: 'Ember Bulwark', level: 1, replaces: 'Flame Ward' },
    ]);
  });

  it('reads a blessing with its points once', () => {
    expect(kinds('[Blessing of the Hearth received]\nYou have gained 1 Blessing Point.')).toEqual([
      { kind: 'blessing', character: 'Kael', blessing: 'Blessing of the Hearth', points: 1 },
    ]);
  });

  it('attributes a line to the character it names', () => {
    const out = kinds('[Party formed: Kael · Lyra]\nLyra · Class: Lightbinder · Level 5 · Skill: Mending Light (Lv 4)');
    expect(out).toEqual([
      { kind: 'mention', character: 'Kael' },
      { kind: 'mention', character: 'Lyra' },
      { kind: 'class', character: 'Lyra', name: 'Lightbinder' },
      { kind: 'stat', character: 'Lyra', stat: 'Level', set: 5 },
      { kind: 'skill', character: 'Lyra', skill: 'Mending Light', level: 4 },
    ]);
  });

  it('reads titles, items, equipment and currency', () => {
    expect(kinds('[Title Earned: Wolfbane]')).toEqual([{ kind: 'title', character: 'Kael', name: 'Wolfbane' }]);
    expect(kinds('[Item Acquired: Healing Potion x3]')).toEqual([{ kind: 'item', character: 'Kael', item: 'Healing Potion', delta: 3 }]);
    expect(kinds('[Equipped: Cinder Band (Ring)]')).toEqual([{ kind: 'equip', character: 'Kael', item: 'Cinder Band', slot: 'Ring' }]);
    expect(kinds('[Quest Complete] +50 Gold')).toEqual([{ kind: 'currency', character: 'Kael', currency: 'Gold', delta: 50 }]);
  });

  it('only reads bracketed text inside prose and ignores prose itself', () => {
    expect(kinds('He paid ten gold. Then the chime: [Title Earned: Gatecrasher] and he grinned.')).toEqual([
      { kind: 'title', character: 'Kael', name: 'Gatecrasher' },
    ]);
    expect(kinds('He found twenty gold and a dagger.')).toEqual([]);
  });

  it('skips game changes when it cannot tell who they belong to', () => {
    expect(parseParagraph('[Skill Acquired: Flame Ward (Lv 1)]', {})).toEqual([]);
  });
});
