import { flatten, hashText, isSystemBox, type PlacedParagraph } from './manuscript';
import { PARSER_VERSION, parseParagraph } from './parser';
import { patternsStamp } from './patterns';
import { repairMerges, resolveDrafts } from './registry';
import type { ChangeRecord, Manuscript, Project } from './types';

export interface ReconcileResult {
  project: Project;
  /** Prose paragraphs whose current text has not been through AI extraction. */
  needsExtraction: PlacedParagraph[];
  /** Characters the parser added to the registry. */
  created: string[];
}

const MECHANIC = new Set(['stat', 'class', 'title', 'currency', 'skill', 'item', 'equip', 'blessing', 'magic']);

/**
 * Brings the change log in line with the current manuscript: drops records for
 * deleted paragraphs, re-runs the parser on edited ones, and keeps claimed AI
 * finds only while the words they came from are still there. Pure: returns a
 * new project.
 */
export function reconcile(input: Project, manuscript: Manuscript, newId: () => string): ReconcileResult {
  const project: Project = structuredClone(input);
  repairMerges(project.characters);
  const flat = flatten(manuscript);
  const byId = new Map(flat.map((p) => [p.id, p]));
  const hash = new Map(flat.map((p) => [p.id, hashText(p.text)]));

  // A paragraph is read again when its text changes, or when the parser has learned something since.
  const learned = patternsStamp(project.patterns);
  const stamp = (id: string) => `${PARSER_VERSION}${learned ? `.${learned}` : ''}:${hash.get(id)}`;
  const reparse = new Set(flat.filter((p) => project.parsed[p.id] !== stamp(p.id)).map((p) => p.id));

  const kept: ChangeRecord[] = [];
  for (const r of project.records) {
    const p = byId.get(r.paragraphId);
    if (!p) continue;
    const h = hash.get(p.id)!;
    if (r.source === 'parser') {
      if (!reparse.has(p.id) && r.textHash === h) kept.push(r);
      continue;
    }
    if (r.source === 'ai' && r.textHash !== h) {
      // A pending find is re-read with the new text; a decided one survives if its words did.
      if (r.status === 'proposed') continue;
      if (!r.quote || !p.text.includes(r.quote)) continue;
      kept.push({ ...r, textHash: h });
      continue;
    }
    kept.push(r);
  }

  const created: string[] = [];
  const protagonist = () => (project.protagonistId ? project.characters[project.protagonistId]?.name : undefined);
  for (const p of flat) {
    if (!reparse.has(p.id)) continue;
    project.parsed[p.id] = stamp(p.id);
    const parsed = parseParagraph(p.text, { protagonist: protagonist(), patterns: project.patterns });
    if (!parsed.length) continue;
    const res = resolveDrafts(project.characters, parsed.map((x) => x.change));
    created.push(...res.created);
    res.changes.forEach((change, i) => {
      kept.push({ id: newId(), paragraphId: p.id, textHash: hash.get(p.id)!, source: 'parser', status: 'applied', change, quote: parsed[i]!.quote });
      if (!project.protagonistId && change.kind !== 'merge' && change.kind !== 'relation' && MECHANIC.has(change.kind)) project.protagonistId = change.character;
    });
  }
  for (const id of Object.keys(project.parsed)) if (!byId.has(id)) delete project.parsed[id];
  for (const id of Object.keys(project.extracted)) if (!byId.has(id)) delete project.extracted[id];

  project.records = kept;
  const needsExtraction = flat.filter(
    (p) => p.text.trim().length > 0 && !isSystemBox(p.text) && project.extracted[p.id] !== hash.get(p.id),
  );
  return { project, needsExtraction, created };
}
