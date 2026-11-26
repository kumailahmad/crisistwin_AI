import { CitizenDashboard } from "@/components/citizen/CitizenDashboard";
import { AppShell } from "@/components/layout/AppShell";

export default function HomePage() {
  return (
    <AppShell>
      <CitizenDashboard />
    </AppShell>
  );
}
