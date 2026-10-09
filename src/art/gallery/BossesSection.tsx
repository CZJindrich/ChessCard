/** Gallery: bosses in every phase, King crown sockets, Nocturna hunger, silhouettes, HP bars. */
import type { ReactElement } from 'react';
import { BossArt, BOSS_IDS, BOSS_NAMES } from '../bosses/BossArt';
import { BossHpBar } from '../bosses/BossHpBar';

function Footprint({ children, label }: { children: ReactElement; label: string }): ReactElement {
  // A 3×3 checker behind the art; the 2×2 footprint is outlined.
  return (
    <div className="gal-item">
      <div className="gal-boss-stage">
        {children}
        <div className="gal-boss-footprint" />
      </div>
      <div className="gal-label">{label}</div>
    </div>
  );
}

export function BossesSection(): ReactElement {
  return (
    <section className="gal-section">
      {BOSS_IDS.map((id) => (
        <div key={id}>
          <h3>
            {BOSS_NAMES[id].name} — {BOSS_NAMES[id].epithet}
          </h3>
          <div className="gal-row">
            {[1, 2, 3].map((phase) => (
              <Footprint key={phase} label={`Phase ${phase}`}>
                <BossArt bossId={id} phase={phase} crowns={phase - 1} size={240} />
              </Footprint>
            ))}
            {id === 'guttered_king' && (
              <Footprint label="3 crowns">
                <BossArt bossId={id} phase={3} crowns={3} size={240} />
              </Footprint>
            )}
            {id === 'nocturna' && (
              <Footprint label="Hungry">
                <BossArt bossId={id} phase={1} hungry size={240} />
              </Footprint>
            )}
            <Footprint label="Silhouette (intro)">
              <BossArt bossId={id} silhouette size={240} />
            </Footprint>
          </div>
          <div className="gal-row" style={{ marginTop: 8 }}>
            <BossHpBar bossId={id} hp={21} maxHp={34} crowns={1} />
            <BossHpBar bossId={id} hp={8} maxHp={34} crowns={3} width={260} />
          </div>
        </div>
      ))}
      <h3>Unknown boss fallback</h3>
      <Footprint label="modded_boss">
        <BossArt bossId="modded_boss" size={240} />
      </Footprint>
    </section>
  );
}
