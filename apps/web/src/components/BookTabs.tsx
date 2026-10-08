'use client';

import { useEffect, useState } from 'react';
import { flushSaves, onSaveStatus, type SaveStatus } from '@/lib/idb-storage';
import { useStudio } from '@/lib/store';

const SAVE_TEXT: Record<SaveStatus, string> = { saved: 'All changes saved', saving: 'Saving…', error: 'Not saved: export to keep a copy' };

/** One tab per book in the library; every book saves itself as you write. */
export function BookTabs() {
  const books = useStudio((s) => s.books);
  const activeId = useStudio((s) => s.project.id);
  const activeTitle = useStudio((s) => s.project.title);
  const switchBook = useStudio((s) => s.switchBook);
  const deleteBook = useStudio((s) => s.deleteBook);
  const newProject = useStudio((s) => s.newProject);
  const [save, setSave] = useState<SaveStatus>('saved');

  useEffect(() => onSaveStatus(setSave), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void flushSaves();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <nav className="book-tabs" aria-label="Books">
      <div className="book-tabs-list" role="tablist">
        {books.map((b) => {
          const active = b.id === activeId;
          const title = (active ? activeTitle : b.title) || 'Untitled book';
          return (
            <div key={b.id} className={`book-tab${active ? ' active' : ''}`}>
              <button role="tab" aria-selected={active} title={title} onClick={() => void switchBook(b.id)}>
                {title}
              </button>
              <button
                className="close"
                aria-label={`Delete ${title}`}
                title="Delete this book"
                onClick={() => {
                  if (window.confirm(`Delete “${title}” for good? Export it first if you want to keep a copy.`)) void deleteBook(b.id);
                }}
              >
                ×
              </button>
            </div>
          );
        })}
        <button className="book-tab-new" aria-label="New book" title="New book" onClick={newProject}>
          +
        </button>
      </div>
      <span className={`save-state ${save}`} aria-live="polite" title="Books are saved on this computer as you write. Ctrl+S saves right away.">
        {SAVE_TEXT[save]}
      </span>
    </nav>
  );
}
