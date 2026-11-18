import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useDesktopChannel } from "@/lib/desktop-channel";

/**
 * Development-only environment marker. A packaged development build reports
 * its channel through the desktop bridge, while Vite dev mode keeps the marker
 * for the browser experience. Production builds and the browser build render
 * nothing.
 */
export function EnvironmentTag() {
  const desktopChannel = useDesktopChannel();
  const development = import.meta.env.DEV || desktopChannel === "development";

  useEffect(() => {
    if (desktopChannel !== "development") return;
    const previous = document.title;
    document.title = "Surface Dev — Your career workspace";
    return () => {
      document.title = previous;
    };
  }, [desktopChannel]);

  if (!development) return null;

  return createPortal(
    <span
      className="environment-tag pointer-events-none fixed left-1/2 top-[11px] hidden -translate-x-1/2 rounded-md border border-warning/30 bg-background/95 px-1.5 py-0.5 text-caption font-mono font-medium uppercase text-warning md:inline-block"
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
