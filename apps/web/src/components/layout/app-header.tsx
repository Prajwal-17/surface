import { Link, useLocation, useNavigate } from "react-router";
import { profileDetailsSchema } from "@surface/contracts";
import { useEffect, useSyncExternalStore } from "react";
import {
  BriefcaseBusiness,
  Building2,
  Activity,
  UserRound,
  ChevronRight,
  Settings2,
  PanelLeft,
  Database,
  LogOut,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { SurfaceLogo } from "@/components/ui/surface-logo";
import { useProfile } from "@/features/profile/profile-query";
import { useAuth } from "@/features/auth/auth-context";
import { useDesktopChannel } from "@/lib/desktop-channel";

const destinations = [
  { href: "/", label: "Jobs", icon: BriefcaseBusiness },
  { href: "/companies", label: "Companies", icon: Building2 },
] as const;
const referenceDestinations = [
  { href: "/schema", label: "Schema", icon: Database },
  { href: "/settings", label: "Settings", icon: Settings2 },
  { href: "/activity", label: "Activity", icon: Activity },
] as const;
const profileDestination = {
  href: "/profile",
  label: "My profile",
  icon: UserRound,
} as const;
export function AppHeader() {
  const location = useLocation();
  const pathname = location.pathname;
  const desktopChannel = useDesktopChannel();
  const { toggleSidebar, setOpenMobile, state } = useSidebar();
  const auth = useAuth();
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
  const email =
    profile.data?.context.details?.email || auth.email || legacyEmail;
  const navigate = useNavigate();
  useEffect(() => {
    if (pathname !== "/" || !profile.isSuccess || profile.data) return;
    try {
      if (localStorage.getItem("surface-onboarding-skipped")) return;
    } catch {
      return;
    }
    void navigate("/onboarding", { replace: true });
  }, [pathname, profile.isSuccess, profile.data, navigate]);
  const savedJobsUrl = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return (
          sessionStorage.getItem("surface-jobs-url") ||
          sessionStorage.getItem("fieldwork-jobs-url") ||
          "/"
        );
      } catch {
        return "/";
      }
    },
    () => "/",
  );
  const jobsUrl =
    savedJobsUrl.startsWith("/") && !savedJobsUrl.startsWith("//")
      ? savedJobsUrl
      : "/";
  useEffect(() => {
    if (pathname === "/") {
      const params = new URLSearchParams(location.search);
      try {
        sessionStorage.setItem(
          "surface-jobs-url",
          params.size ? `/?${params}` : "/",
        );
      } catch {
        /* Navigation remains usable without browser storage. */
      }
      window.dispatchEvent(new Event("surface-navigation"));
    }
  }, [pathname, location.search]);
  const current = [
    ...destinations,
    ...referenceDestinations,
    profileDestination,
  ].find((d) => d.href === pathname);
  return (
    <>
      <a
        href="#main-content"
        className="sr-only fixed left-4 top-4 z-[100] rounded-md bg-primary p-3 text-primary-foreground focus:not-sr-only"
      >
        Skip to content
      </a>
      <Sidebar collapsible="icon" variant="sidebar">
        <SidebarHeader className="h-11 justify-center border-b border-sidebar-border px-2 py-0">
          <Link
            to={jobsUrl}
            onClick={() => setOpenMobile(false)}
            aria-label={
              desktopChannel === "development"
                ? "Surface Dev career workspace"
                : "Surface career workspace"
            }
            className="surface-brand flex h-8 min-w-0 items-center gap-2.5 rounded-md px-1.5 text-foreground hover:bg-hover"
          >
            <SurfaceLogo className="size-5 shrink-0" />
            <span className="truncate text-sm font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
              {desktopChannel === "development" ? "Surface Dev" : "Surface"}
            </span>
            {desktopChannel === "development" ? (
              <span className="rounded border border-warning/30 bg-warning/10 px-1 py-px font-mono text-[10px] font-medium uppercase tracking-wide text-warning group-data-[collapsible=icon]:hidden">
                Dev
              </span>
            ) : null}
          </Link>
        </SidebarHeader>
        <SidebarContent className="gap-0">
          <SidebarGroup className="p-2">
            <SidebarMenu className="gap-0.5">
              {destinations.map(({ href, label, icon: Icon }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton
                    asChild
                    isActive={destinationIsActive(pathname, href)}
                    tooltip={label}
                  >
                    <Link
                      to={href === "/" ? jobsUrl : href}
                      onClick={() => setOpenMobile(false)}
                      aria-current={
                        destinationIsActive(pathname, href) ? "page" : undefined
                      }
                      aria-label={label}
                    >
                      <Icon />
                      <span>{label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="gap-2 p-2">
          <SidebarMenu className="gap-0.5">
            {referenceDestinations.map(({ href, label, icon: Icon }) => (
              <SidebarMenuItem key={href}>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === href}
                  tooltip={label}
                >
                  <Link
                    to={href}
                    onClick={() => setOpenMobile(false)}
                    aria-current={pathname === href ? "page" : undefined}
                    aria-label={label}
                  >
                    <Icon />
                    <span>{label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
          <SidebarMenu className="border-t border-sidebar-border pt-2">
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname === "/profile"}
                tooltip="My profile"
              >
                <Link
                  to="/profile"
                  onClick={() => setOpenMobile(false)}
                  aria-label="View your profile"
                  aria-current={pathname === "/profile" ? "page" : undefined}
                  title={email || undefined}
                >
                  <UserRound />
                  <span className="min-w-0 truncate">
                    {profile.data?.context.details?.name || "My profile"}
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Sign out"
                className="min-h-11 font-medium text-muted-foreground md:min-h-8"
                onClick={() => void auth.signOut()}
                aria-label="Sign out"
                title={email ? `Sign out ${email}` : "Sign out"}
              >
                <LogOut />
                <span>Sign out</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <header
        className={`workspace-header fixed left-0 right-0 top-0 z-30 flex h-11 items-center gap-2 border-b border-border bg-background px-4 ${state === "collapsed" ? "md:left-[var(--sidebar-width-icon)]" : "md:left-[var(--sidebar-width)]"}`}
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          aria-label="Toggle navigation"
          aria-expanded={state === "expanded"}
          data-surface-nav-toggle
        >
          <PanelLeft />
        </Button>
        <Link
          to={jobsUrl}
          className="hidden text-xs text-muted-foreground hover:text-foreground sm:inline"
        >
          Workspace
        </Link>
        <ChevronRight className="hidden size-3 text-muted-foreground sm:block" />
        <Link
          to={pathname === "/settings" ? "/settings" : (current?.href ?? "/")}
          className="text-xs font-semibold hover:text-brand"
        >
          {pathname === "/settings"
            ? "Settings"
            : (current?.label ?? "Surface")}
        </Link>
        <div
          id="page-header-actions"
          className="ml-auto flex min-w-0 items-center gap-1"
        />
        <div className="desktop-caption-spacer" aria-hidden="true" />
      </header>
    </>
  );
}
function destinationIsActive(pathname: string, href: string) {
  return pathname === href;
}
function subscribe(callback: () => void) {
  window.addEventListener("surface-navigation", callback);
  return () => window.removeEventListener("surface-navigation", callback);
}

function subscribeAccount(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}
