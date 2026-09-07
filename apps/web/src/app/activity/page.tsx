import { AppShell } from "@/components/layout/app-shell";
import { ActivityScreen } from "@/features/discovery/components/activity-screen";
export default function Page() {
  return (
    <AppShell>
      <ActivityScreen />
    </AppShell>
  );
}
