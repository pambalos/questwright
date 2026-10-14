'use client';

import { useMemo } from 'react';
import { loreChapters, lorePassRequests, runLorePass } from '@/lib/lorepass';
import { useStudio } from '@/lib/store';

/** Start, follow and stop a lore pass: each chapter read for the compendium. */
export function LorePassControl({ compact }: { compact?: boolean }) {
  const pass = useStudio((s) => s.lorePass);
  const setPass = useStudio((s) => s.setLorePass);
  const aiStatus = useStudio((s) => s.aiStatus);
  const aiBackend = useStudio((s) => s.aiBackend);
  const project = useStudio((s) => s.project);
  const manuscript = useStudio((s) => s.manuscript);
  // Recount when the book or what has been read changes.
  const { unread, total, requests, all } = useMemo(() => {
    const ch = loreChapters();
    return { unread: ch.filter((c) => !c.read).length, total: ch.length, requests: lorePassRequests(false), all: lorePassRequests(true) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.loreRead, manuscript]);
  const running = pass && !pass.cancelled && !pass.error && pass.done < pass.total;
  const where = aiBackend?.kind === 'claude-cli' ? 'on your Claude subscription' : 'billed to your Anthropic key';

  if (aiStatus !== 'on') return compact ? null : <p className="note">The lore pass needs AI reading, which is off.</p>;

  return (
    <div className={`lore-pass${compact ? ' compact' : ''}`}>
      {!compact && (
        <p className="note">
          The lore pass reads each chapter just for the compendium (people, creatures, places, factions, items, spells, what is said about them and how they are linked), more carefully than
          paragraph reading does. {unread ? `${unread} of ${total} chapters not read yet` : `All ${total} chapters read`}; about {requests || all} {(requests || all) === 1 ? 'request' : 'requests'} {where}.
        </p>
      )}
      {running ? (
        <div className="lp-run">
          <div className="lm-bar"><i style={{ width: `${(pass.done / pass.total) * 100}%` }} /></div>
          <small>
            Chapter {pass.done + 1} of {pass.total}{pass.chapter ? `: ${pass.chapter}` : ''} · {pass.added} new {pass.added === 1 ? 'memory' : 'memories'}
          </small>
          <button className="mini" onClick={() => setPass({ ...pass, cancelled: true })}>Stop</button>
        </div>
      ) : (
        <div className="row-btns">
          {unread > 0 && <button onClick={() => void runLorePass(false)}>{compact ? `Gather lore (${unread} ${unread === 1 ? 'chapter' : 'chapters'})` : `Read ${unread} ${unread === 1 ? 'chapter' : 'chapters'} for lore`}</button>}
          {!compact && total > 0 && <button onClick={() => void runLorePass(true)}>Read all {total} again ({all} requests)</button>}
        </div>
      )}
      {pass?.error && <p className="err">Lore pass stopped: {pass.error}</p>}
    </div>
  );
}
