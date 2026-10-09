/**
 * Dawn carry-over (GDD §13.6 step 5): keep up to 2 units into the next Night. The default (the
 * highest HP, ties to the most recently summoned) is preselected; the rest melt.
 */
import { useState, type ReactElement } from 'react';
import { PieceArt } from '../../art';
import type { Piece } from '../../engine/types';
import { Button } from '../components/Button';
import { useController, useGameSnapshot, useRegistry } from './context';
import { GameDialog } from './GameDialog';
import { nameOf } from './model';
import { houseColorOf } from './pieceView';

export function CarryOverPanel(): ReactElement | null {
  const snap = useGameSnapshot();
  const seat = snap.uiSeat;
  const player = seat !== null ? snap.latest.players[seat] : undefined;
  if (snap.latest.phase !== 'dawn' || snap.animating || seat === null || !player?.carryOver || player.carryOver.chosen !== null) return null;
  return <CarryOverChoice key={`${seat}:${snap.latest.night}`} seat={seat} defaults={player.carryOver.defaults} />;
}

function CarryOverChoice({ seat, defaults }: { seat: number; defaults: string[] }): ReactElement {
  const snap = useGameSnapshot();
  const controller = useController();
  const registry = useRegistry();
  const [keep, setKeep] = useState<string[]>(defaults);
  const max = registry.rules.carryOverMax;
  const units = Object.values(snap.latest.pieces).filter((p): p is Piece => p.owner === seat && p.kind === 'unit');
  const toggle = (id: string): void => {
    setKeep((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < max ? [...prev, id] : [...prev.slice(1), id]));
  };
  return (
    <GameDialog
      eyebrow={`Dawn · Night ${snap.latest.night}`}
      title={`Keep up to ${max} units`}
      footer={
        <Button variant="primary" seal="check" onClick={() => controller.dispatch({ type: 'carry_over', seat, keep })}>
          Keep {keep.length} and melt the rest
        </Button>
      }
    >
      <p className="ww-dialog__lead">The rest melt at Dawn. Kept units redeploy next Night.</p>
      <ul className="ww-carry">
        {units.map((unit) => {
          const kept = keep.includes(unit.id);
          return (
            <li key={unit.id}>
              <button type="button" className={`ww-carry__unit${kept ? ' ww-carry__unit--kept' : ''}`} aria-pressed={kept} onClick={() => toggle(unit.id)}>
                <PieceArt defId={unit.defId} kind="unit" houseColor={houseColorOf(snap.latest, seat)} hp={unit.hp} maxHp={unit.maxHp} atk={unit.atk} size={56} showPips={false} animated={kept} />
                <span className="ww-carry__name">{nameOf(registry, unit)}</span>
                <span className="ww-carry__hp ww-num">
                  {unit.hp}/{unit.maxHp} HP
                </span>
                <span className="ww-carry__mark">{kept ? 'Kept' : 'Melts'}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </GameDialog>
  );
}
