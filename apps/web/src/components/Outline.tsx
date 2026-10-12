'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { outlineOf } from '@/lib/doc';
import { useStudio } from '@/lib/store';

/**
 * The table of contents beside the editor, like a document outline: books and
 * chapters, the one being read highlighted as the page scrolls, and a click to
 * go there. `scroller` is the page that scrolls, holding the editor's content.
 */
export function Outline({ scroller }: { scroller: HTMLElement | null }) {
  const doc = useStudio((s) => s.doc);
  const setOpen = useStudio((s) => s.setOutlineOpen);
  const items = useMemo(() => outlineOf(doc), [doc]);
  const [current, setCurrent] = useState<number | null>(null);
  const nav = useRef<HTMLElement>(null);
  // The editor draws its content a moment after the page: look again until it is there.
  const [tries, setTries] = useState(0);

  // The chapter whose heading is the last one above the top of the page.
  useEffect(() => {
    const root = scroller?.querySelector<HTMLElement>('.tiptap');
    if (!root || !scroller) {
      const t = tries < 50 ? setTimeout(() => setTries((n) => n + 1), 200) : undefined;
      return () => clearTimeout(t);
    }
    let frame = 0;
    const update = () => {
      frame = 0;
      const top = scroller.getBoundingClientRect().top + 80;
      let at: number | null = items[0]?.index ?? null;
      for (const it of items) {
        const el = root.children[it.index] as HTMLElement | undefined;
        if (el && el.getBoundingClientRect().top <= top) at = it.index;
        else if (el) break;
      }
      setCurrent(at);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [scroller, items, tries]);

  const go = (index: number) => {
    const el = scroller?.querySelector('.tiptap')?.children[index] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    // Floating over a narrow editor, the drawer gets out of the way once a chapter is picked.
    if (nav.current && getComputedStyle(nav.current).position === 'absolute') setOpen(false);
  };

  return (
    <nav className="outline" aria-label="Contents" ref={nav}>
      <div className="ol-head">
        <b>Contents</b>
        <button className="ol-close" title="Hide contents" aria-label="Hide contents" onClick={() => setOpen(false)}>‹</button>
      </div>
      {items.length ? (
        <ol>
          {items.map((it) => (
            <li key={it.index} className={`${it.kind}${current === it.index ? ' on' : ''}`}>
              <button onClick={() => go(it.index)} aria-current={current === it.index ? 'location' : undefined} title={it.title}>
                <span className="ol-title">{it.title}</span>
                {it.kind === 'chapter' && it.words > 0 && <span className="ol-words">{it.words >= 1000 ? `${(it.words / 1000).toFixed(1)}k` : it.words}</span>}
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="ol-empty">Chapter headings appear here. Use Chapter heading in the toolbar to add one.</p>
      )}
    </nav>
  );
}
