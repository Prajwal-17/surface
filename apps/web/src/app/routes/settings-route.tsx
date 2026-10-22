import { ThemeToggle } from "@/components/ui/theme-toggle";
import { AnalysisSettings } from "@/features/profile/components/analysis-settings";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScanLine, Sun } from "lucide-react";

export function Component() {
  return (
    <>
      <h1 className="sr-only">Settings</h1>
      <Tabs
        defaultValue="appearance"
        orientation="vertical"
        className="settings-layout mx-auto max-w-6xl"
      >
        <TabsList aria-label="Settings sections">
          <TabsTrigger value="appearance">
            <Sun className="size-4" />
            Appearance
          </TabsTrigger>
          <TabsTrigger value="analysis">
            <ScanLine className="size-4" />
            AI settings
          </TabsTrigger>
        </TabsList>
        <TabsContent value="appearance">
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
        </TabsContent>
        <TabsContent value="analysis">
          <AnalysisSettings />
        </TabsContent>
      </Tabs>
    </>
  );
}
