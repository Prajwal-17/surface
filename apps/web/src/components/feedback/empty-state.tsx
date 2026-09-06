import { Inbox } from "lucide-react";

export function EmptyState({ title }: { title: string }) {
  return (
    <div className="grid min-h-72 place-items-center rounded-xl border border-border bg-card/50 px-6 text-center">
      <div className="max-w-sm">
        <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl border border-accent-border bg-accent text-brand">
          <Inbox className="size-4" />
        </div>
        <h3 className="font-display text-2xl">{title}</h3>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Find opportunities above, or adjust your filters to see more roles.
        </p>
      </div>
    </div>
  );
}
