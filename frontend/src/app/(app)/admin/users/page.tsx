"use client";
import { useState } from "react";
import { ShieldCheck, UserCheck, UserX } from "lucide-react";
import { Badge, Button, Card, ConfirmDialog, ErrorState, PageHeader, Skeleton, useToast } from "@/components/ui";
import { useAuth } from "@/lib/auth/AuthContext";
import { fmtDate, useAsync } from "@/lib/hooks";
import { admin } from "@/lib/services";
import type { User } from "@/lib/types";

export default function AdminUsers() {
  const toast = useToast(); const { user: me } = useAuth();
  const q = useAsync(() => admin.users(), []);
  const [act, setAct] = useState<{ u: User; body: { role?: "user" | "admin"; is_active?: boolean }; label: string } | null>(null);
  if (q.error) return <ErrorState message={q.error} onRetry={q.reload} />;
  return (
    <>
      <PageHeader title="User management" subtitle="Promote administrators or deactivate accounts. You cannot change your own role or status." />
      <Card>
        {q.loading ? <Skeleton className="m-5 h-32" /> : (
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">User</th><th>Role</th><th>Status</th><th>Joined</th><th /></tr></thead>
            <tbody className="divide-y divide-line/60">{q.data!.map((u) => { const self = u.id === me?.id; return (
              <tr key={u.id} className="text-slate-300 hover:bg-ink-800/50"><td className="px-5 py-3"><span className="font-medium text-white">{u.full_name ?? u.email}</span><span className="block text-xs text-slate-500">{u.email}</span></td>
                <td>{u.role === "admin" ? <Badge tone="cyan"><ShieldCheck className="h-3 w-3" />Admin</Badge> : <Badge>User</Badge>}</td><td>{u.is_active ? <Badge tone="green">Active</Badge> : <Badge tone="red">Deactivated</Badge>}</td><td className="text-xs text-slate-500">{(u as User & { created_at?: string }).created_at ? fmtDate((u as User & { created_at?: string }).created_at!) : "—"}</td>
                <td className="space-x-2 whitespace-nowrap px-4 text-right">
                  <Button size="sm" variant="outline" disabled={self} onClick={() => setAct({ u, body: { role: u.role === "admin" ? "user" : "admin" }, label: u.role === "admin" ? "Remove admin rights from" : "Grant admin rights to" })}>{u.role === "admin" ? "Make user" : "Make admin"}</Button>
                  <Button size="sm" variant={u.is_active ? "danger" : "outline"} disabled={self} onClick={() => setAct({ u, body: { is_active: !u.is_active }, label: u.is_active ? "Deactivate" : "Reactivate" })}>{u.is_active ? <><UserX className="h-3.5 w-3.5" />Deactivate</> : <><UserCheck className="h-3.5 w-3.5" />Reactivate</>}</Button></td></tr>
            ); })}</tbody></table></div>
        )}
      </Card>
      <ConfirmDialog open={!!act} title="Confirm change" confirmLabel="Confirm" message={`${act?.label} ${act?.u.email}?`} onClose={() => setAct(null)} onConfirm={async () => { try { await admin.updateUser(act!.u.id, act!.body); toast("ok", "User updated"); q.reload(); } catch (e) { toast("err", (e as Error).message); } }} />
    </>
  );
}
