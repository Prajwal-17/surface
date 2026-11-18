import { createBrowserRouter, redirect } from "react-router";
import { WorkspaceLayout } from "@/app/routes/workspace-layout";

export const router = createBrowserRouter([
  {
    Component: WorkspaceLayout,
    children: [
      {
        index: true,
        loader: ({ request }) =>
          redirect(`/applications${new URL(request.url).search}`),
      },
      { path: "activity", lazy: () => import("@/app/routes/activity-route") },
      { path: "companies", lazy: () => import("@/app/routes/companies-route") },
      {
        path: "applications",
        lazy: () => import("@/app/routes/applications-route"),
      },
      { path: "profile", lazy: () => import("@/app/routes/profile-route") },
      { path: "research", lazy: () => import("@/app/routes/research-route") },
      {
        path: "research/:companyId",
        lazy: () => import("@/app/routes/company-research-route"),
      },
      { path: "schema", lazy: () => import("@/app/routes/schema-route") },
      { path: "settings", lazy: () => import("@/app/routes/settings-route") },
    ],
  },
  { path: "/onboarding", lazy: () => import("@/app/routes/onboarding-route") },
]);
