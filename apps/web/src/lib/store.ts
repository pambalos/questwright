'use client';

import type { JSONContent } from '@tiptap/core';
import {
  applyExtraction,
  applyMerge,
  describeChange,
  emptyProject,
  fold,
  reconcile,
  SAMPLE,
  SAMPLE_TITLE,
  type Extraction,
  type Manuscript,
  type Project,
} from '@questwright/engine';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { BLANK_DOC, docToManuscript, manuscriptToDoc } from './doc';
import { newId } from './ids';
import { snapshot, unlockToasts, type Snapshot, type Toast } from './unlocks';

export type AiStatus = 'checking' | 'on' | 'off' | 'locked';

interface Persisted {
  project: Project;
  doc: JSONContent;
  tab: string;
  collapsed: string[];
  aiEnabled: boolean;
  accessCode: string;
}

export interface StudioState extends Persisted {
  manuscript: Manuscript;
  /** Prose paragraphs waiting for AI extraction. */
  queue: string[];
  cursorPid: string | null;
  /** Timeline position chosen on the slider; null means "follow the cursor". */
  scrub: number | null;
  jumpTo: string | null;
  lastEditAt: number;
  aiStatus: AiStatus;
  inFlight: string[];
  failed: Record<string, string>;
  toasts: Toast[];
  seen: Snapshot | null;
  /** Bumped when the document is replaced wholesale, so the editor reloads it. */
  docVersion: number;

  setDoc(doc: JSONContent): void;
  setCursor(pid: string | null): void;
  setScrub(index: number | null): void;
  jump(pid: string): void;
  setTab(tab: string): void;
  toggleCollapsed(key: string): void;
  setTitle(title: string): void;
  claim(recordId: string): void;
  dismiss(recordId: string): void;
  claimAll(): void;
  togglePin(characterId: string): void;
  merge(from: string, into: string): void;
  setAiStatus(status: AiStatus): void;
  setAiEnabled(on: boolean): void;
  setAccessCode(code: string): void;
  startExtraction(pid: string): void;
  finishExtraction(pid: string, sentText: string, result: Extraction): void;
  failExtraction(pid: string, sentText: string, message: string): void;
  loadSample(): void;
  newProject(): void;
  importProject(project: Project, doc: JSONContent): void;
  toast(t: Omit<Toast, 'id'>): void;
  dropToast(id: number): void;
}

let toastSeq = 0;

function derive(project: Project, doc: JSONContent) {
  const manuscript = docToManuscript(doc);
  const r = reconcile(project, manuscript, newId);
  return { project: r.project, manuscript, queue: r.needsExtraction.map((p) => p.id), created: r.created };
}

function sampleState(): Pick<StudioState, 'project' | 'doc' | 'manuscript' | 'queue'> {
  const doc = manuscriptToDoc(SAMPLE);
  const { project, manuscript, queue } = derive(emptyProject(newId(), SAMPLE_TITLE), doc);
  return { project, doc, manuscript, queue };
}

