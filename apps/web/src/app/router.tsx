import { createBrowserRouter, redirect } from "react-router";
import { WorkspaceLayout } from "@/app/routes/workspace-layout";
import { LoadingStatus } from "@/components/feedback/loading-state";

function RouterHydrateFallback() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background">
      <LoadingStatus>Loading workspace…</LoadingStatus>
    </main>
  );
}

export const router = createBrowserRouter([
  {
    Component: WorkspaceLayout,
    HydrateFallback: RouterHydrateFallback,
    children: [
      {
        index: true,
        Component: () => null,
        loader: ({ request }) =>
          redirect(`/applications${new URL(request.url).search}`),
      },
      { path: "companies", lazy: () => import("@/app/routes/companies-route") },
      {
        path: "applications",
        lazy: () => import("@/app/routes/applications-route"),
      },
      { path: "profile", lazy: () => import("@/app/routes/profile-route") },
      { path: "settings", lazy: () => import("@/app/routes/settings-route") },
    ],
  },
  { path: "/onboarding", lazy: () => import("@/app/routes/onboarding-route") },
]);
