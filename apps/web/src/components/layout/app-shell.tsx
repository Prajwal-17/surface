import { AppHeader } from "./app-header";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh">
      <AppHeader />
      <main className="mx-auto w-full max-w-[1198px] px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        {children}
      </main>
    </div>
  );
}
