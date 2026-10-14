'use client';

import { ART_STYLES, type WorldState } from '@questwright/engine';
import { useMemo, useState } from 'react';
import { ART_TYPES, artTargets, paintAll, usePainter, type ArtTarget, type ArtType } from '@/lib/illustrator';
import { useStudio } from '@/lib/store';

/**
 * For each kind of picture (portraits, paintings, ability and item icons):
 * how many are painted in the book's current style, in an older style, or not
 * at all, with buttons to paint the rest. `only` narrows it to some kinds.
 */
export function ArtStatus({ state, only, compact }: { state: WorldState; only?: ArtType[]; compact?: boolean }) {
  const project = useStudio((s) => s.project);
  const painting = useStudio((s) => s.painting);
  const painter = usePainter();
  const [withThin, setWithThin] = useState(false);
  const targets = useMemo(() => artTargets(project, state), [project, state]);
  const style = ART_STYLES[project.art?.paint ?? 'painted'].label;
  const types = ART_TYPES.filter((t) => !only || only.includes(t.type));
  const queued = (t: ArtTarget) => painting.includes(t.key);
  const cost = (n: number) => (painter.local || !n ? '' : ` · ~$${(n * painter.cost).toFixed(2)}`);
  const thinCount = targets.filter((t) => t.status === 'missing' && t.thin && types.some((x) => x.type === t.type)).length;

  const go = (list: ArtTarget[]) => paintAll(list.filter((t) => !queued(t)));

  return (
    <div className={`art-status${compact ? ' compact' : ''}`}>
      {!compact && (
        <p className="note">
          Paintings in <b>{style}</b> by <b>{painter.label}</b>{painter.local ? ' (on this computer, free)' : ` (${painter.where})`}. Icons have a look of their own.
        </p>
      )}
      <table>
        <thead>
          <tr><th>Kind</th><th title={`Painted in ${style}`}>Done</th><th title="Painted in an older style">Older style</th><th>Missing</th><th /></tr>
        </thead>
        <tbody>
          {types.map(({ type, label }) => {
            const all = targets.filter((t) => t.type === type);
            const done = all.filter((t) => t.status === 'current');
            const other = all.filter((t) => t.status === 'other');
            const missing = all.filter((t) => t.status === 'missing' && (withThin || !t.thin));
            const waiting = all.filter(queued).length;
            return (
              <tr key={type}>
                <td>{label}</td>
                <td><span className="as-bar"><i style={{ width: `${all.length ? (done.length / all.length) * 100 : 0}%` }} /></span>{done.length}/{all.length}</td>
                <td>{other.length || '–'}</td>
                <td>{all.filter((t) => t.status === 'missing').length || '–'}</td>
                <td className="as-acts">
                  {waiting > 0 && <span className="as-wait">{waiting} queued</span>}
                  {missing.length > 0 && (
                    <button className="mini" disabled={!painter.ready} title={painter.ready ? undefined : painter.hint} onClick={() => go(missing)}>
                      Paint {missing.length}{cost(missing.length)}
                    </button>
                  )}
                  {other.length > 0 && (
                    <button className="mini" disabled={!painter.ready} title={`Paint these again in ${style}`} onClick={() => go(other)}>
                      Restyle {other.length}{cost(other.length)}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="as-foot">
        {thinCount > 0 && (
          <label className="check">
            <input type="checkbox" checked={withThin} onChange={(e) => setWithThin(e.target.checked)} />
            Include {thinCount} the story has barely described
          </label>
        )}
        {(() => {
          const rest = targets.filter((t) => types.some((x) => x.type === t.type) && t.status !== 'current' && (withThin || !t.thin || t.status === 'other') && !queued(t));
          return rest.length > 1 ? (
            <button className="mini go" disabled={!painter.ready} onClick={() => go(rest)}>
              Paint everything ({rest.length}){cost(rest.length)}
            </button>
          ) : null;
        })()}
      </div>
    </div>
  );
}
