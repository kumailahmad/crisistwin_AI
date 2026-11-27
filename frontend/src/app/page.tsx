import { CitizenDashboard } from "@/components/citizen/CitizenDashboard";
import { AppShell } from "@/components/layout/AppShell";
import { getPublicAlertsCached } from "@/lib/server/store";

export const revalidate = 30;

export default async function HomePage() {
  const initialAlerts = await getPublicAlertsCached().catch(() => []);
  return (
    <AppShell>
      <CitizenDashboard initialAlerts={initialAlerts} />
    </AppShell>
  );
}
