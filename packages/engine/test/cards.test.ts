import { describe, expect, it } from 'vitest';
import { draftCard } from '../src/cards';
import type { CompendiumEntry } from '../src/types';

const qiBlast: CompendiumEntry = {
  key: 'lore:qi blast', name: 'Qi Blast', category: 'spell', firstAt: 'p1',
  facts: [{ recordId: 'r1', at: 'p1', fact: 'Releases a blast of Qi at a target, briefly stunning them. (Cost: 1 Qi + Variable Cost, Cooldown: 30 minutes.)' }],
  traits: [{ recordId: 't', at: 'p1', text: 'uncommon' }], said: [], relations: [], aliases: [],
};

describe('draft cards', () => {
  it('turns a system description into rules text, cost, stats and rarity', () => {
    const c = draftCard(qiBlast);
    expect(c).toMatchObject({ title: 'Qi Blast', typeLine: 'Skill', rarity: 'uncommon', cost: '1 Qi + Variable', text: 'Releases a blast of Qi at a target, briefly stunning them.' });
    expect(c.stats).toEqual([{ label: 'Cooldown', value: '30 minutes' }]);
  });
});
