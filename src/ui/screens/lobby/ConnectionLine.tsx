/** The connection status line, with the server address override tucked under "Server…". */
import { useState, type ReactElement } from 'react';
import type { OnlineSession, SessionState } from '../../../net';
import { Button } from '../../components/Button';
import { serverLabel, statusText } from './lobbyModel';

export function ConnectionLine({ session, state }: { session: OnlineSession; state: SessionState }): ReactElement {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(state.customServer ? serverLabel(state.serverUrl) : '');
  const [error, setError] = useState<string | null>(null);
  const tone = state.status === 'open' ? 'ok' : state.status === 'reconnecting' || state.fatal ? 'warn' : 'idle';
  const apply = (value: string): void => {
    if (!session.setServer(value)) {
      setError('Use host:port, for example 192.168.1.20:8787.');
      return;
    }
    setError(null);
    setEditing(false);
    if (value.trim() === '') setText('');
  };
  return (
    <div className="ww-netline">
      <p className="ww-netline__status" role="status" aria-live="polite">
        <span className={`ww-netline__dot ww-netline__dot--${tone}`} aria-hidden="true" />
        <span className="ww-netline__text">{state.fatal ? 'Disconnected' : statusText(state.status, state.rtt)}</span>
        <span className="ww-netline__server">
          {state.customServer ? 'Server' : 'This server'}: {serverLabel(state.serverUrl)}
        </span>
        <button type="button" className="ww-link-btn ww-netline__edit" aria-expanded={editing} onClick={() => setEditing((e) => !e)}>
          {editing ? 'Close' : 'Change'}
        </button>
      </p>
      {editing && (
        <form
          className="ww-netline__form"
          onSubmit={(event) => {
            event.preventDefault();
            apply(text);
          }}
        >
          <label className="ww-field ww-netline__field">
            <span className="ww-field__label">Server address (advanced)</span>
            <input
              className="ww-input"
              value={text}
              placeholder="host:8787"
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => setText(event.currentTarget.value)}
            />
          </label>
          <Button type="submit" size="sm">
            Use
          </Button>
          <Button size="sm" variant="ghost" onClick={() => apply('')}>
            Default
          </Button>
          {error && <p className="ww-warn-text ww-netline__error">{error}</p>}
        </form>
      )}
    </div>
  );
}
