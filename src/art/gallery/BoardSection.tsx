/** Gallery: every tile, overlay and mark, plus a staged board with pieces. */
import type { ReactElement } from 'react';
import { BoardArt, tileOrigin, type BoardTileSpec } from '../board/BoardArt';
import { DamageBadge, IntentTile, MoveDot, PushArrow, SkullBadge, StrikeRing } from '../board/marks';
import { GloamFog, GloamWarningBand, LitShrineGlyph, SmokePlumeToken, TileOverlaySvg } from '../board/overlays';
import { TileArt } from '../board/tiles';
import { HOUSES } from '../palette';
import { PieceGraphic } from '../pieces/PieceArt';

function Item({ label, children }: { label: string; children: ReactElement }): ReactElement {
  return (
    <div className="gal-item">
      {children}
      <div className="gal-label">{label}</div>
    </div>
  );
}

const DEMO_TILES: Record<string, BoardTileSpec | string> = {
  '1,6': 'pillar',
  '6,6': 'pillar',
  '2,4': { id: 'votive_shrine', lit: true },
  '5,1': 'votive_shrine',
  '0,3': 'rubble',
  '7,4': 'rubble',
  '4,5': { id: 'chimney', pair: 0 },
  '1,1': { id: 'chimney', pair: 0 },
  '6,3': 'hot_wax',
  '3,6': 'hot_wax',
};

interface Placed {
  x: number;
  y: number;
  el: ReactElement;
}

function DemoBoard(): ReactElement {
  const cols = 8;
  const rows = 8;
  const place = (x: number, y: number, el: ReactElement, key: string): ReactElement => {
    const o = tileOrigin({ x, y }, cols, rows);
    return (
      <g key={key} transform={`translate(${o.x} ${o.y})`}>
        {el}
      </g>
    );
  };
  const amber = HOUSES.house_beeswax.color;
  const pieces: Placed[] = [
    { x: 2, y: 2, el: <PieceGraphic defId="vigil_candle" hp={3} maxHp={3} seed="vc1" /> },
    { x: 5, y: 2, el: <PieceGraphic defId="vigil_candle" hp={2} maxHp={3} seed="vc2" /> },
    { x: 6, y: 4, el: <PieceGraphic defId="vigil_candle" hp={3} maxHp={3} ward seed="vc3" /> },
    { x: 3, y: 1, el: <PieceGraphic defId="sconce_paladin" houseColor={amber} hp={8} atk={2} ready seed="hero" lookAt={{ dx: -1, dy: -1 }} /> },
    { x: 4, y: 0, el: <PieceGraphic defId="taper" houseColor={amber} hp={1} atk={1} exhausted seed="t1" /> },
    { x: 2, y: 3, el: <PieceGraphic defId="sootling" hp={1} atk={1} seed="s1" /> },
    { x: 5, y: 4, el: <PieceGraphic defId="ink_wretch" hp={2} atk={1} seed="s2" /> },
    { x: 4, y: 6, el: <PieceGraphic defId="smokehound" hp={2} atk={1} seed="s3" dazed /> },
  ];
  return (
    <BoardArt cols={cols} rows={rows} tiles={DEMO_TILES} tileSize={64} seed="demo">
      {place(2, 5, <SmokePlumeToken seed="pl1" enemyId="sootling" />, 'plume1')}
      {place(5, 6, <SmokePlumeToken seed="pl2" enemyId="ink_wretch" />, 'plume2')}
      {place(2, 2, <IntentTile damage={1} queue={1} animated />, 'int1')}
      {place(5, 3, <IntentTile damage={1} queue={2} push={{ dx: 0, dy: 1 }} />, 'int2')}
      {place(5, 2, <IntentTile damage={1} queue={2} push={{ dx: 0, dy: 1 }} />, 'int3')}
      {pieces.map((p, i) => place(p.x, p.y, p.el, `p${i}`))}
      {place(2, 1, <MoveDot />, 'm1')}
      {place(3, 2, <MoveDot danger={1} />, 'm2')}
      {place(4, 1, <MoveDot />, 'm3')}
      {place(4, 2, <MoveDot hotWax />, 'm4')}
      {place(2, 3, <StrikeRing damage={2} lethal />, 'sr1')}
    </BoardArt>
  );
}

function LastFlameCorner(): ReactElement {
  const gloam: string[] = [];
  const warning: string[] = [];
  for (let i = 0; i < 6; i++) {
    gloam.push(`${i},0`, `0,${i}`);
    if (i > 0) warning.push(`${i},1`, `1,${i}`);
  }
  return <BoardArt cols={6} rows={6} gloam={[...new Set(gloam)]} gloamWarning={[...new Set(warning)]} tileSize={48} seed="lf" tiles={{ '3,3': { id: 'votive_shrine', lit: true }, '4,2': 'pillar' }} />;
}

