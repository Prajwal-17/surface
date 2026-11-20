import { Suspense, useEffect } from "react";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppHeader } from "./app-header";
export function AppShell({
  children,
  fullBleed = false,
}: {
  children: React.ReactNode;
  fullBleed?: boolean;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing || event.repeat) return;
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) {
        return;
      }
      if (event.key.toLowerCase() !== "r") return;
      event.preventDefault();
      window.location.reload();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
  return (
    <Suspense>
      <SidebarProvider
        defaultOpen={false}
        style={{ "--sidebar-width": "208px" } as React.CSSProperties}
        className="h-svh min-h-0 overflow-hidden"
      >
        <AppHeader />
        <SidebarInset className="h-svh min-h-0 min-w-0 bg-background">
          <div
            id="main-content"
            tabIndex={-1}
            className={
              fullBleed
                ? "min-h-0 flex-1 overflow-hidden pt-11"
                : "min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-[60px]"
            }
          >
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </Suspense>
  );
}
