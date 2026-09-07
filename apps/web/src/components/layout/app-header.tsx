"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import {
  BriefcaseBusiness,
  Building2,
  Activity,
  UserRound,
  Layers2,
  ArrowUpRight,
  ChevronRight,
  Sparkles,
  PanelLeft,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
const destinations = [
  { href: "/", label: "Opportunities", icon: BriefcaseBusiness },
  { href: "/companies", label: "Companies", icon: Building2 },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/profile", label: "My profile", icon: UserRound },
];
export function AppHeader() {
  const pathname = usePathname(),
    params = useSearchParams();
  const { toggleSidebar, setOpenMobile, state } = useSidebar();
  const jobsUrl = useSyncExternalStore(
    subscribe,
    () =>
      sessionStorage.getItem("surface-jobs-url") ||
      sessionStorage.getItem("fieldwork-jobs-url") ||
      "/",
    () => "/",
  );
  useEffect(() => {
    if (pathname === "/") {
      sessionStorage.setItem(
        "surface-jobs-url",
        params.size ? `/?${params}` : "/",
      );
      window.dispatchEvent(new Event("surface-navigation"));
    }
  }, [pathname, params]);
  const current = destinations.find((d) => d.href === pathname);
  return (
    <>
      <a
        href="#main-content"
        className="sr-only fixed left-4 top-4 z-[100] rounded-md bg-primary p-3 text-white focus:not-sr-only"
      >
        Skip to content
      </a>
      <Sidebar collapsible="offcanvas" className="border-sidebar-border">
        <SidebarHeader className="px-5 py-6">
          <Link
            href={jobsUrl}
            onClick={() => setOpenMobile(false)}
            className="flex items-center gap-3 text-xl font-extrabold tracking-tight text-foreground"
          >
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-white shadow-md">
              <Layers2 className="size-5" />
            </span>
            Surface
            <span className="ml-auto size-1.5 rounded-full bg-success" />
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup className="px-3 pt-5">
            <SidebarGroupLabel className="px-3 text-[10px] font-bold tracking-[.16em] text-muted-foreground">
              WORKSPACE
            </SidebarGroupLabel>
            <SidebarMenu className="mt-2 gap-1.5">
              {destinations.map(({ href, label, icon: Icon }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === href}
                    className="h-11 gap-3 rounded-lg px-3 text-[13px] font-medium data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground"
                  >
                    <Link
                      href={href === "/" ? jobsUrl : href}
                      onClick={() => setOpenMobile(false)}
                      aria-current={pathname === href ? "page" : undefined}
                    >
                      <Icon className="!size-[18px]" />
                      <span>{label}</span>
                      {pathname === href && (
                        <span className="ml-auto size-1.5 rounded-full bg-brand" />
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="gap-4 p-4">
          <div className="rounded-xl border border-blue-400/20 bg-blue-500/[.07] p-4">
            <Sparkles className="mb-3 size-5 text-brand" />
            <p className="text-[13px] font-semibold text-foreground">
              Better context. Better fits.
            </p>
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
              Your skills and ambitions guide every assessment.
            </p>
            <Link
              href="/profile"
              onClick={() => setOpenMobile(false)}
              className="mt-3 flex items-center gap-2 text-xs font-semibold text-brand"
            >
              Shape your profile <ArrowUpRight className="size-3.5" />
            </Link>
          </div>
          <div className="flex items-center gap-3 border-t border-sidebar-border px-1 pt-4">
            <span className="grid size-8 place-items-center rounded-full bg-secondary text-xs font-semibold text-brand">
              S
            </span>
            <div>
              <p className="text-xs font-semibold text-foreground">
                Personal workspace
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Stored on your device
              </p>
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>
      <header
        className={`fixed left-0 right-0 top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur-sm md:px-6 lg:px-8 ${state === "collapsed" ? "md:left-0" : "md:left-[var(--sidebar-width)]"}`}
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          aria-label="Toggle navigation"
          data-surface-nav-toggle
        >
          <PanelLeft />
        </Button>
        <span className="hidden text-xs text-muted-foreground sm:inline">
          Workspace
        </span>
        <ChevronRight className="hidden size-3 text-muted-foreground sm:block" />
        <span className="text-xs font-semibold">
          {current?.label ?? "Surface"}
        </span>
        <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <span className="size-1.5 rounded-full bg-success" />
          Personal job search
        </span>
      </header>
    </>
  );
}
function subscribe(callback: () => void) {
  window.addEventListener("surface-navigation", callback);
  return () => window.removeEventListener("surface-navigation", callback);
}
