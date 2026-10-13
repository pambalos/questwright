export * from './types';
export * from './manuscript';
export * from './registry';
export * from './parser';
export * from './ledger';
export * from './reconcile';
export * from './extraction';
export * from './sample';
export * from './slots';
export * from './memory';
export * from './art';
export * from './patterns';
export * from './lorepass';
export * from './cards';
export * from './boxes';
export * from './narrative';

import type { Project } from './types';

export function emptyProject(id: string, title: string): Project {
  return { id, title, characters: {}, records: [], parsed: {}, extracted: {} };
}
export * from './import';
