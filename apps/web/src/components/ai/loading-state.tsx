import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";

export function AiLoadingState({ label }: { label: string }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const timer = setInterval(
      () => setSeconds((performance.now() - start) / 1000),
      1000,
    );
    return () => clearInterval(timer);
  }, []);
  return (
    <div
      role="status"
      className="flex min-h-7 flex-wrap items-center gap-2.5 text-sm"
    >
      <LoaderCircle
        aria-hidden="true"
        className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none text-brand"
      />
      <span className="ai-loader-label font-medium">{label}</span>
      <span
        aria-hidden="true"
        className="font-mono text-xs tabular-nums text-muted-foreground"
      >
        {seconds < 60
          ? `${Math.floor(seconds)}s`
          : `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`}
      </span>
    </div>
  );
}
