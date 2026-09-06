import { Database } from "lucide-react";
import { Badge } from "@repo/ui/badge";

export function AppHeader() {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex h-16 max-w-[1198px] items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3" aria-label="Fieldwork home">
          <span
            aria-hidden="true"
            className="grid size-7 place-items-center rounded-[5px] bg-primary font-mono text-[10px] text-primary-foreground"
          >
            FW
          </span>
          <div className="flex items-baseline gap-2.5">
            <p className="text-sm font-medium tracking-[-0.01em]">Fieldwork</p>
            <span className="hidden font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground sm:inline">
              Job desk
            </span>
          </div>
        </div>

        <Badge variant="outline" className="gap-1.5">
          <Database className="size-3" />
          <span className="hidden sm:inline">Local workspace</span>
          <span className="sm:hidden">Local</span>
        </Badge>
      </div>
    </header>
  );
}
