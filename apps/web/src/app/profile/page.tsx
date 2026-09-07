import { AppShell } from "@/components/layout/app-shell";
import { ProfileScreen } from "@/features/profile/components/profile-screen";
export default function Page() {
  return (
    <AppShell>
      <ProfileScreen />
    </AppShell>
  );
}
