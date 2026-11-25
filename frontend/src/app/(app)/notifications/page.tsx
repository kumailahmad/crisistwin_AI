"use client";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { Button, Card, EmptyState, ErrorState, Notice, PageHeader, Skeleton, useToast } from "@/components/ui";
import { useAuth } from "@/lib/auth/AuthContext";
import { fmtDate, useAsync } from "@/lib/hooks";
import { notifications } from "@/lib/services";

export default function NotificationsPage() {
  const { demo } = useAuth();
  const toast = useToast();
  const q = useAsync(() => notifications.list(), []);

  async function markOne(id: number) {
    try {
      await notifications.markRead(id);
      q.reload();
    } catch (e) {
      toast("err", (e as Error).message);
    }
  }

  async function markAll() {
    try {
      await notifications.markAllRead();
      toast("ok", "All notifications marked read");
      q.reload();
    } catch (e) {
      toast("err", (e as Error).message);
    }
  }

  if (q.error) return <ErrorState message={q.error} onRetry={q.reload} />;
  const items = q.data?.items ?? [];
  const unread = q.data?.unread_count ?? 0;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Notifications"
        subtitle="Updates on your submitted crisis reports and published alerts matching your notification preferences."
        actions={
          unread > 0 ? (
            <Button variant="outline" size="sm" onClick={markAll}>
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read ({unread})
            </Button>
          ) : undefined
        }
      />

      {demo && (
        <div className="mb-4">
          <Notice>Notifications require a signed-in account. Manage notification preferences under Profile.</Notice>
        </div>
      )}

      <Card>
        {q.loading ? (
          <Skeleton className="m-5 h-32" />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Bell className="h-5 w-5" />}
            title="No notifications yet"
            text="When an administrator publishes a district alert or updates one of your crisis reports, it will appear here."
          />
        ) : (
          <ul className="divide-y divide-line/60">
            {items.map((n) => (
              <li key={n.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="capitalize">{n.kind}</span>
                    <span aria-hidden="true">·</span>
                    <span>{fmtDate(n.created_at)}</span>
                    {!n.read && <span className="font-semibold text-cyan-300">· Unread</span>}
                  </div>
                  <p className="mt-1 font-semibold text-white">{n.title}</p>
                  <p className="mt-0.5 text-sm text-slate-300">{n.body}</p>
                  {n.link && (
                    <Link href={n.link} className="mt-2 inline-block text-xs text-cyan-300 hover:underline">
                      Open related section
                    </Link>
                  )}
                </div>
                {!n.read && (
                  <Button variant="ghost" size="sm" onClick={() => markOne(n.id)}>
                    Mark read
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
