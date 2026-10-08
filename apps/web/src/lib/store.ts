'use client';

import type { JSONContent } from '@tiptap/core';
import {
  applyExtraction,
  applyMerge,
  applySkim,
  flatten,
  joinManuscripts,
  splitBook,
  describeChange,
  emptyProject,
  fold,
  reconcile,
  label,
  SAMPLE,
  SAMPLE_TITLE,
  type ArtStyle,
  type Extraction,
  type Look,
  type Manuscript,
  type Project,
  type Skim,
} from '@questwright/engine';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { BLANK_DOC, docToManuscript, manuscriptToDoc } from './doc';
import { idbPersist } from './idb-storage';
import { newId } from './ids';
import { ACHIEVEMENTS } from './achievements';
import { snapshot, unlockToasts, type Snapshot, type Toast } from './unlocks';

export type AiStatus = 'checking' | 'on' | 'off' | 'locked';

interface Persisted {
  project: Project;
  doc: JSONContent;
  tab: string;
  collapsed: string[];
  aiEnabled: boolean;
  accessCode: string;
  /** Author achievements earned in this browser. */
  achievements: string[];
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
  /** Panels that just unlocked, for a brief highlight. */
  flash: string[];
  /** The saved book has been loaded from this browser. */
  hydrated: boolean;
  skimming: string | null;

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
  setLook(characterId: string, look: Look): void;
  toggleAppearanceLock(characterId: string): void;
  drawCharacter(characterId: string): void;
  setArtStyle(style: ArtStyle): void;
  /** Author correction: sets a currency or item count from the paragraph at `pid` onwards. */
  setValue(pid: string, characterId: string, kind: 'currency' | 'item', name: string, value: number): void;
  merge(from: string, into: string): void;
  setAiStatus(status: AiStatus): void;
  setAiEnabled(on: boolean): void;
  setAccessCode(code: string): void;
  startExtraction(pid: string): void;
  finishExtraction(pid: string, sentText: string, result: Extraction): void;
  failExtraction(pid: string, sentText: string, message: string): void;
  loadSample(): void;
  importSeries(books: { title: string; text: string }[], keep: number, skim: boolean): SeriesSummary;
  finishSkim(chapterId: string, result: Skim): void;
  failSkim(chapterId: string, message: string): void;
  startSkim(chapterId: string): void;
  newProject(): void;
  importProject(project: Project, doc: JSONContent): void;
  toast(t: Omit<Toast, 'id'>): void;
  dropToast(id: number): void;
}

export interface SeriesSummary {
  books: number;
  tracked: number;
  paragraphs: number;
  characters: number;
  tabs: number;
  systemChanges: number;
  toRead: number;
  toSkim: number;
  unconfirmed: number;
  windowLabel: string;
}

let toastSeq = 0;

/**
 * Combines archived books with the editor's text, brings the change log up to
 * date, and lists what the AI still has to read: only the read window, newest
 * book first.
 */
