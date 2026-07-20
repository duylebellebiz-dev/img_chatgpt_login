import UsageMeter from "./UsageMeter";
import PerformanceDashboard from "./PerformanceDashboard";

export default function Dashboard() {
  return (
    <div className="space-y-5">
      <UsageMeter />
      <PerformanceDashboard />
    </div>
  );
}
