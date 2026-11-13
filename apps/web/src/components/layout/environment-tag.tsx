import { createPortal } from "react-dom";

/**
 * Development-only environment marker. Production builds render nothing,
 * including the packaged Ubuntu desktop app.
 */
export function EnvironmentTag() {
  if (!import.meta.env.DEV) return null;

  return createPortal(
    <span
      className="environment-tag pointer-events-none fixed right-3 top-3 rounded-md border border-warning/30 bg-background/95 px-1.5 py-0.5 text-caption font-mono font-medium uppercase text-warning"
      style={{ zIndex: 2_147_483_647 }}
      title="Development environment with isolated development data"
      aria-label="Development mode"
      role="status"
    >
      DEV
    </span>,
    document.body,
  );
}
