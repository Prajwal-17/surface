import { createPortal } from "react-dom";

export function EnvironmentTag() {
  const isDevelopment = import.meta.env.DEV;

  return createPortal(
    <span
      className={`environment-tag pointer-events-none fixed right-3 top-3 rounded-md border px-1.5 py-0.5 text-caption font-mono font-medium uppercase ${
        isDevelopment
          ? "border-warning/30 bg-background/95 text-warning"
          : "border-border bg-background/95 text-muted-foreground"
      }`}
      style={{ zIndex: 2_147_483_647 }}
      title={
        isDevelopment
          ? "Development environment with isolated development data"
          : "Production build"
      }
      aria-label={isDevelopment ? "Development mode" : "Production mode"}
      role="status"
    >
      {isDevelopment ? "DEV" : "PROD"}
    </span>,
    document.body,
  );
}
