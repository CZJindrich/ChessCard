/**
 * "Load mod (JSON)" (GDD §15.1.12, A.3): paste or pick a JSON mod, merge it over the base
 * content, and list every schema or reference error with its file and path. A loaded mod
 * replaces the previous one; "Reset to base content" removes it.
 */
import { useEffect, useRef, useState, type ChangeEvent, type ReactElement } from 'react';
import { CONTENT_FILE_NAMES, MOD_SIZE_LIMIT } from '../../../engine/content';
import type { ContentError } from '../../../engine/content';
import { useContentState, useServices } from '../../app/services';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';

const EXAMPLE = '{ "cards": [ { "id": "spark", "cost": 0 } ] }';

export function ModLoader({ onClose }: { onClose: () => void }): ReactElement {
  const services = useServices();
  const content = useContentState();
  const [text, setText] = useState('');
  const [label, setLabel] = useState('pasted JSON');
  const [errors, setErrors] = useState<ContentError[]>([]);
  const errorsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (errors.length > 0) errorsRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [errors]);

  const readFile = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    if (file.size > MOD_SIZE_LIMIT) {
      setErrors([{ file: 'mod', path: file.name, message: `The file is larger than ${MOD_SIZE_LIMIT / 1024} KB` }]);
      return;
    }
    void file.text().then((body) => {
      setText(body);
      setLabel(file.name);
      setErrors([]);
    });
  };

  const apply = (): void => {
    const result = services.content.loadMod(text, label);
    if (!result.ok) {
      services.audio.play('uiError');
      setErrors(result.errors);
      return;
    }
    setErrors([]);
    services.toasts.show({ title: `Mod loaded: ${label}`, lines: [`Content hash ${result.state.hash}`, 'Mods disable the Daily.'], tone: 'success' });
    onClose();
  };

  const reset = (): void => {
    services.content.resetToBase();
    services.toasts.show({ title: 'Back to the base content', lines: [`Content hash ${services.content.get().hash}`], tone: 'info' });
    onClose();
  };

  return (
    <Modal
      open
      size="lg"
      title="Load mod (JSON)"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" icon="reset" sound="back" disabledReason={content.modded ? null : 'Already on the base content'} onClick={reset}>
            Reset to base content
          </Button>
          <span className="ww-spacer" />
          <Button variant="ghost" sound="back" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" seal="upload" sound="confirm" disabledReason={text.trim() ? null : 'Paste JSON or choose a file first'} onClick={apply}>
            Apply mod
          </Button>
        </>
      }
    >
      <div className="ww-modloader">
        <p className="ww-dim">
          A mod is a JSON object keyed by content file. Entries with a known <code>id</code> merge over the original (arrays replace), new ids are added, and{' '}
          <code>{'{"id": "x", "$remove": true}'}</code> removes one. Limit {MOD_SIZE_LIMIT / 1024} KB.
        </p>
        <p className="ww-modloader__status">
          Now using: <strong>{content.modded ? `mod (${content.modLabel ?? 'unnamed'})` : 'base content'}</strong> · hash <span className="ww-num">{content.hash}</span>
        </p>
        <label className="ww-field">
          <span className="ww-field__label">Mod JSON</span>
          <textarea
            className="ww-textarea ww-modloader__text"
            value={text}
            placeholder={EXAMPLE}
            spellCheck={false}
            onChange={(event) => {
              setText(event.currentTarget.value);
              setLabel('pasted JSON');
            }}
          />
        </label>
        <label className="ww-modloader__file">
          <span className="ww-field__label">Or choose a file</span>
          <input type="file" accept="application/json,.json" onChange={readFile} />
        </label>
        <details className="ww-modloader__files">
          <summary>Content files</summary>
          <p className="ww-dim">{CONTENT_FILE_NAMES.join(', ')}</p>
        </details>
        {errors.length > 0 && (
          <div ref={errorsRef} className="ww-modloader__errors" role="alert">
            <p className="ww-warn-text">
              {errors.length} {errors.length === 1 ? 'problem' : 'problems'}: nothing was changed.
            </p>
            <table className="ww-modloader__table">
              <thead>
                <tr>
                  <th scope="col">File</th>
                  <th scope="col">Path</th>
                  <th scope="col">Message</th>
                </tr>
              </thead>
              <tbody>
                {errors.map((error, i) => (
                  <tr key={i}>
                    <td>{error.file}</td>
                    <td>
                      <code>{error.path || '—'}</code>
                    </td>
                    <td>{error.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}
