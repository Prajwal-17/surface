import { ThemeToggle } from "@/components/ui/theme-toggle";
import { AnalysisSettings } from "@/features/profile/components/analysis-settings";

export function Component() {
  return (
    <>
      <h1 className="sr-only">Settings</h1>
      <section className="mb-6 flex items-center justify-between gap-4 rounded-lg border bg-card p-4">
        <div>
          <h2 className="text-sm font-semibold">Appearance</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Choose your workspace theme.
          </p>
        </div>
        <ThemeToggle />
      </section>
      <AnalysisSettings />
    </>
  );
}
