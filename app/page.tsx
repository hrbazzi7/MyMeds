import { fetchDashboardData } from "@/app/actions";
import DashboardClient from "@/components/dashboard/DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const data = await fetchDashboardData();
  return <DashboardClient initialData={data} />;
}
