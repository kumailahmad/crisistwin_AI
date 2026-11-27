"use client";
import { useMemo, useState } from "react";
import { KeyRound, RefreshCw, Search, ShieldCheck, UserCheck, UserX } from "lucide-react";
import { Badge, Button, Card, ConfirmDialog, ErrorState, Input, Modal, Notice, PageHeader, Select, Skeleton, useToast } from "@/components/ui";
import { useAuth } from "@/lib/auth/AuthContext";
import { fmtDate, useAsync } from "@/lib/hooks";
import { admin, districts as districtsApi } from "@/lib/services";
import type { User } from "@/lib/types";

export default function AdminUsers() {
  const toast = useToast();
  const { user: me } = useAuth();
  const q = useAsync(() => admin.users(), []);
  const ds = useAsync(() => districtsApi.list().catch(() => []), []);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [act, setAct] = useState<{ u: User; body: { role?: "user" | "admin"; is_active?: boolean }; label: string } | null>(null);
  const [resetInfo, setResetInfo] = useState<{ code: string; expires_in_minutes: number; email: string } | null>(null);
  const [issuingId, setIssuingId] = useState<number | null>(null);

  const districtNames = useMemo(
    () => new Map((ds.data ?? []).map((d) => [d.id, d.name])),
    [ds.data]
  );

  const list = useMemo(
    () =>
      (q.data ?? []).filter((u) => {
        if (roleFilter && u.role !== roleFilter) return false;
        if (statusFilter === "active" && !u.is_active) return false;
        if (statusFilter === "inactive" && u.is_active) return false;
        if (search && !`${u.full_name ?? ""} ${u.email} ${u.phone ?? ""}`.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      }),
    [q.data, search, roleFilter, statusFilter]
  );

  async function issueReset(u: User) {
    setIssuingId(u.id);
    try {
      const res = await admin.issueResetCode(u.id);
      setResetInfo(res);
    } catch (e) {
      toast("err", (e as Error).message);
    } finally {
      setIssuingId(null);
    }
  }

  if (q.error) return <ErrorState message={q.error} onRetry={q.reload} />;

  return (
    <>
      <PageHeader
        title="User management"
        subtitle="Inspect registered citizens, assign administrator roles, suspend or reactivate accounts, and issue one-time password reset codes."
        actions={
          <Button size="sm" variant="outline" onClick={q.reload} loading={q.loading}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
          <Input className="pl-9" placeholder="Search by name, email, or phone" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search users" />
        </div>
        <Select className="w-36" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label="Filter role">
          <option value="">All roles</option>
          <option value="user">User</option>
          <option value="admin">Admin</option>
        </Select>
        <Select className="w-40" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter status">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Deactivated</option>
        </Select>
      </div>
      <Card>
        {q.loading ? (
          <Skeleton className="m-5 h-32" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3">User</th>
                  <th>District / Phone</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Joined</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {list.map((u) => {
                  const self = u.id === me?.id;
                  const dist = u.district_id ? districtNames.get(u.district_id) : null;
                  return (
                    <tr key={u.id} className="text-slate-300 hover:bg-ink-800/50">
                      <td className="px-5 py-3">
                        <span className="font-medium text-white">{u.full_name ?? u.email}</span>
                        <span className="block text-xs text-slate-400">{u.email}</span>
                      </td>
                      <td className="text-xs text-slate-400">
                        <span className="block text-slate-300">{dist ?? "All Balochistan"}</span>
                        {u.phone && <span className="block font-mono">{u.phone}</span>}
                      </td>
                      <td>
                        {u.role === "admin" ? (
                          <Badge tone="cyan">
                            <ShieldCheck className="h-3 w-3" />
                            Admin
                          </Badge>
                        ) : (
                          <Badge>User</Badge>
                        )}
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {u.is_active ? <Badge tone="green">Active</Badge> : <Badge tone="red">Deactivated</Badge>}
                          {u.email_verified ? <Badge tone="cyan">Verified</Badge> : <Badge tone="amber">Unverified</Badge>}
                        </div>
                      </td>
                      <td className="text-xs text-slate-500">{u.created_at ? fmtDate(u.created_at) : "—"}</td>
                      <td className="space-x-2 whitespace-nowrap px-4 text-right">
                        <Button size="sm" variant="ghost" disabled={!u.is_active} loading={issuingId === u.id} onClick={() => issueReset(u)} title="Generate 15-min password reset code">
                          <KeyRound className="h-3.5 w-3.5" /> Reset code
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={self}
                          onClick={() =>
                            setAct({
                              u,
                              body: { role: u.role === "admin" ? "user" : "admin" },
                              label: u.role === "admin" ? "Remove admin rights from" : "Grant admin rights to",
                            })
                          }
                        >
                          {u.role === "admin" ? "Make user" : "Make admin"}
                        </Button>
                        <Button
                          size="sm"
                          variant={u.is_active ? "danger" : "outline"}
                          disabled={self}
                          onClick={() => setAct({ u, body: { is_active: !u.is_active }, label: u.is_active ? "Deactivate" : "Reactivate" })}
                        >
                          {u.is_active ? (
                            <>
                              <UserX className="h-3.5 w-3.5" />
                              Deactivate
                            </>
                          ) : (
                            <>
                              <UserCheck className="h-3.5 w-3.5" />
                              Reactivate
                            </>
                          )}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <ConfirmDialog
        open={!!act}
        title="Confirm change"
        confirmLabel="Confirm"
        message={`${act?.label} ${act?.u.email}?`}
        onClose={() => setAct(null)}
        onConfirm={async () => {
          try {
            await admin.updateUser(act!.u.id, act!.body);
            toast("ok", "User updated");
            q.reload();
          } catch (e) {
            toast("err", (e as Error).message);
          }
        }}
      />
      <Modal open={!!resetInfo} onClose={() => setResetInfo(null)} title="One-time password reset code">
        {resetInfo && (
          <div className="space-y-4 text-sm">
            <p className="text-slate-300">
              Share this temporary code with <b className="text-white">{resetInfo.email}</b> so they can set a new password on the Sign In screen:
            </p>
            <p className="rounded-xl border border-cyan-400/40 bg-ink-900 p-4 text-center font-mono text-2xl font-bold tracking-widest text-cyan-300">{resetInfo.code}</p>
            <Notice tone="cyan">Valid for {resetInfo.expires_in_minutes} minutes. Generating another code invalidates previous ones.</Notice>
          </div>
        )}
      </Modal>
    </>
  );
}
