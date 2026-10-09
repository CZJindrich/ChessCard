/** Settings (GDD §15.1.13): the presentation settings as a full screen. */
import type { ReactElement } from 'react';
import { Panel } from '../../components/Panel';
import { ScreenFrame } from '../../components/ScreenFrame';
import { SettingsPanel } from './SettingsPanel';

export function SettingsScreen(): ReactElement {
  return (
    <ScreenFrame title="Settings" subtitle="Kept on this device. Changes apply at once." bodyClassName="ww-settings-screen" showSettings={false}>
      <Panel drips="plum" dripOffset={33} className="ww-settings-screen__panel">
        <SettingsPanel />
      </Panel>
    </ScreenFrame>
  );
}
