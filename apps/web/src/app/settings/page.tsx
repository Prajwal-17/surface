import { AppShell } from "@/components/layout/app-shell";
import { AnalysisSettings } from "@/features/profile/components/analysis-settings";
export default function SettingsPage() {
  return (
    <AppShell>
      <h1 className="sr-only">Settings</h1>
      <AnalysisSettings />
    </AppShell>
  );
}
