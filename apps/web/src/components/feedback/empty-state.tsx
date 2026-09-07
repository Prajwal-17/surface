import { Inbox } from "lucide-react";

export function EmptyState({ title }: { title: string }) {
  return (
    <div className="grid h-full min-h-72 place-items-center bg-card/50 px-6 text-center">
      <div className="max-w-sm">
        <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl border border-border bg-accent text-brand">
          <Inbox className="size-4" />
        </div>
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Try a broader search or adjust your filters. Add sources in Companies
          to bring more roles into your inbox.
        </p>
      </div>
    </div>
  );
}
