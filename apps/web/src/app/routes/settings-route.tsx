import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Sun } from "lucide-react";

export function Component() {
  return (
    <>
      <h1 className="sr-only">Settings</h1>
      <div className="mx-auto max-w-6xl">
          <section className="form-section">
            <h2>Appearance</h2>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-y py-3">
              <div>
                <h3 className="text-sm font-medium">Workspace theme</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Follows your system until you choose a theme. Your choice is
                  saved on this device.
                </p>
              </div>
              <ThemeToggle />
            </div>
          </section>
      </div>
    </>
  );
}
