/**
 * The piece card under the plaques: who the hovered (or selected / inspected) piece is, how it
 * moves and strikes, its HP and ATK, statuses and, for the acting seat's pieces, which of its
 * Move and Strike are left.
 */
import type { ReactElement } from 'react';
import { BossArt, PieceArt, StatusIcon } from '../../art';
import type { ContentRegistry, GameState, Piece, Pos } from '../../engine/types';
import { attackSummary, moveSummary } from '../model/describe';
import { useGameSnapshot, useRegistry } from './context';
import { nameOf } from './model';
import { houseColorOf, isActingPiece } from './pieceView';

interface Lines {
  kind: string;
  move: string | null;
  strike: string | null;
  text: string | null;
}

function describe(reg: ContentRegistry, piece: Piece): Lines {
  if (piece.kind === 'candle') return { kind: 'Vigil Candle', move: null, strike: null, text: 'Each hit adds Dread. Keep it lit until Dawn.' };
  if (piece.kind === 'boss') {
    const boss = reg.bosses.byId[piece.defId];
    return { kind: 'Boss', move: null, strike: null, text: boss ? `${boss.specialText} Weakness: ${boss.weaknessText}` : null };
  }
  if (piece.kind === 'hero') {
    const def = reg.heroes.byId[piece.defId];
    if (!def) return { kind: 'Hero', move: null, strike: null, text: null };
    const trait = reg.traits.byId[def.trait];
    return { kind: def.title, move: moveSummary(reg, def), strike: attackSummary(reg, def.attack), text: trait ? `${trait.name}: ${trait.text}` : null };
  }
  const unit = reg.units.byId[piece.defId];
  if (unit) return { kind: unit.structure ? 'Structure' : 'Unit', move: moveSummary(reg, unit), strike: attackSummary(reg, unit.attack), text: unit.text || null };
  const enemy = reg.enemies.byId[piece.defId];
  if (enemy) {
    const rank = reg.ranks.byId[enemy.rank]?.name ?? enemy.rank;
    return { kind: `Snuff ${rank}`, move: moveSummary(reg, enemy), strike: attackSummary(reg, enemy.attack), text: enemy.text || null };
  }
  return { kind: piece.kind, move: null, strike: null, text: null };
}

function pieceUnder(state: GameState, pos: Pos | null): Piece | null {
  if (!pos) return null;
  return Object.values(state.pieces).find((p) => pos.x >= p.pos.x && pos.x < p.pos.x + p.size && pos.y >= p.pos.y && pos.y < p.pos.y + p.size) ?? null;
}

export function PieceCard(): ReactElement | null {
  const snap = useGameSnapshot();
  const registry = useRegistry();
  const { state, selection } = snap;
  const piece = pieceUnder(state, selection.hover) ?? (selection.pieceId ? state.pieces[selection.pieceId] : undefined) ?? (selection.inspectId ? state.pieces[selection.inspectId] : undefined);
  if (!piece) return null;
  const lines = describe(registry, piece);
  const acting = isActingPiece(state, piece);
  const snuff = piece.side === 'snuff';
  return (
    <section className={`ww-piece-card${snuff ? ' ww-piece-card--snuff' : ''}`} aria-label="Piece">
      <header className="ww-piece-card__head">
        <span className="ww-piece-card__art">
          {piece.kind === 'boss' ? (
            <BossArt bossId={piece.defId} size={52} animated={false} />
          ) : (
            <PieceArt
              defId={piece.kind === 'candle' ? 'vigil_candle' : piece.smoldering ? 'smoldering_wick' : piece.defId}
              kind={piece.kind === 'candle' ? 'candle' : piece.smoldering ? 'wick' : piece.kind === 'hero' ? 'hero' : snuff ? 'enemy' : 'unit'}
              side={piece.side}
              houseColor={houseColorOf(state, piece.owner)}
              size={48}
              showStats={false}
              showPips={false}
              animated={false}
            />
          )}
        </span>
        <span className="ww-piece-card__names">
          <span className="ww-piece-card__name">{nameOf(registry, piece)}</span>
          <span className="ww-piece-card__kind">{lines.kind}</span>
        </span>
      </header>
      <div className="ww-piece-card__stats">
        <span className="ww-piece-card__stat ww-num" title="HP">
          <i className="ww-piece-card__drop" aria-hidden="true" />
          {piece.hp}/{piece.maxHp}
        </span>
        {piece.atk > 0 && (
          <span className="ww-piece-card__stat ww-num" title="ATK">
            <i className="ww-piece-card__blade" aria-hidden="true" />
            {piece.atk}
          </span>
        )}
        {piece.ward && <StatusIcon id="ward" size={18} />}
        {piece.burn > 0 && <StatusIcon id="burn" size={18} count={piece.burn} />}
        {piece.dazed && <StatusIcon id="dazed" size={18} />}
      </div>
      {lines.move && (
        <p className="ww-piece-card__line">
          <b>Moves</b> {lines.move}
        </p>
      )}
      {lines.strike && (
        <p className="ww-piece-card__line">
          <b>Strikes</b> {lines.strike}
        </p>
      )}
      {acting && (
        <p className="ww-piece-card__pips">
          <span className={piece.movesLeft > 0 ? 'ww-pip ww-pip--on' : 'ww-pip'}>Move</span>
          <span className={piece.strikesLeft > 0 ? 'ww-pip ww-pip--on' : 'ww-pip'}>Strike</span>
        </p>
      )}
      {piece.exhausted && piece.side === 'wick' && <p className="ww-piece-card__note">Just arrived: acts next turn.</p>}
      {piece.smoldering && <p className="ww-piece-card__note">Smoldering: an adjacent ally can relight it.</p>}
      {lines.text && <p className="ww-piece-card__text">{lines.text}</p>}
    </section>
  );
}
