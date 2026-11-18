import { useSearchParams } from "react-router";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { DesktopSettings } from "@/features/settings/desktop-settings";
import { GmailSettings } from "@/features/settings/gmail-settings";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bot, Mail, Sun } from "lucide-react";

export function Component() {
  const [params, setParams] = useSearchParams();
  const section = params.get("section");
  const value =
    section === "ai" || section === "gmail" ? section : "appearance";
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
          <TabsTrigger value="ai">
            <Bot className="size-4" />
            AI providers
          </TabsTrigger>
          <TabsTrigger value="gmail">
            <Mail className="size-4" />
            Gmail
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
        <TabsContent value="ai">
          <DesktopSettings />
        </TabsContent>
        <TabsContent value="gmail">
          <GmailSettings />
        </TabsContent>
      </Tabs>
    </>
  );
}
