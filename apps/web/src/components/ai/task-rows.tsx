// Adapted from Beautiful UI TaskRows.tsx, Copyright (c) 2026 Shane Levine.
// MIT license: ./LICENSE.md. Actual persisted states replace the demo sequence.
import type { WorkItem } from "backend/contracts";
import { Check, Circle, LoaderCircle, TriangleAlert } from "lucide-react";
export function TaskRows({
  items,
  label,
}: {
  items: WorkItem[];
  label: (item: WorkItem) => string;
}) {
  return (
    <div className="divide-y overflow-hidden rounded-xl border bg-background/40">
      {items.map((item, i) => (
        <details key={item.id} className="group p-4">
          <summary className="flex cursor-pointer items-center gap-3 text-sm">
            <span aria-hidden="true" className="shrink-0">
              {item.state === "completed" ? (
                <Check className="size-4 text-success" />
              ) : item.state === "running" ? (
                <LoaderCircle className="size-4 animate-spin text-brand" />
              ) : ["failed", "partial", "interrupted"].includes(item.state) ? (
                <TriangleAlert className="size-4 text-warning" />
              ) : (
                <Circle className="size-4 text-muted-foreground" />
              )}
            </span>
            <span className="min-w-0 flex-1 break-words">
              <span className="mr-3 text-xs text-muted-foreground">
                {String(i + 1).padStart(2, "0")}
              </span>
              {label(item)}
            </span>
            <span
              className={`status-pill capitalize ${item.state === "completed" ? "tone-mint" : item.state === "running" ? "tone-blue" : ["failed", "partial", "interrupted"].includes(item.state) ? "tone-amber" : "tone-muted"}`}
            >
              {item.state}
            </span>
          </summary>
          <div className="mt-3 space-y-2 pl-7 text-sm">
            <p>Dispatched attempts: {item.attempts}</p>
            {item.error && (
              <p className="rounded-lg bg-destructive/10 p-3 text-destructive">
                {item.error}
              </p>
            )}
            {item.state === "queued" && (
              <p className="text-muted-foreground">
                Eligible after {new Date(item.retryAt).toLocaleString()}
              </p>
            )}
            {item.result && (
              <p className="text-muted-foreground">
                {Object.entries(item.result)
                  .map(([key, value]) => `${key}: ${String(value)}`)
                  .join(" · ")}
              </p>
            )}
          </div>
        </details>
      ))}
    </div>
  );
}
