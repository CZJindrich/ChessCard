/**
 * Catches a screen that failed to load (a code-split chunk that could not be fetched, e.g. while
 * offline or after a new deploy) or crashed while rendering, and offers a way out instead of a
 * blank page: reload the page, or go back to the Main Menu.
 */
import { Component, type ErrorInfo, type ReactElement, type ReactNode } from 'react';
import { Button } from './Button';
import { VeilCandle } from './LoadingVeil';

interface ScreenBoundaryProps {
  children: ReactNode;
  /** Leave the broken screen (the app resets navigation to the Title). */
  onMainMenu: () => void;
  /** Reload the page (default: `window.location.reload()`). */
  onReload?: () => void;
}

interface ScreenBoundaryState {
  error: unknown;
}

export class ScreenBoundary extends Component<ScreenBoundaryProps, ScreenBoundaryState> {
  override state: ScreenBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ScreenBoundaryState {
    return { error };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('Wickwatch: a screen failed', error, info.componentStack ?? '');
  }

  private readonly reload = (): void => {
    if (this.props.onReload) this.props.onReload();
    else window.location.reload();
  };

  private readonly mainMenu = (): void => {
    this.setState({ error: null });
    this.props.onMainMenu();
  };

  override render(): ReactNode {
    if (this.state.error === null) return this.props.children;
    return <ScreenFailure onReload={this.reload} onMainMenu={this.mainMenu} />;
  }
}

function ScreenFailure({ onReload, onMainMenu }: { onReload: () => void; onMainMenu: () => void }): ReactElement {
  return (
    <div className="ww-veil ww-veil--failed" role="alert" data-testid="screen-failed">
      <VeilCandle />
      <h2 className="ww-veil__title">The candle guttered</h2>
      <p className="ww-veil__text">This screen could not be loaded. Check your connection, then reload the page.</p>
      <div className="ww-veil__actions">
        <Button variant="primary" seal="reset" onClick={onReload}>
          Reload
        </Button>
        <Button variant="ghost" sound="back" onClick={onMainMenu}>
          Main Menu
        </Button>
      </div>
    </div>
  );
}
