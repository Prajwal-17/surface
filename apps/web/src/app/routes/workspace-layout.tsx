import { Outlet, useLocation } from "react-router";
import { AppShell } from "@/components/layout/app-shell";

export function WorkspaceLayout() {
  const { pathname } = useLocation();
  const fullBleed =
    pathname === "/" ||
    pathname === "/applications" ||
    pathname === "/schema" ||
    /^\/research\/[^/]+\/?$/.test(pathname);

  return (
    <AppShell fullBleed={fullBleed}>
      <Outlet />
    </AppShell>
  );
}
