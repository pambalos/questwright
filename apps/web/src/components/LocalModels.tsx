'use client';

import { ART_STYLES, type ArtStyleKey } from '@questwright/engine';
import { useCallback, useEffect, useState } from 'react';
import { gb, LOCAL_MODELS, modelBytes, RUNTIME, type LocalStatus, type RuntimeBuild } from '@/lib/local-catalog';
import { fetchLocal } from '@/lib/illustrator';
import { useStudio } from '@/lib/store';

function Bar({ job }: { job: LocalStatus['jobs'][string] }) {
  const pct = job.total ? Math.min(100, (job.done / job.total) * 100) : 0;
  return (
    <div className="lm-progress">
      <div className="lm-bar"><i style={{ width: `${pct}%` }} /></div>
      <small>{job.error ? job.error : `${gb(job.done)} of ${job.total ? gb(job.total) : '…'}${job.file ? ` · ${job.file}` : ''}`}</small>
    </div>
  );
}

/** Install, remove and choose models that paint on this computer. */
export function LocalModels() {
  const accessCode = useStudio((s) => s.accessCode);
  const images = useStudio((s) => s.images);
  const setImages = useStudio((s) => s.setImageSettings);
  const [status, setStatus] = useState<LocalStatus | null>(null);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);

  const refresh = useCallback(async () => setStatus(await fetchLocal(accessCode)), [accessCode]);
  useEffect(() => void refresh(), [refresh]);
  // Follow downloads while any are running.
  const running = status ? Object.values(status.jobs).some((j) => !j.error) : false;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => void refresh(), 1000);
    return () => clearInterval(t);
  }, [running, refresh]);

  const act = async (action: 'install' | 'uninstall' | 'cancel', id: string, build?: RuntimeBuild['id']) => {
    setError('');
    setConfirm(null);
    const res = await fetch('/api/local', { method: 'POST', headers: { 'content-type': 'application/json', 'x-qw-access': accessCode }, body: JSON.stringify({ action, id, build }) });
    const data = (await res.json().catch(() => ({}))) as LocalStatus & { error?: string };
    if (!res.ok) setError(data.error ?? 'That did not work.');
    await refresh();
    if (action === 'uninstall' && images.localModel === id) setImages({ localModel: undefined });
  };

  if (!status) return null;
  if (!status.available)
    return (
      <section>
        <h3>Local models</h3>
        <p className="note">Local models run on your own computer, in the Questwright desktop app. They are not available on a shared server.</p>
      </section>
    );

  const rt = status.runtime;
  const rtJob = status.jobs.runtime;
  const vram = status.gpu?.vramGB ?? 0;

  return (
    <section>
      <h3>Local models</h3>
      <p className="note">
        Paint for free on your own graphics card. Models are large downloads from public sources; nothing is sent anywhere when you paint.{' '}
        {status.gpu ? `Found ${status.gpu.name} (${status.gpu.vramGB} GB).` : 'No NVIDIA graphics card found: models will be slow.'}{' '}
        {status.freeGB !== null && `${status.freeGB} GB free on disk.`}
      </p>
      <div className="lm-runtime">
        <div>
          <b>{RUNTIME.name}</b>
          <small>The engine that runs the models{rt.installed ? ` · ${rt.build?.toUpperCase()} build${rt.version ? ` ${rt.version}` : ''}` : ''}. Needed once.</small>
        </div>
        {rtJob && !rtJob.error ? (
          <>
            <Bar job={rtJob} />
            <button className="mini" onClick={() => void act('cancel', 'runtime')}>Cancel</button>
          </>
        ) : rt.installed ? (
          confirm === 'runtime' ? (
            <span className="lm-confirm">Remove it? <button className="mini" onClick={() => void act('uninstall', 'runtime')}>Remove</button><button className="mini" onClick={() => setConfirm(null)}>Keep</button></span>
          ) : (
            <><span className="key-state on">Installed</span><button className="mini" onClick={() => setConfirm('runtime')}>Uninstall</button></>
          )
        ) : (
          <>
            {rtJob?.error && <small className="err">{rtJob.error}</small>}
            {RUNTIME.builds
              .filter((b) => b.id !== 'cpu' || !status.gpu)
              .sort((a, b) => Number(b.id === (status.gpu ? 'cuda' : 'vulkan')) - Number(a.id === (status.gpu ? 'cuda' : 'vulkan')))
              .map((b, i) => (
                <button key={b.id} className={`mini${i === 0 ? ' go' : ''}`} title={b.label} onClick={() => void act('install', 'runtime', b.id)}>
                  {i === 0 ? 'Install' : 'Or'} {b.label} · {gb(b.bytes + (b.extras ?? []).reduce((n, x) => n + x.bytes, 0))}
                </button>
              ))}
          </>
        )}
      </div>
      <div className="lm-cards">
        {LOCAL_MODELS.map((m) => {
          const st = status.models[m.id];
          const job = status.jobs[m.id];
          const installed = st?.installed;
          const tooBig = vram > 0 && m.vram > vram;
          const using = images.provider === 'local' && images.localModel === m.id;
          return (
            <article key={m.id} className={`lm-card${installed ? ' installed' : ''}${using ? ' sel' : ''}`}>
              <header>
                <b>{m.name}</b>
                <span className="sub">{m.family}</span>
              </header>
              <small>{m.blurb}</small>
              <div className="lm-tags">
                {m.goodAt.map((k) => <span key={k}>{ART_STYLES[k as ArtStyleKey]?.label ?? k}</span>)}
              </div>
              <div className="lm-facts">
                <span>{gb(modelBytes(m))}</span>
                <span className={tooBig ? 'warn' : ''}>{m.vram} GB graphics memory{tooBig ? ' (more than you have: slow)' : ''}</span>
                <span title={m.commercial ? 'You may use what it paints commercially.' : 'Personal and non-commercial use only.'}>{m.license}{m.commercial ? '' : ' · non-commercial'}</span>
              </div>
              {job && !job.error ? (
                <div className="lm-acts"><Bar job={job} /><button className="mini" onClick={() => void act('cancel', m.id)}>Cancel</button></div>
              ) : installed ? (
                <div className="lm-acts">
                  {using ? <span className="key-state on">Painting with this</span> : <button className="mini go" disabled={!rt.installed} onClick={() => setImages({ provider: 'local', localModel: m.id })}>Use</button>}
                  {confirm === m.id ? (
                    <span className="lm-confirm">Delete {gb(st?.bytesOnDisk ?? 0)}? <button className="mini" onClick={() => void act('uninstall', m.id)}>Delete</button><button className="mini" onClick={() => setConfirm(null)}>Keep</button></span>
                  ) : (
                    <button className="mini" onClick={() => setConfirm(m.id)}>Uninstall</button>
                  )}
                </div>
              ) : (
                <div className="lm-acts">
                  {job?.error && <small className="err">{job.error}</small>}
                  {!!st?.bytesOnDisk && <small className="sub">{gb(st.bytesOnDisk)} downloaded so far</small>}
                  <button className="mini go" disabled={status.freeGB !== null && status.freeGB * 1024 ** 3 < modelBytes(m) - (st?.bytesOnDisk ?? 0)} onClick={() => void act('install', m.id)}>
                    {st?.bytesOnDisk ? 'Resume install' : `Install · ${gb(modelBytes(m))}`}
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
      {error && <p className="err">{error}</p>}
      <p className="note">Files are kept in {status.dir}.</p>
    </section>
  );
}
