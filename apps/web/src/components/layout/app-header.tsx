"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
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
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
const accountStorageKey = "surface-account";
type Account = { name: string; email: string };

const destinations = [
  { href: "/", label: "Opportunities", icon: BriefcaseBusiness },
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
  const accountRaw = useSyncExternalStore(
    subscribeAccount,
    getAccountSnapshot,
    () => null,
  );
  const account = parseAccount(accountRaw);
  const accountReady = accountRaw !== null;
  const [accountDismissed, setAccountDismissed] = useState(false);
  const [accountRequestedOpen, setAccountRequestedOpen] = useState(false);
  const [accountDraft, setAccountDraft] = useState<Account>({
    name: "",
    email: "",
  });
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
  const accountOpen =
    accountReady &&
    (accountRequestedOpen || (!account && !accountDismissed));
  function editAccount() {
    setAccountDraft(account ?? { name: "", email: "" });
    setAccountRequestedOpen(true);
  }
  function saveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = {
      name: accountDraft.name.trim(),
      email: accountDraft.email.trim(),
    };
    if (!next.name || !next.email) return;
    localStorage.setItem(accountStorageKey, JSON.stringify(next));
    window.dispatchEvent(new Event("surface-account"));
    setAccountRequestedOpen(false);
    setAccountDismissed(true);
  }
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
            <SidebarGroupLabel className="px-3 text-[11px] font-medium text-muted-foreground">
              Workspace
            </SidebarGroupLabel>
            <SidebarMenu className="mt-2 gap-1">
              {destinations.map(({ href, label, icon: Icon }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === href}
                    className="h-9 gap-3 rounded-md px-3 text-[13px] font-medium data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground"
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
            <SidebarGroupLabel className="px-3 text-[11px] font-medium text-muted-foreground/70">
              Reference
            </SidebarGroupLabel>
            <SidebarMenu className="mt-2">
              {referenceDestinations.map(({ href, label, icon: Icon }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === href}
                    className="h-8 gap-3 rounded-md px-3 text-[12px] font-medium text-sidebar-foreground/80 data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground"
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
                className="h-9 gap-3 rounded-md px-3 text-[13px]"
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
          <button
            type="button"
            className="flex min-w-0 w-full items-center gap-3 rounded-md border-t border-sidebar-border px-2 pt-4 text-left transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            onClick={editAccount}
            aria-label="Edit account details"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-full border border-brand/20 bg-brand/10 text-brand">
              <UserRound className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-foreground">
                {account?.name ?? "Your account"}
              </p>
              <p className="mt-1 truncate text-[11px] text-muted-foreground">
                {account?.email ?? "Email not set"}
              </p>
            </div>
          </button>
        </SidebarFooter>
      </Sidebar>
      <header
        className={`fixed left-0 right-0 top-0 z-30 flex h-11 items-center gap-3 border-b border-border bg-background px-4 md:px-6 ${state === "collapsed" ? "md:left-0" : "md:left-[var(--sidebar-width)]"}`}
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
      </header>
      <Dialog
        open={accountOpen}
        onOpenChange={(open) => {
          setAccountRequestedOpen(open);
          if (!open) setAccountDismissed(true);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Welcome to Surface</DialogTitle>
            <DialogDescription>
              Add your name and email to personalize the account area. These
              details stay on this device.
            </DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={saveAccount}>
            <label className="grid gap-2 text-sm font-medium">
              Name
              <Input
                autoComplete="name"
                required
                value={accountDraft.name}
                onChange={(event) =>
                  setAccountDraft({ ...accountDraft, name: event.target.value })
                }
                placeholder="Your name"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Email
              <Input
                type="email"
                autoComplete="email"
                required
                value={accountDraft.email}
                onChange={(event) =>
                  setAccountDraft({
                    ...accountDraft,
                    email: event.target.value,
                  })
                }
                placeholder="you@example.com"
              />
            </label>
            <DialogFooter>
              <Button type="submit">Save details</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
function parseAccount(raw: string | null): Account | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const { name, email } = value as Record<string, unknown>;
    if (typeof name !== "string" || typeof email !== "string") return null;
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    return trimmedName && trimmedEmail
      ? { name: trimmedName, email: trimmedEmail }
      : null;
  } catch {
    return null;
  }
}
function getAccountSnapshot() {
  return localStorage.getItem(accountStorageKey) ?? "";
}
function subscribeAccount(callback: () => void) {
  window.addEventListener("surface-account", callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("surface-account", callback);
    window.removeEventListener("storage", callback);
  };
}
function subscribe(callback: () => void) {
  window.addEventListener("surface-navigation", callback);
  return () => window.removeEventListener("surface-navigation", callback);
}
