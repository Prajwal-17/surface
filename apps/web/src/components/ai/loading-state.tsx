"use client";

import { useEffect, useState } from "react";

// Adapted from Beautiful UI's Drive loader. See README.md and LICENSE.md.
const delays = Array.from(
  { length: 9 },
  (_, index) => ((index % 3) + Math.abs(Math.floor(index / 3) - 1)) * 90,
);

export function AiLoadingState({ label }: { label: string }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const timer = setInterval(
      () => setSeconds((performance.now() - start) / 1000),
      100,
    );
    return () => clearInterval(timer);
  }, []);
  return (
    <div
      role="status"
      className="flex min-h-7 flex-wrap items-center gap-2.5 text-sm"
    >
      <span
        aria-hidden="true"
        className="grid shrink-0 grid-cols-[repeat(3,4px)] gap-[1.5px]"
      >
        {delays.map((delay, index) => (
          <span
            key={index}
            className="ai-loader-pixel size-1 rounded-[1px] bg-foreground"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </span>
      <span className="ai-loader-label font-medium">{label}</span>
      <span
        aria-hidden="true"
        className="font-mono text-xs tabular-nums text-muted-foreground"
      >
        {seconds < 60
          ? `${seconds.toFixed(1)}s`
          : `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`}
      </span>
    </div>
  );
}
