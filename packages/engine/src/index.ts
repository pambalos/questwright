export * from './types';
export * from './manuscript';
export * from './registry';
export * from './parser';
export * from './ledger';
export * from './reconcile';
export * from './extraction';
export * from './sample';

import type { Project } from './types';

export function emptyProject(id: string, title: string): Project {
  return { id, title, characters: {}, records: [], parsed: {}, extracted: {} };
}
