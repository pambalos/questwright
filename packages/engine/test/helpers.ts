import { emptyProject } from '../src/index';
import { reconcile } from '../src/reconcile';
import type { Manuscript, Project } from '../src/types';

export function ids() {
  let n = 0;
  return () => `r${++n}`;
}

export function parsedProject(m: Manuscript, base?: Project) {
  return reconcile(base ?? emptyProject('t', 'Test'), m, ids());
}
