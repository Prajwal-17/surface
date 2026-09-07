import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { DiscoveryScreen } from "@/features/discovery/components/discovery-screen";
export default function HomePage() {
  return (
    <AppShell>
      <Suspense fallback={<p>Loading workspace…</p>}>
        <DiscoveryScreen />
      </Suspense>
    </AppShell>
  );
}
