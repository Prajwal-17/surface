import { Suspense } from "react";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppHeader } from "./app-header";
export function AppShell({
  children,
  fullBleed = false,
}: {
  children: React.ReactNode;
  fullBleed?: boolean;
}) {
  return (
    <Suspense>
      <SidebarProvider
        style={{ "--sidebar-width": "240px" } as React.CSSProperties}
        className="h-svh min-h-0 overflow-hidden"
      >
        <AppHeader />
        <SidebarInset className="h-svh min-h-0 min-w-0 bg-background">
          <div
            id="main-content"
            tabIndex={-1}
            className={
              fullBleed
                ? "min-h-0 flex-1 overflow-hidden pt-14"
                : "min-h-0 flex-1 overflow-y-auto px-4 pb-3 pt-[72px] sm:px-6"
            }
          >
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </Suspense>
  );
}