export function BoardSection(): ReactElement {
  return (
    <section className="gal-section">
      <h3>Tiles</h3>
      <div className="gal-row">
        <Item label="flagstone a">
          <TileArt tileId="flagstone" variant="a" size={96} seed="fa" />
        </Item>
        <Item label="flagstone b">
          <TileArt tileId="flagstone" variant="b" size={96} seed="fb3" />
        </Item>
        <Item label="pillar">
          <TileArt tileId="pillar" size={96} />
        </Item>
        <Item label="rubble">
          <TileArt tileId="rubble" variant="b" size={96} />
        </Item>
        <Item label="votive shrine">
          <TileArt tileId="votive_shrine" size={96} />
        </Item>
        <Item label="lit shrine">
          <TileArt tileId="votive_shrine" lit variant="b" size={96} />
        </Item>
        {[0, 1, 2, 3].map((i) => (
          <Item key={i} label={`chimney pair ${i}`}>
            <TileArt tileId="chimney" pairIndex={i} variant={i % 2 === 0 ? 'a' : 'b'} size={96} />
          </Item>
        ))}
        <Item label="hot wax">
          <TileArt tileId="hot_wax" size={96} />
        </Item>
      </div>
      <h3>Overlays &amp; tokens</h3>
      <div className="gal-row">
        <Item label="gloam">
          <TileOverlaySvg size={96} title="Gloam">
            <GloamFog />
          </TileOverlaySvg>
        </Item>
        <Item label="gloam warning">
          <TileOverlaySvg size={96} title="Gloam warning">
            <GloamWarningBand />
          </TileOverlaySvg>
        </Item>
        <Item label="plume (sootling)">
          <TileOverlaySvg size={96} title="Smoke Plume">
            <SmokePlumeToken />
          </TileOverlaySvg>
        </Item>
        <Item label="plume (hollow lamplighter)">
          <TileOverlaySvg size={96} title="Smoke Plume">
            <SmokePlumeToken enemyId="hollow_lamplighter" seed="p2" />
          </TileOverlaySvg>
        </Item>
        <Item label="lit shrine token">
          <TileOverlaySvg size={64} title="Lit Shrine">
            <LitShrineGlyph />
          </TileOverlaySvg>
        </Item>
      </div>
      <h3>Marks</h3>
      <div className="gal-row">
        <Item label="intent">
          <TileOverlaySvg size={96} title="Intent">
            <IntentTile damage={2} queue={1} />
          </TileOverlaySvg>
        </Item>
        <Item label="intent + push">
          <TileOverlaySvg size={96} title="Intent">
            <IntentTile damage={3} queue={2} push={{ dx: 1, dy: 0 }} />
          </TileOverlaySvg>
        </Item>
        <Item label="push + bump">
          <TileOverlaySvg size={96} title="Push">
            <PushArrow dir={{ dx: 1, dy: -1 }} bump />
          </TileOverlaySvg>
        </Item>
        <Item label="move dot">
          <TileOverlaySvg size={96} title="Move">
            <MoveDot />
          </TileOverlaySvg>
        </Item>
        <Item label="move into danger">
          <TileOverlaySvg size={96} title="Move">
            <MoveDot danger={2} />
          </TileOverlaySvg>
        </Item>
        <Item label="chimney / hot wax move">
          <TileOverlaySvg size={96} title="Move">
            <g>
              <MoveDot chimney hotWax />
            </g>
          </TileOverlaySvg>
        </Item>
        <Item label="strike ring">
          <TileOverlaySvg size={96} title="Strike">
            <StrikeRing damage={2} />
          </TileOverlaySvg>
        </Item>
        <Item label="lethal strike">
          <TileOverlaySvg size={96} title="Strike">
            <StrikeRing damage={3} lethal />
          </TileOverlaySvg>
        </Item>
        <Item label="badges">
          <TileOverlaySvg size={96} title="Badges">
            <g>
              <DamageBadge amount={2} y={20} x={-20} />
              <SkullBadge cxp={44} cyp={44} r={12} />
            </g>
          </TileOverlaySvg>
        </Item>
      </div>
      <h3>Board — first_vigil-like staging (8×8, 64 px tiles)</h3>
      <DemoBoard />
      <h3>Last Flame corner — Gloam and warning band</h3>
      <LastFlameCorner />
    </section>
  );
}
