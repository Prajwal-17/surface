import { AppShell } from "@/components/layout/app-shell";
import { SchemaScreen } from "@/features/schema/components/schema-screen";

export default function SchemaPage() {
  return (
    <AppShell fullBleed>
      <SchemaScreen />
    </AppShell>
  );
}
