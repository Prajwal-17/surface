import { useSearchParams } from "react-router";
import { CompanySourcesScreen } from "@/features/companies/components/company-sources-screen";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { AnalysisSettings } from "@/features/profile/components/analysis-settings";
import { DesktopSettings } from "@/features/settings/desktop-settings";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Radio, ScanLine, Sun } from "lucide-react";

export function Component() {
  const [params, setParams] = useSearchParams();
  const section = params.get("section");
  const value =
    section === "analysis" || section === "sources" ? section : "appearance";
  return (
    <>
      <h1 className="sr-only">Settings</h1>
      <Tabs
        value={value}
        onValueChange={(next) =>
          setParams(next === "appearance" ? {} : { section: next }, {
            replace: true,
          })
        }
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
          <TabsTrigger value="sources">
            <Radio className="size-4" /> Sources
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
        <TabsContent value="analysis" className="space-y-8">
          <DesktopSettings />
          <AnalysisSettings />
        </TabsContent>
        <TabsContent value="sources">
          <CompanySourcesScreen sourcesOnly />
        </TabsContent>
      </Tabs>
    </>
  );
}
