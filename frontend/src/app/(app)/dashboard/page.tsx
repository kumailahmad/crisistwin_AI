import { CitizenDashboard } from "@/components/citizen/CitizenDashboard";
import { getPublicAlertsCached } from "@/lib/server/store";

export const revalidate = 30;

export default async function DashboardPage() {
  const initialAlerts = await getPublicAlertsCached().catch(() => []);
  return <CitizenDashboard initialAlerts={initialAlerts} />;
}
