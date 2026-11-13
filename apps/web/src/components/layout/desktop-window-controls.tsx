import { useEffect, useState } from "react";
import { Copy, Minus, Square, X } from "lucide-react";

interface WindowState {
  maximized: boolean;
  fullscreen: boolean;
  focused: boolean;
}

const initialState: WindowState = {
  maximized: false,
  fullscreen: false,
  focused: true,
};

/**
 * Linux caption controls for Surface's frameless Electron window. Interactive
 * buttons opt out of the draggable header region; the rest of the header
 * remains a native window drag handle.
 */
export function DesktopWindowControls() {
  const bridge = window.surfaceDesktop;
  const [state, setState] = useState(initialState);

  useEffect(() => {
    if (!bridge?.getWindowState) return;
    document.documentElement.dataset.desktop = "true";
    let mounted = true;
    void bridge
      .getWindowState()
      .then((next) => {
        if (mounted) setState(next);
      })
      .catch(() => {
        /* Window controls stay usable through IPC even if state is delayed. */
      });
    const unsubscribe =
      typeof bridge.onWindowState === "function"
        ? bridge.onWindowState((next) => {
            if (mounted) setState(next);
          })
        : undefined;
    return () => {
      mounted = false;
      unsubscribe?.();
      delete document.documentElement.dataset.desktop;
    };
  }, [bridge]);

  if (!bridge?.getWindowState) return null;

  const MaximizeIcon = state.maximized ? Copy : Square;
  return (
    <div
      className="desktop-window-controls"
      role="group"
      aria-label="Window controls"
      data-focused={state.focused}
      data-maximized={state.maximized}
    >
      <button
        type="button"
        className="desktop-caption-button"
        aria-label="Minimize window"
        aria-keyshortcuts="Alt+F9"
        title="Minimize (Alt+F9)"
        onClick={() => void bridge.minimizeWindow()}
      >
        <Minus size={12} strokeWidth={1.7} />
      </button>
      <button
        type="button"
        className="desktop-caption-button"
        aria-label={state.maximized ? "Restore window" : "Maximize window"}
        aria-keyshortcuts="Alt+F10"
        aria-pressed={state.maximized}
        title={state.maximized ? "Restore (Alt+F10)" : "Maximize (Alt+F10)"}
        onClick={() => void bridge.toggleMaximize()}
      >
        <MaximizeIcon size={state.maximized ? 12 : 11} strokeWidth={1.7} />
      </button>
      <button
        type="button"
        className="desktop-caption-button desktop-caption-close"
        aria-label="Close window"
        aria-keyshortcuts="Alt+F4"
        title="Close (Alt+F4)"
        onClick={() => void bridge.closeWindow()}
      >
        <X size={12} strokeWidth={1.7} />
      </button>
    </div>
  );
}
