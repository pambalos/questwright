import { wordCount, type Manuscript, type Project, type WorldState } from '@questwright/engine';

export interface Achievement {
  id: string;
  name: string;
  test(ctx: { project: Project; manuscript: Manuscript; state: WorldState }): boolean;
}

const tabs = (s: WorldState) => Object.values(s.sheets).filter((x) => x.promoted).length;

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'sheet', name: 'Character sheet opened', test: ({ state }) => tabs(state) >= 1 },
  { id: 'loot', name: 'First loot claimed', test: ({ project }) => project.records.some((r) => r.source === 'ai' && r.status === 'applied' && r.change.kind !== 'mention') },
  { id: 'party', name: 'Party of two', test: ({ state }) => tabs(state) >= 2 },
  { id: 'path', name: 'Pathfinder', test: ({ state }) => state.world.magic.length > 0 },
  { id: 'stars', name: 'Star chart', test: ({ state }) => state.world.magic.some((m) => m.skills.length >= 5) },
  { id: 'codex', name: 'Codex keeper', test: ({ state }) => state.world.blessings.length > 0 || state.world.currencies.length >= 2 },
  { id: 'catch', name: 'Continuity catch', test: ({ state }) => state.warnings.length > 0 },
  { id: 'w1k', name: 'Scribe: 1,000 words', test: ({ manuscript }) => wordCount(manuscript) >= 1000 },
  { id: 'w10k', name: 'Chronicler: 10,000 words', test: ({ manuscript }) => wordCount(manuscript) >= 10000 },
  { id: 'w50k', name: 'Saga-weaver: 50,000 words', test: ({ manuscript }) => wordCount(manuscript) >= 50000 },
  { id: 'ch10', name: 'Ten chapters', test: ({ manuscript }) => manuscript.chapters.length >= 10 },
];
