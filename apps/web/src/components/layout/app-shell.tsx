import { AppHeader } from "./app-header";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh">
      <AppHeader />
      <main className="mx-auto w-full max-w-[1248px] px-5 py-9 sm:px-8 sm:py-12 lg:px-10">
        {children}
      </main>
    </div>
  );
}
