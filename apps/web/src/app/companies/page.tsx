import { AppShell } from "@/components/layout/app-shell";
import { CompaniesScreen } from "@/features/companies/components/companies-screen";
export default function Page() {
  return (
    <AppShell>
      <CompaniesScreen />
    </AppShell>
  );
}
