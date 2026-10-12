'use client';

import { useEffect, useState } from 'react';
import { usePainter } from '@/lib/illustrator';
import { useStudio, type PaintJob } from '@/lib/store';

const secs = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
};
const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(t).toLocaleDateString();
};
const what = (j: PaintJob) => `${j.icon ? 'Icon' : 'Painting'} · ${j.name}`;

/**
 * The header's painting chip, with a window on hover (or focus) that shows the
 * painting running now, the ones waiting behind it, and a log of recent ones.
 */
export function PaintQueue({ onSettings }: { onSettings(): void }) {
  const log = useStudio((s) => s.paintLog);
  const cancel = useStudio((s) => s.cancelPaintJob);
  const clear = useStudio((s) => s.clearPaintLog);
  const painter = usePainter();
  const running = log.filter((j) => j.status === 'running');
  const queued = log.filter((j) => j.status === 'queued');
  const finished = log.filter((j) => j.status !== 'running' && j.status !== 'queued').slice(-10).reverse();
  // Tick the elapsed time while something paints.
  const [, tick] = useState(0);
  // Open towards the side with room: near the left edge, the window would run off screen.
  const [alignLeft, setAlignLeft] = useState(false);
  useEffect(() => {
    if (!running.length) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [running.length]);

  const busy = running.length + queued.length;
  const chip = busy ? `Painting ${running.length ? 1 : 0}${queued.length ? ` · ${queued.length} queued` : ''}` : 'Painting';

  return (
    <div className={`pq${alignLeft ? ' left' : ''}`} onMouseEnter={(e) => setAlignLeft(e.currentTarget.getBoundingClientRect().right < 400)} onFocus={(e) => setAlignLeft(e.currentTarget.getBoundingClientRect().right < 400)}>
      <button className={`pill painter ${busy ? 'busy' : painter.ready ? 'on' : 'off'}`} onClick={onSettings} aria-haspopup="dialog">
        <span className="dot" />
        {chip} · {painter.label}{painter.local ? ' (local)' : ''}
      </button>
      <div className="pq-pop" role="dialog" aria-label="Painting queue">
        <div className="pq-head">
          <b>Painting queue</b>
          <span>{painter.ready ? `${painter.label} · ${painter.local ? 'on this computer, free' : `${painter.where}, ~$${painter.cost.toFixed(2)} each`}` : painter.hint}</span>
        </div>
        <p className="pq-note">One at a time, in the order asked for. Waiting ones can be cancelled.</p>
        {running.map((j) => (
          <div key={j.id} className="pq-row running">
            <span className="pq-dot" />
            <span className="pq-what">{what(j)}</span>
            <span className="pq-meta">{j.painter}{j.local ? ' (local)' : ''} · {secs(Date.now() - (j.startedAt ?? j.queuedAt))}</span>
          </div>
        ))}
        {queued.map((j, i) => (
          <div key={j.id} className="pq-row">
            <span className="pq-n">{i + 1}</span>
            <span className="pq-what">{what(j)}</span>
            <button className="mini" onClick={() => cancel(j.id)}>Cancel</button>
          </div>
        ))}
        {!busy && <p className="pq-empty">Nothing painting now.</p>}
        {finished.length > 0 && (
          <>
            <div className="pq-sub">
              <b>Recent</b>
              <button className="mini" onClick={clear}>Clear</button>
            </div>
            {finished.map((j) => (
              <div key={j.id} className={`pq-row ${j.status}`} title={j.error}>
                <span className="pq-mark">{j.status === 'done' ? '✓' : j.status === 'failed' ? '✕' : '–'}</span>
                <span className="pq-what">{what(j)}</span>
                <span className="pq-meta">
                  {j.status === 'done'
                    ? `${j.painter} · ${secs((j.endedAt ?? 0) - (j.startedAt ?? j.queuedAt))}${j.cost ? ` · $${j.cost.toFixed(2)}` : ''}`
                    : j.status === 'failed'
                      ? (j.error ?? 'Failed').slice(0, 70)
                      : 'Cancelled'}
                  {' · '}
                  {ago(j.endedAt ?? j.queuedAt)}
                </span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
