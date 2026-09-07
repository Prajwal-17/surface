"use client";
import Link from "next/link";
import { profileDetailsSchema } from "backend/contracts";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import {
  BriefcaseBusiness,
  Building2,
  Activity,
  UserRound,
  Layers2,
  ChevronRight,
  Settings2,
  PanelLeft,
  Database,
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
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useProfile } from "@/features/profile/profile-query";

const destinations = [
  { href: "/", label: "Jobs", icon: BriefcaseBusiness },
  { href: "/companies", label: "Companies", icon: Building2 },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/profile", label: "My profile", icon: UserRound },
];
const referenceDestinations = [
  { href: "/schema", label: "Schema", icon: Database },
];
export function AppHeader() {
  const pathname = usePathname(),
    params = useSearchParams();
  const { toggleSidebar, setOpenMobile, state } = useSidebar();
  const profile = useProfile();
  const legacyEmail = useSyncExternalStore(
    subscribeAccount,
    () => {
      try {
        const account = JSON.parse(
          localStorage.getItem("surface-account") ?? "null",
        );
        return profileDetailsSchema.shape.email.safeParse(account?.email)
          .success
          ? (account?.email ?? "")
          : "";
      } catch {
        return "";
      }
    },
    () => "",
  );
  const email = profile.data?.context.details?.email || legacyEmail;
  const router = useRouter();
  useEffect(() => {
    if (pathname !== "/" || !profile.isSuccess || profile.data) return;
    try {
      if (localStorage.getItem("surface-onboarding-skipped")) return;
    } catch {
      return;
    }
    router.replace("/onboarding");
  }, [pathname, profile.isSuccess, profile.data, router]);
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
  const current = [...destinations, ...referenceDestinations].find(
    (d) => d.href === pathname,
  );
  return (
    <>
      <a
        href="#main-content"
        className="sr-only fixed left-4 top-4 z-[100] rounded-md bg-primary p-3 text-primary-foreground focus:not-sr-only"
      >
        Skip to content
      </a>
      <Sidebar collapsible="offcanvas" className="border-sidebar-border">
        <SidebarHeader className="px-5 py-5">
          <Link
            href={jobsUrl}
            onClick={() => setOpenMobile(false)}
            className="flex items-center gap-3 text-lg font-semibold tracking-tight text-foreground"
          >
            <span className="grid size-7 place-items-center rounded-md border border-brand/25 bg-brand/10 text-brand">
              <Layers2 className="size-4" />
            </span>
            Surface
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup className="px-3 pt-7">
            <SidebarGroupLabel className="px-3 text-xs font-medium text-muted-foreground">
              Workspace
            </SidebarGroupLabel>
            <SidebarMenu className="mt-2 gap-1">
              {destinations.map(({ href, label, icon: Icon }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === href}
                    className="h-11 gap-3 rounded-md px-3 text-sm font-medium data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground"
                  >
                    <Link
                      href={href === "/" ? jobsUrl : href}
                      onClick={() => setOpenMobile(false)}
                      aria-current={pathname === href ? "page" : undefined}
                    >
                      <Icon className="!size-4" />
                      <span>{label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
          <SidebarGroup className="mt-auto px-3 pb-2">
            <SidebarGroupLabel className="px-3 text-xs font-medium text-muted-foreground">
              Reference
            </SidebarGroupLabel>
            <SidebarMenu className="mt-2">
              {referenceDestinations.map(({ href, label, icon: Icon }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === href}
                    className="h-11 gap-3 rounded-md px-3 text-xs font-medium text-sidebar-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground"
                  >
                    <Link
                      href={href}
                      onClick={() => setOpenMobile(false)}
                      aria-current={pathname === href ? "page" : undefined}
                    >
                      <Icon className="!size-3.5" />
                      <span>{label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="gap-3 px-3 pb-4">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname === "/settings"}
                className="h-11 gap-3 rounded-md px-3 text-sm"
              >
                <Link
                  href="/settings"
                  onClick={() => setOpenMobile(false)}
                  aria-current={pathname === "/settings" ? "page" : undefined}
                >
                  <Settings2 className="!size-4" />
                  <span>Settings</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <Link
            href="/profile"
            onClick={() => setOpenMobile(false)}
            className="flex min-w-0 w-full items-center gap-2 rounded-md border-t border-sidebar-border px-1 pt-3 text-left transition-colors hover:text-sidebar-accent-foreground"
            aria-label="View your profile"
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-full border border-border bg-secondary text-muted-foreground">
              <UserRound className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p
                className="truncate text-xs font-semibold text-foreground"
                title={profile.data?.context.details?.name || "Your profile"}
              >
                {profile.data?.context.details?.name || "Your profile"}
              </p>
              <p
                className="mt-0.5 truncate text-[11px] leading-4 text-muted-foreground"
                title={email || undefined}
              >
                {email || "Add your email"}
              </p>
            </div>
          </Link>
        </SidebarFooter>
      </Sidebar>
      <header
        className={`fixed left-0 right-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background px-4 md:px-6 ${state === "collapsed" ? "md:left-0" : "md:left-[var(--sidebar-width)]"}`}
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
          {pathname === "/settings"
            ? "Settings"
            : (current?.label ?? "Surface")}
        </span>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </header>
    </>
  );
}
function subscribe(callback: () => void) {
  window.addEventListener("surface-navigation", callback);
  return () => window.removeEventListener("surface-navigation", callback);
}

function subscribeAccount(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}