function derive(project: Project, doc: JSONContent) {
  const manuscript = project.archive ? joinManuscripts(project.archive, docToManuscript(doc)) : docToManuscript(doc);
  const r = reconcile(project, manuscript, newId);
  const flat = flatten(manuscript);
  const start = r.project.window ? flat.find((p) => p.id === r.project.window!.startParagraphId)?.index ?? 0 : 0;
  const queue = r.needsExtraction
    .filter((p) => p.index >= start)
    .sort((a, b) => (b.bookIndex ?? 0) - (a.bookIndex ?? 0) || a.index - b.index)
    .map((p) => p.id);
  return { project: r.project, manuscript, queue, created: r.created };
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
        const earned = ACHIEVEMENTS.filter((a) => !s.achievements.includes(a.id) && a.test({ project: patch.project, manuscript, state: latest }));
        for (const a of earned) toasts.push({ kind: 'ach', head: 'Achievement', body: a.name });
        const flash = snap.panels.filter((p) => !prev.panels.includes(p));
        set({
          ...patch,
          seen: snap,
          achievements: earned.length ? [...s.achievements, ...earned.map((a) => a.id)] : s.achievements,
          flash: flash.length ? [...s.flash, ...flash] : s.flash,
          toasts: [...s.toasts, ...toasts.map((t) => ({ ...t, id: ++toastSeq }))].slice(-6),
        });
        if (flash.length) setTimeout(() => set({ flash: get().flash.filter((f) => !flash.includes(f)) }), 2600);
      };

      return {
        ...sampleState(),
        tab: 'roster',
        collapsed: [],
        aiEnabled: true,
        accessCode: '',
        achievements: [],
        flash: [],
        hydrated: false,
        skimming: null,
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
        setLook(characterId, look) {
          const project = structuredClone(get().project);
          const c = project.characters[characterId];
          if (!c) return;
          c.look = look;
          set({ project });
        },
        toggleAppearanceLock(characterId) {
          const project = structuredClone(get().project);
          const c = project.characters[characterId];
          if (!c) return;
          c.lockedAppearance = !c.lockedAppearance;
          commit({ project });
        },
        drawCharacter(characterId) {
          const project = structuredClone(get().project);
          const c = project.characters[characterId];
          if (!c) return;
          c.drawn = true;
          set({ project });
        },
        setArtStyle(style) {
          set({ project: { ...get().project, art: { style } } });
        },
        setValue(pid, characterId, kind, name, value) {
          const project = structuredClone(get().project);
          const change =
            kind === 'currency'
              ? ({ kind: 'currency', character: characterId, currency: name, delta: 0, set: value } as const)
              : ({ kind: 'item', character: characterId, item: name, delta: 0, set: value } as const);
          project.records.push({ id: newId(), paragraphId: pid, textHash: '', source: 'author', status: 'applied', change });
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
        importSeries(books, keep, skim) {
          const batch = newId();
          const all = books.map((b, i) => splitBook(b.text, b.title, `${batch}-${i}-`));
          const cut = Math.max(0, books.length - keep);
          const archive = { chapters: all.slice(0, cut).flat() };
          const window = { chapters: all.slice(cut).flat() };
          const first = window.chapters[0]?.paragraphs[0]?.id;
          const base = emptyProject(newId(), books.length > 1 ? `${books[0]!.title} – ${books[books.length - 1]!.title}` : books[0]?.title ?? 'Imported book');
          if (cut > 0) {
            base.archive = archive;
            if (first) base.window = { startParagraphId: first };
            if (skim) base.skimPending = archive.chapters.filter((c) => c.paragraphs.length).map((c) => c.id);
          }
          const doc = manuscriptToDoc(window);
          const d = derive(base, doc);
          const latest = fold(d.project, d.manuscript);
          const flat = flatten(d.manuscript);
          const startAt = first ? flat.find((p) => p.id === first) : undefined;
          set({
            project: d.project, doc, manuscript: d.manuscript, queue: d.queue, tab: 'roster', scrub: null, cursorPid: null,
            seen: snapshot(latest), failed: {}, inFlight: [], docVersion: get().docVersion + 1,
          });
          return {
            books: books.length,
            tracked: books.length - cut,
            paragraphs: flat.length,
            characters: Object.keys(latest.sheets).length,
            tabs: Object.values(latest.sheets).filter((s) => s.promoted).length,
            systemChanges: d.project.records.filter((r) => r.source === 'parser').length,
            toRead: d.queue.length,
            toSkim: d.project.skimPending?.length ?? 0,
            unconfirmed: Object.values(latest.sheets).reduce((n, s) => n + s.unconfirmed.length, 0),
            windowLabel: startAt ? label(startAt) : '',
          };
        },
        startSkim(chapterId) {
          set({ skimming: chapterId });
        },
        finishSkim(chapterId, result) {
          const s = get();
          const chapter = s.project.archive?.chapters.find((c) => c.id === chapterId);
          const pending = (s.project.skimPending ?? []).filter((id) => id !== chapterId);
          if (!chapter?.paragraphs.length) return set({ skimming: null, project: { ...s.project, skimPending: pending } });
          const r = applySkim(s.project, chapter, result, newId);
          commit({ project: { ...r.project, skimPending: pending }, skimming: null });
        },
        failSkim(chapterId, message) {
          const s = get();
          set({ skimming: null, project: { ...s.project, skimPending: (s.project.skimPending ?? []).filter((id) => id !== chapterId) } });
          get().toast({ kind: 'error', head: 'Could not skim a chapter', body: message });
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
      storage: idbPersist<Persisted>(),
      onRehydrateStorage: () => () => {
        useStudio.setState((s) => ({ hydrated: true, docVersion: s.docVersion + 1 }));
      },
      partialize: (s): Persisted => ({ project: s.project, doc: s.doc, tab: s.tab, collapsed: s.collapsed, aiEnabled: s.aiEnabled, accessCode: s.accessCode, achievements: s.achievements }),
      merge: (persisted, current) => {
        const p = persisted as Partial<Persisted> | undefined;
        if (!p?.project || !p.doc) return current;
        const d = derive(p.project, p.doc);
        return { ...current, ...p, project: d.project, manuscript: d.manuscript, queue: d.queue };
      },
    },
  ),
);
