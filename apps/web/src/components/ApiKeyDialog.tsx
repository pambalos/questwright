'use client';

import { useState } from 'react';
import { desktop } from '@/lib/desktop';

/** Desktop only: Electron has no window.prompt, so the key is entered here. */
export function ApiKeyDialog({ hasKey, onClose }: { hasKey: boolean; onClose: () => void }) {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async (value: string | null) => {
    setBusy(true);
    setError('');
    try {
      await desktop()!.setApiKey(value);
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
        <h2 id="key-title">{hasKey ? 'Anthropic API key' : 'Add your Anthropic API key'}</h2>
        <p>
          With a key, Claude reads each paragraph you write or paste and tracks characters, items and changes that are not in system boxes. The key is stored
          encrypted on this computer and only sent to Anthropic.
        </p>
        <input
          className="key-input"
          type="password"
          autoFocus
          autoComplete="off"
          spellCheck={false}
          placeholder="sk-ant-…"
          aria-label="Anthropic API key"
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
