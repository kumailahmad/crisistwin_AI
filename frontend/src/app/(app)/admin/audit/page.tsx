"use client";
import { useMemo, useState } from "react";
import { Badge, Card, EmptyState, ErrorState, Input, PageHeader, Select, Skeleton } from "@/components/ui";
import { fmtDate, useAsync } from "@/lib/hooks";
import { admin } from "@/lib/services";

export default function AdminAudit() {
  const logs = useAsync(() => admin.audit(500), []);
  const users = useAsync(() => admin.users(), []);
  const [action, setAction] = useState(""); const [entity, setEntity] = useState(""); const [q, setQ] = useState("");
  const emails = new Map((users.data ?? []).map((u) => [u.id, u.email]));
  const rows = useMemo(() => (logs.data ?? []).filter((l) => (!action || l.action === action) && (!entity || l.entity === entity) && JSON.stringify(l.detail ?? {}).toLowerCase().includes(q.toLowerCase())), [logs.data, action, entity, q]);
  const uniq = (k: "action" | "entity") => [...new Set((logs.data ?? []).map((l) => l[k]))].sort();
  if (logs.error) return <ErrorState message={logs.error} onRetry={logs.reload} />;
  return (
    <>
      <PageHeader title="Audit logs" subtitle="Every administrative change and sign-in is recorded. Showing the most recent 500 entries." />
      <div className="mb-4 flex flex-wrap gap-2">
        <Select className="w-40" value={action} onChange={(e) => setAction(e.target.value)} aria-label="Action"><option value="">All actions</option>{uniq("action").map((a) => <option key={a}>{a}</option>)}</Select>
        <Select className="w-40" value={entity} onChange={(e) => setEntity(e.target.value)} aria-label="Entity"><option value="">All entities</option>{uniq("entity").map((a) => <option key={a}>{a}</option>)}</Select>
        <Input className="w-64" placeholder="Search details…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search details" />
      </div>
      <Card>
        {logs.loading ? <Skeleton className="m-5 h-40" /> : !rows.length ? <EmptyState title="No log entries" /> : (
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">When</th><th>User</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
            <tbody className="divide-y divide-line/60">{rows.map((l) => <tr key={l.id} className="align-top text-slate-300"><td className="whitespace-nowrap px-5 py-2.5 text-xs text-slate-500">{fmtDate(l.created_at)}</td><td className="text-xs">{l.user_id ? emails.get(l.user_id) ?? `#${l.user_id}` : "system"}</td><td><Badge tone="cyan">{l.action}</Badge></td><td>{l.entity}{l.entity_id ? ` #${l.entity_id}` : ""}</td><td className="max-w-xs truncate font-mono text-[11px] text-slate-500" title={JSON.stringify(l.detail)}>{l.detail ? JSON.stringify(l.detail) : "—"}</td></tr>)}</tbody></table></div>
        )}
      </Card>
    </>
  );
}
