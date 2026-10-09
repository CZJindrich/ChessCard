/** Gallery: title scene, in-game sky, victory, defeat and boss intro backdrops. */
import type { ReactElement } from 'react';
import { BossIntroBackdrop, DefeatEyespots, SkyBackdrop, VictorySunrise } from '../scenes/Backdrops';
import { TitleScene } from '../scenes/TitleScene';

function Caption({ title, sub }: { title: string; sub?: string }): ReactElement {
  return (
    <div className="gal-scene-caption">
      <div className="gal-scene-title">{title}</div>
      {sub && <div className="gal-scene-sub">{sub}</div>}
    </div>
  );
}

export function ScenesSection(): ReactElement {
  return (
    <section className="gal-section">
      <h3>Title (move the cursor: parallax, the light pushes the smoke back)</h3>
      <div className="gal-scene" id="scene-title">
        <TitleScene>
          <Caption title="Wickwatch" sub="QUICK PLAY" />
        </TitleScene>
      </div>
      <div className="gal-row" style={{ marginTop: 16 }}>
        <div className="gal-item">
          <div className="gal-scene-sm" id="scene-sky">
            <SkyBackdrop />
          </div>
          <div className="gal-label">SkyBackdrop (in play)</div>
        </div>
        <div className="gal-item">
          <div className="gal-scene-sm" id="scene-sky-dread">
            <SkyBackdrop dread={0.9} />
          </div>
          <div className="gal-label">SkyBackdrop, dread 0.9</div>
        </div>
        <div className="gal-item">
          <div className="gal-scene-sm" id="scene-victory">
            <VictorySunrise>
              <Caption title="Dawn Breaks" />
            </VictorySunrise>
          </div>
          <div className="gal-label">VictorySunrise</div>
        </div>
        <div className="gal-item">
          <div className="gal-scene-sm" id="scene-defeat">
            <DefeatEyespots>
              <Caption title="The Long Night Falls" />
            </DefeatEyespots>
          </div>
          <div className="gal-label">DefeatEyespots</div>
        </div>
        {['hush_hierophant', 'guttered_king', 'nocturna'].map((id) => (
          <div className="gal-item" key={id}>
            <div className="gal-scene-sm" id={`scene-intro-${id}`}>
              <BossIntroBackdrop bossId={id} />
            </div>
            <div className="gal-label">BossIntroBackdrop · {id}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
