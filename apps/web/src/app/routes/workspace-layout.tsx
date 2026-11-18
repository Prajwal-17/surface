import { Outlet, useLocation } from "react-router";
import { AppShell } from "@/components/layout/app-shell";

export function WorkspaceLayout() {
  const { pathname } = useLocation();
  const fullBleed =
    pathname === "/" ||
    pathname === "/applications" ||
    pathname === "/companies";

  return (
    <AppShell fullBleed={fullBleed}>
      <Outlet />
    </AppShell>
  );
}
