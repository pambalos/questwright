import type { Manuscript } from './types';

/** The opening of "Emberfall", the sample story a new project starts with. */
export const SAMPLE_TITLE = 'Emberfall · Book 1';

export const SAMPLE: Manuscript = {
  chapters: [
    {
      id: 'c1',
      title: 'The Ashen Trial',
      paragraphs: [
        { id: 'p1', text: 'The tutorial ended the way everything in the Ember Reach ended: in smoke. Kael coughed his way out of the collapsed shrine, ears still ringing from the voice that had spoken inside his skull.' },
        { id: 'p2', text: '[System Integration Complete]\nWelcome, Kael. Class assigned: Ember Warden. Level 1.' },
        { id: 'p3', text: '[Status] STR 6 · AGI 5 · VIT 7 · MANA 12' },
        { id: 'p4', text: 'Among the rubble he found a dented iron dagger and a coin purse that clinked like twenty gold. He slid the dagger into his belt and felt, for the first time, armed.' },
        { id: 'p5', text: '[Skill Acquired: Flame Ward (Lv 1)]' },
        { id: 'p6', text: 'At the crossroads an old merchant named Bram waved him over. "Fresh from the shrine? You\'ll want a potion or three." Kael paid five gold for two healing potions.' },
        { id: 'p7', text: 'From the treeline, a hooded stranger watched him go. When he looked back, the road was empty.' },
      ],
    },
    {
      id: 'c2',
      title: 'Blood on the Ridge',
      paragraphs: [
        { id: 'p8', text: 'The ridge wolves came at dusk. Flame Ward caught the first one mid-leap. The second opened a line of fire across his cheek before it fell. The burn would scar.' },
        { id: 'p9', text: '[Level Up! Level 2]\n+2 STR · +1 VIT · 3 free points' },
        { id: 'p10', text: '[Blessing of the Hearth received]\nYou have gained 1 Blessing Point.' },
        { id: 'p11', text: 'A girl in a torn grey cloak knelt beside him and pressed glowing hands to the wound. "Hold still. I\'m Lyra, and you\'re bleeding on my boots." He realised she was the stranger from the treeline.' },
        { id: 'p12', text: '[Party formed: Kael · Lyra]\nLyra · Class: Lightbinder · Level 5 · Skill: Mending Light (Lv 4)' },
        { id: 'p13', text: 'Tangled in the pelt of the last wolf was a ring of blackened silver. It slid onto Kael\'s finger like it had been waiting for him. He bundled three pelts for the market.' },
        { id: 'p14', text: 'Lyra counted out her savings: twelve gold. "Enough for a room in Ashford, if you\'re buying dinner."' },
      ],
    },
    {
      id: 'c3',
      title: 'The Toll at Ashford',
      paragraphs: [
        { id: 'p15', text: 'Ashford\'s gate guard charged ten gold a head. Kael paid for both of them without thinking.' },
        { id: 'p16', text: '[Skill Evolved: Flame Ward → Ember Bulwark (Lv 1)]' },
        { id: 'p17', text: 'He put all three free points into Vitality, then sold the pelts to a tanner for nine gold.' },
        { id: 'p18', text: '[Title Earned: Wolfbane]' },
        { id: 'p19', text: 'The inn smelled of woodsmoke and spilled ale. For the first time since the shrine, Kael let himself sit down.' },
      ],
    },
  ],
};
