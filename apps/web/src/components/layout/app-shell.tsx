import { Suspense } from "react";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppHeader } from "./app-header";
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider className="h-svh min-h-0 overflow-hidden">
      <Suspense>
        <AppHeader />
      </Suspense>
      <SidebarInset className="h-svh min-h-0 min-w-0 bg-background">
        <div
          id="main-content"
          tabIndex={-1}
          className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-[76px] sm:px-6 lg:px-8 lg:pt-[88px]"
        >
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
