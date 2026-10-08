'use client';

import { useRef, type RefObject } from 'react';
import { useStudio } from '@/lib/store';

const MIN = 320;
const DEFAULT = 420;
/** The editor keeps at least this much room. */
const EDITOR_MIN = 380;

function clamp(px: number): number {
  const max = Math.max(MIN, Math.min(1100, (typeof window === 'undefined' ? 1600 : window.innerWidth) - EDITOR_MIN));
  return Math.max(MIN, Math.min(max, px));
}

/**
 * The handle between the editor and the character panel. While dragging it sets the
 * width on the layout directly, so the panel is not re-rendered on every move; the
 * width is saved when the drag ends. Arrow keys move it too, and a double-click resets it.
 */
export function PanelDivider({ layout }: { layout: RefObject<HTMLDivElement | null> }) {
  const width = useStudio((s) => s.panelWidth);
  const setWidth = useStudio((s) => s.setPanelWidth);
  const drag = useRef<{ x: number; w: number; now: number } | null>(null);
  const show = (px: number) => layout.current?.style.setProperty('--panel-w', `${px}px`);

  return (
    <div
      className="divider"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the character panel"
      aria-valuemin={MIN}
      aria-valuemax={clamp(Infinity)}
      aria-valuenow={width}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, w: width, now: width };
        document.body.classList.add('resizing');
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        // Dragging left widens the panel, which sits on the right.
        d.now = clamp(d.w - (e.clientX - d.x));
        show(d.now);
      }}
      onPointerUp={() => {
        const d = drag.current;
        drag.current = null;
        document.body.classList.remove('resizing');
        if (d) setWidth(d.now);
      }}
      onPointerCancel={() => {
        drag.current = null;
        document.body.classList.remove('resizing');
        show(width);
      }}
      onDoubleClick={() => setWidth(DEFAULT)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 64 : 16;
        const next =
          e.key === 'ArrowLeft' ? width + step : e.key === 'ArrowRight' ? width - step : e.key === 'Home' ? MIN : e.key === 'End' ? clamp(Infinity) : null;
        if (next === null) return;
        e.preventDefault();
        setWidth(clamp(next));
      }}
    >
      <span className="grip" aria-hidden="true" />
    </div>
  );
}
