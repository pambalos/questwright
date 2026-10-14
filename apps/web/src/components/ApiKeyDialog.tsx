'use client';

import { useState } from 'react';
import { desktop } from '@/lib/desktop';
import { PROVIDERS, type ImageProvider } from '@/lib/image-providers';

/** Desktop only: Electron has no window.prompt, so the key is entered here. With `service`, the key is for an image service. */
export function ApiKeyDialog({ hasKey, onClose, service }: { hasKey: boolean; onClose: () => void; service?: ImageProvider }) {
  const info = service ? PROVIDERS[service] : undefined;
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async (value: string | null) => {
    setBusy(true);
    setError('');
    try {
      if (service) await desktop()!.setImageKey!(service, value);
      else await desktop()!.setApiKey(value);
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Try again.');
      setBusy(false);
    }
  };

  return (
    <div className="modal" role="presentation" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form
        className="dlg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="key-title"
        onSubmit={(e) => {
          e.preventDefault();
          if (key.trim()) void save(key.trim());
        }}
      >
        <h2 id="key-title">{info ? `${info.company} API key` : hasKey ? 'Anthropic API key' : 'Add your Anthropic API key'}</h2>
        {info ? (
          <>
            <p>
              {info.label} paints the illustrations in the codex. The key is stored encrypted on this computer and only sent to {info.company}. Paintings are billed to
              your {info.company} account, about ${info.cost.final.toFixed(2)} each at full quality.
            </p>
            <p>
              Create a key at{' '}
              <a href={info.keyUrl} target="_blank" rel="noreferrer">
                {new URL(info.keyUrl).host}
              </a>
              {service === 'gemini' ? ', on a project with billing turned on (image models have no free tier).' : '.'}
            </p>
          </>
        ) : (
          <>
            <p>
              With a key, Claude reads each paragraph you write or paste and tracks characters, items and changes that are not in system boxes. The key is stored
              encrypted on this computer and only sent to Anthropic.
            </p>
            <p>
              {hasKey
                ? 'Remove the key to read with your Claude subscription instead, through Claude Code on this computer.'
                : 'Without a key, Questwright reads with your Claude subscription through Claude Code on this computer, when Claude Code is installed and signed in. That shares your plan’s usage limits.'}
            </p>
          </>
        )}
        <input
          className="key-input"
          type="password"
          autoFocus
          autoComplete="off"
          spellCheck={false}
          placeholder={info?.keyHint ?? 'sk-ant-…'}
          aria-label={`${info?.company ?? 'Anthropic'} API key`}
          value={key}
          disabled={busy}
          onChange={(e) => setKey(e.target.value)}
        />
        {error && <p className="err">{error}</p>}
        <div className="acts">
          {hasKey && <button type="button" disabled={busy} onClick={() => void save(null)}>Remove key</button>}
          <button type="button" disabled={busy} onClick={onClose}>Cancel</button>
          <button type="submit" className="go" disabled={busy || !key.trim()}>{busy ? 'Starting…' : 'Save key'}</button>
        </div>
      </form>
    </div>
  );
}
