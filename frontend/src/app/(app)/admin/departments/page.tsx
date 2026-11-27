"use client";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  Bot,
  Building2,
  Clock,
  GitBranch,
  MailCheck,
  RefreshCw,
  Shield,
  Webhook,
} from "lucide-react";
import { AgentSettingsTab } from "@/components/department-manager/AgentSettingsTab";
import { AssignmentMonitorTab } from "@/components/department-manager/AssignmentMonitorTab";
import { DeliveryLogsTab } from "@/components/department-manager/DeliveryLogsTab";
import { DepartmentDirectoryTab } from "@/components/department-manager/DepartmentDirectoryTab";
import { EscalationSettingsTab } from "@/components/department-manager/EscalationSettingsTab";
import { IntegrationsTab } from "@/components/department-manager/IntegrationsTab";
import { RoutingRulesTab } from "@/components/department-manager/RoutingRulesTab";
import { Button, ErrorState, PageHeader, Skeleton } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useAsync } from "@/lib/hooks";
import { departmentManager, districts as districtsApi } from "@/lib/services";

type TabId = "directory" | "rules" | "integrations" | "agent" | "monitoring" | "escalations" | "logs";

const SUBSECTIONS: { id: TabId; label: string; icon: typeof Building2 }[] = [
  { id: "directory", label: "Department Directory", icon: Building2 },
  { id: "rules", label: "Routing Rules", icon: GitBranch },
  { id: "integrations", label: "Integrations", icon: Webhook },
  { id: "agent", label: "AI Agent Settings", icon: Bot },
  { id: "monitoring", label: "Assignment Monitoring", icon: Activity },
  { id: "escalations", label: "Escalation Settings", icon: Clock },
  { id: "logs", label: "Delivery Logs", icon: MailCheck },
];

function DepartmentManagerInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const rawTab = sp.get("tab") as TabId | null;
  const activeTab: TabId = SUBSECTIONS.some((s) => s.id === rawTab) ? (rawTab as TabId) : "directory";

  const [monitorFilters, setMonitorFilters] = useState({
    district_id: "",
    department_id: "",
    type: "",
    severity: "",
    from: "",
    to: "",
  });
  const [logFilters, setLogFilters] = useState({ channel: "", status: "" });

  const deptsQ = useAsync(() => departmentManager.listDepartments(), []);
  const districtsQ = useAsync(() => districtsApi.list().catch(() => []), []);
  const rulesQ = useAsync(() => departmentManager.listRules(), []);
  const intgsQ = useAsync(() => departmentManager.listIntegrations(), []);
  const agentQ = useAsync(() => departmentManager.getAgentConfig(), []);
  const assignQ = useAsync(
    () =>
      departmentManager.getAssignments({
        district_id: monitorFilters.district_id ? Number(monitorFilters.district_id) : undefined,
        department_id: monitorFilters.department_id ? Number(monitorFilters.department_id) : undefined,
        type: monitorFilters.type || undefined,
        severity: monitorFilters.severity || undefined,
        from: monitorFilters.from || undefined,
        to: monitorFilters.to || undefined,
      }),
    [
      monitorFilters.district_id,
      monitorFilters.department_id,
      monitorFilters.type,
      monitorFilters.severity,
      monitorFilters.from,
      monitorFilters.to,
    ]
  );
  const escQ = useAsync(() => departmentManager.getEscalations(), []);
  const logsQ = useAsync(
    () =>
      departmentManager.listDeliveryLogs({
        channel: logFilters.channel || undefined,
        status: logFilters.status || undefined,
      }),
    [logFilters.channel, logFilters.status]
  );

  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (tick === 0) return;
    deptsQ.reload();
    rulesQ.reload();
    intgsQ.reload();
    agentQ.reload();
    assignQ.reload();
    escQ.reload();
    logsQ.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  function reloadAll() {
    setTick((x) => x + 1);
  }

  function selectTab(id: TabId) {
    router.replace(`/admin/departments?tab=${id}`, { scroll: false });
  }

  const firstErr =
    deptsQ.error || rulesQ.error || intgsQ.error || agentQ.error || assignQ.error || escQ.error || logsQ.error;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Department & Agent Manager"
        subtitle="No-code management for emergency departments, deterministic routing rules, Groq incident intelligence, notification channels, SLA escalations, and delivery logs."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/department"
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-ct-border bg-ct-surface px-3 py-1.5 text-xs font-medium text-ct-text transition hover:border-[#21C7D9]"
            >
              <Shield className="h-3.5 w-3.5 text-[#21C7D9]" /> Open Department Portal
            </Link>
            <Button size="sm" variant="outline" onClick={reloadAll}>
              <RefreshCw className="h-3.5 w-3.5" /> Refresh All
            </Button>
          </div>
        }
      />

      {/* Subsection Navigation */}
      <div
        role="tablist"
        aria-label="Department Manager subsections"
        className="flex gap-1.5 overflow-x-auto rounded-2xl border border-line bg-ink-850 p-1.5"
      >
        {SUBSECTIONS.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => selectTab(id)}
              className={cn(
                "inline-flex min-h-[38px] shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-medium transition",
                active
                  ? "bg-[#21C7D9]/15 font-semibold text-[#21C7D9] ring-1 ring-[#21C7D9]/35"
                  : "text-slate-300 hover:bg-ink-800 hover:text-white"
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      {firstErr && <ErrorState message={firstErr} onRetry={reloadAll} />}

      {activeTab === "directory" &&
        (deptsQ.loading ? (
          <Skeleton className="h-44 w-full" />
        ) : (
          <DepartmentDirectoryTab
            departments={deptsQ.data ?? []}
            districts={districtsQ.data ?? []}
            onChanged={reloadAll}
          />
        ))}

      {activeTab === "rules" &&
        (rulesQ.loading || deptsQ.loading ? (
          <Skeleton className="h-44 w-full" />
        ) : (
          <RoutingRulesTab
            rules={rulesQ.data ?? []}
            departments={deptsQ.data ?? []}
            districts={districtsQ.data ?? []}
            onChanged={reloadAll}
          />
        ))}

      {activeTab === "integrations" &&
        (intgsQ.loading ? (
          <Skeleton className="h-44 w-full" />
        ) : (
          <IntegrationsTab
            integrations={intgsQ.data ?? []}
            departments={deptsQ.data ?? []}
            onChanged={reloadAll}
          />
        ))}

      {activeTab === "agent" &&
        (agentQ.loading || !agentQ.data ? (
          <Skeleton className="h-44 w-full" />
        ) : (
          <AgentSettingsTab
            config={agentQ.data.config}
            groqConfigured={agentQ.data.groq_configured}
            executionLogs={agentQ.data.execution_logs}
            onChanged={reloadAll}
          />
        ))}

      {activeTab === "monitoring" &&
        (assignQ.loading || !assignQ.data ? (
          <Skeleton className="h-44 w-full" />
        ) : (
          <AssignmentMonitorTab
            analytics={assignQ.data.analytics}
            assignments={assignQ.data.assignments}
            unassigned={assignQ.data.unassigned_incidents}
            responses={assignQ.data.responses}
            departments={deptsQ.data ?? []}
            districts={districtsQ.data ?? []}
            filters={monitorFilters}
            onFiltersChange={setMonitorFilters}
            onReload={reloadAll}
          />
        ))}

      {activeTab === "escalations" &&
        (escQ.loading || !escQ.data ? (
          <Skeleton className="h-44 w-full" />
        ) : (
          <EscalationSettingsTab
            rules={escQ.data.rules}
            logs={escQ.data.logs}
            departments={deptsQ.data ?? []}
            onChanged={reloadAll}
          />
        ))}

      {activeTab === "logs" &&
        (logsQ.loading ? (
          <Skeleton className="h-44 w-full" />
        ) : (
          <DeliveryLogsTab
            logs={logsQ.data ?? []}
            channelFilter={logFilters.channel}
            statusFilter={logFilters.status}
            onFilterChange={setLogFilters}
            onReload={reloadAll}
          />
        ))}
    </div>
  );
}

export default function AdminDepartmentsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-60 w-full" />}>
      <DepartmentManagerInner />
    </Suspense>
  );
}
