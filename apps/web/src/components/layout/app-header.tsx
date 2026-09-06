import { ArrowUpRight } from "lucide-react";

export function AppHeader() {
  return (
    <header className="workspace-header border-b border-border">
      <div className="mx-auto flex h-20 max-w-[1248px] items-center justify-between px-5 sm:px-8 lg:px-10">
        <div className="flex items-center gap-3" aria-label="Fieldwork home">
          <span
            aria-hidden="true"
            className="grid size-9 place-items-center rounded-xl border border-accent-border bg-accent text-brand"
          >
            <ArrowUpRight className="size-5" strokeWidth={1.5} />
          </span>
          <p className="text-lg font-medium tracking-[-0.04em]">
            fieldwork<span className="text-brand">.</span>
          </p>
        </div>
      </div>
    </header>
  );
}
