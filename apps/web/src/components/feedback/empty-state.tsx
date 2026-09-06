import { Inbox } from "lucide-react";

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="grid min-h-56 place-items-center rounded-md border border-dashed border-border bg-card/50 px-6 text-center">
      <div className="max-w-sm">
        <div className="mx-auto mb-4 grid size-10 place-items-center rounded-md border border-border bg-secondary text-muted-foreground">
          <Inbox className="size-4" />
        </div>
        <h3 className="text-lg font-normal">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}
