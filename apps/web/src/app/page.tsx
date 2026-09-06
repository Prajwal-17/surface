import { AppShell } from "@/components/layout/app-shell";
import { DiscoveryScreen } from "@/features/discovery/components/discovery-screen";

export default function HomePage() {
  return (
    <AppShell>
      <DiscoveryScreen />
    </AppShell>
  );
}