export const useStudio = create<StudioState>()(
  persist(
    (set, get) => {
      /** Saves a new project state and turns whatever it unlocked into toasts. */
      const commit = (patch: Partial<StudioState> & { project: Project; manuscript?: Manuscript }, systemToasts: Omit<Toast, 'id'>[] = []) => {
        const s = get();
        const manuscript = patch.manuscript ?? s.manuscript;
        const latest = fold(patch.project, manuscript);
        const snap = snapshot(latest);
        const prev = s.seen ?? snapshot(fold(s.project, s.manuscript));
        const toasts = [...systemToasts, ...unlockToasts(prev, snap, patch.project, latest)];
        set({ ...patch, seen: snap, toasts: [...s.toasts, ...toasts.map((t) => ({ ...t, id: ++toastSeq }))].slice(-6) });
      };

      return {
        ...sampleState(),
        tab: 'roster',
        collapsed: [],
        aiEnabled: true,
        accessCode: '',
        cursorPid: null,
        scrub: null,
        jumpTo: null,
        lastEditAt: 0,
        aiStatus: 'checking',
        inFlight: [],
        failed: {},
        toasts: [],
        seen: null,
        docVersion: 0,

        setDoc(doc) {
          const s = get();
          const before = new Set(s.project.records.map((r) => r.id));
          const d = derive(s.project, doc);
          const name = (id: string) => d.project.characters[id]?.name ?? id;
          const sys = d.project.records
            .filter((r) => r.source === 'parser' && !before.has(r.id) && r.change.kind !== 'mention')
            .filter((r) => !s.project.records.some((o) => o.source === 'parser' && o.paragraphId === r.paragraphId && JSON.stringify(o.change) === JSON.stringify(r.change)))
            .map((r) => ({ kind: 'sys' as const, head: 'System', body: `${r.change.kind === 'merge' ? '' : `${name(r.change.character)} · `}${describeChange(r.change, name)}` }));
          commit({ doc, project: d.project, manuscript: d.manuscript, queue: d.queue, lastEditAt: Date.now() }, sys.slice(0, 4));
        },
        setCursor(pid) {
          set({ cursorPid: pid, scrub: null });
        },
        setScrub(index) {
          set({ scrub: index });
        },
        jump(pid) {
          set({ jumpTo: pid });
        },
        setTab(tab) {
          set({ tab });
        },
        toggleCollapsed(key) {
          const c = get().collapsed;
          set({ collapsed: c.includes(key) ? c.filter((k) => k !== key) : [...c, key] });
        },
        setTitle(title) {
          set({ project: { ...get().project, title } });
        },
        claim(recordId) {
          const project = structuredClone(get().project);
          const r = project.records.find((x) => x.id === recordId);
          if (!r) return;
          r.status = 'applied';
          if (r.change.kind === 'merge') applyMerge(project.characters, r.change.from, r.change.into);
          commit({ project });
        },
        dismiss(recordId) {
          const project = structuredClone(get().project);
          const r = project.records.find((x) => x.id === recordId);
          if (r) r.status = 'dismissed';
          commit({ project });
        },
        claimAll() {
          const project = structuredClone(get().project);
          for (const r of project.records) {
            if (r.status !== 'proposed') continue;
            r.status = 'applied';
            if (r.change.kind === 'merge') applyMerge(project.characters, r.change.from, r.change.into);
          }
          commit({ project });
        },
        togglePin(characterId) {
          const project = structuredClone(get().project);
          const c = project.characters[characterId];
          if (!c) return;
          c.pinned = !c.pinned;
          commit({ project });
        },
        merge(from, into) {
          const project = structuredClone(get().project);
          applyMerge(project.characters, from, into);
          const tab = get().tab === from ? into : get().tab;
          commit({ project, tab });
        },
        setAiStatus(aiStatus) {
          set({ aiStatus });
        },
        setAiEnabled(aiEnabled) {
          set({ aiEnabled });
        },
        setAccessCode(accessCode) {
          set({ accessCode, aiStatus: 'checking' });
        },
        startExtraction(pid) {
          set({ inFlight: [...get().inFlight, pid] });
        },
        finishExtraction(pid, sentText, result) {
          const s = get();
          const inFlight = s.inFlight.filter((x) => x !== pid);
          const current = s.manuscript.chapters.flatMap((c) => c.paragraphs).find((p) => p.id === pid);
          if (!current || current.text !== sentText) return set({ inFlight });
          const r = applyExtraction(s.project, pid, sentText, result, newId);
          const queue = s.queue.filter((x) => x !== pid);
          const toasts = r.proposals ? [{ kind: 'unlock' as const, head: 'Loot found', body: `${r.proposals} new ${r.proposals === 1 ? 'find' : 'finds'} to claim` }] : [];
          commit({ project: r.project, queue, inFlight }, toasts);
        },
        failExtraction(pid, sentText, message) {
          const s = get();
          const failed = { ...s.failed, [pid]: sentText };
          set({ inFlight: s.inFlight.filter((x) => x !== pid), failed });
          get().toast({ kind: 'error', head: 'Could not read a paragraph', body: message });
        },
        loadSample() {
          set({ ...sampleState(), tab: 'roster', scrub: null, cursorPid: null, seen: null, failed: {}, inFlight: [], docVersion: get().docVersion + 1 });
        },
        newProject() {
          const d = derive(emptyProject(newId(), 'Untitled book'), BLANK_DOC);
          set({ project: d.project, doc: BLANK_DOC, manuscript: d.manuscript, queue: d.queue, tab: 'roster', scrub: null, cursorPid: null, seen: null, failed: {}, inFlight: [], docVersion: get().docVersion + 1 });
        },
        importProject(project, doc) {
          const d = derive(project, doc);
          set({ project: d.project, doc, manuscript: d.manuscript, queue: d.queue, tab: 'roster', scrub: null, cursorPid: null, seen: null, failed: {}, inFlight: [], docVersion: get().docVersion + 1 });
        },
        toast(t) {
          set({ toasts: [...get().toasts, { ...t, id: ++toastSeq }].slice(-6) });
        },
        dropToast(id) {
          set({ toasts: get().toasts.filter((t) => t.id !== id) });
        },
      };
    },
    {
      name: 'questwright:studio',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s): Persisted => ({ project: s.project, doc: s.doc, tab: s.tab, collapsed: s.collapsed, aiEnabled: s.aiEnabled, accessCode: s.accessCode }),
      merge: (persisted, current) => {
        const p = persisted as Partial<Persisted> | undefined;
        if (!p?.project || !p.doc) return current;
        const d = derive(p.project, p.doc);
        return { ...current, ...p, project: d.project, manuscript: d.manuscript, queue: d.queue };
      },
    },
  ),
);
