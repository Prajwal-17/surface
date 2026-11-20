import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { router } from "@/app/router";
import { createAppQueryClient } from "@/lib/query-client";
import { AuthGate } from "@/features/auth/auth-gate";
import { DesktopWindowControls } from "@/components/layout/desktop-window-controls";
// oxlint-disable-next-line import/no-unassigned-import -- load global application styles
import "@/styles/globals.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("The app root element was not found.");
}

if (window.surfaceDesktop?.getWindowState) {
  document.documentElement.dataset.desktop = "true";
}

const queryClient = createAppQueryClient();

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <DesktopWindowControls />
      <AuthGate>
        <RouterProvider router={router} />
      </AuthGate>
      <Toaster />
    </QueryClientProvider>
  </StrictMode>,
);
