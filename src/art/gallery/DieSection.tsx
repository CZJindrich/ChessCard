/** Gallery: Moth Die faces (resting), a live roll, and the flat HUD face icons. */
import { useState, type ReactElement } from 'react';
import { MOTH_DIE_FACES, MOTH_DIE_LABELS, MothDie, MothDieFaceIcon } from '../dice/MothDie';

export function DieSection(): ReactElement {
  const [roll, setRoll] = useState(0);
  const [value, setValue] = useState(6);
  return (
    <section className="gal-section">
      <h3>Resting on each face (96 px)</h3>
      <div className="gal-row" style={{ gap: 40, padding: '8px 12px 24px' }}>
        {MOTH_DIE_FACES.map((f, i) => (
          <div key={f} className="gal-item">
            <MothDie value={i + 1} size={96} reducedMotion />
            <div className="gal-label" style={{ marginTop: 18 }}>
              {i + 1} · {f} — “{MOTH_DIE_LABELS[f]}”
            </div>
          </div>
        ))}
      </div>
      <h3>Roll (click)</h3>
      <div className="gal-row" style={{ gap: 24, padding: '8px 12px 24px' }}>
        <button
          type="button"
          onClick={() => {
            setValue(1 + Math.floor(Math.random() * 6));
            setRoll((r) => r + 1);
          }}
        >
          Roll the Moth Die
        </button>
        <MothDie value={value} rollId={roll} size={80} />
        <MothDie value={value} rollId={roll} size={80} reducedMotion />
      </div>
      <h3>HUD face icons</h3>
      <div className="gal-row">
        {MOTH_DIE_FACES.map((f) => (
          <MothDieFaceIcon key={f} face={f} size={40} />
        ))}
      </div>
    </section>
  );
}
