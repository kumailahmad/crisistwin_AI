"use client";
import { useState } from "react";
import { MailCheck, RefreshCw, RotateCcw } from "lucide-react";
import { Badge, Button, Card, EmptyState, Select, useToast } from "@/components/ui";
import { fmtDate } from "@/lib/hooks";
import { departmentManager } from "@/lib/services";
import type { NotificationLog } from "@/lib/types";

export function DeliveryLogsTab({
  logs,
  channelFilter,
  statusFilter,
  onFilterChange,
  onReload,
}: {
  logs: NotificationLog[];
  channelFilter: string;
  statusFilter: string;
  onFilterChange: (next: { channel: string; status: string }) => void;
  onReload: () => void;
}) {
  const toast = useToast();
  const [retryingId, setRetryingId] = useState<number | null>(null);

  async function retry(id: number) {
    setRetryingId(id);
    try {
      const updated = await departmentManager.retryDeliveryLog(id);
      if (updated.status === "sent") {
        toast("ok", `Delivered on retry (${updated.recipient})`);
      } else {
        toast("err", updated.error_message || "Retry failed");
      }
      onReload();
    } catch (err) {
      toast("err", (err as Error).message);
    } finally {
      setRetryingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">Notification Delivery Logs</h2>
          <p className="text-xs text-slate-400">
            Audit every dispatch across Email, HTTPS Webhooks, SMS, WhatsApp, and Push with deduplication and manual retry for failed deliveries.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            className="w-36"
            aria-label="Filter channel"
            value={channelFilter}
            onChange={(e) => onFilterChange({ channel: e.target.value, status: statusFilter })}
          >
            <option value="">All channels</option>
            <option value="email">Email</option>
            <option value="webhook">Webhook</option>
            <option value="sms">SMS</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="push">Push / In-App</option>
          </Select>
          <Select
            className="w-36"
            aria-label="Filter delivery status"
            value={statusFilter}
            onChange={(e) => onFilterChange({ channel: channelFilter, status: e.target.value })}
          >
            <option value="">All statuses</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
            <option value="retrying">Retrying</option>
            <option value="skipped">Skipped</option>
          </Select>
          <Button size="sm" variant="outline" onClick={onReload}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>
      </div>

      <Card className="p-4">
        {logs.length === 0 ? (
          <EmptyState
            icon={<MailCheck className="h-5 w-5" />}
            title="No delivery logs match"
            text="Department dispatch attempts and integration tests are recorded here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-2">Incident / Dept</th>
                  <th>Channel</th>
                  <th>Recipient</th>
                  <th>Status</th>
                  <th>Attempts</th>
                  <th>Result / Error</th>
                  <th>Time</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {logs.map((l) => (
                  <tr key={l.id} className="hover:bg-ink-800/40">
                    <td className="py-2">
                      <span className="font-mono text-cyan-300">{l.incident_code ?? "Test"}</span>
                      <span className="block text-[11px] text-slate-400">{l.department_name ?? l.event_type}</span>
                    </td>
                    <td>
                      <Badge tone="neutral">{l.channel.toUpperCase()}</Badge>
                    </td>
                    <td className="max-w-[180px] truncate font-mono text-slate-300">{l.recipient}</td>
                    <td>
                      {l.status === "sent" ? (
                        <Badge tone="green">Sent</Badge>
                      ) : l.status === "failed" ? (
                        <Badge tone="red">Failed</Badge>
                      ) : l.status === "retrying" ? (
                        <Badge tone="amber">Retrying</Badge>
                      ) : (
                        <Badge tone="neutral">{l.status}</Badge>
                      )}
                    </td>
                    <td className="font-mono tabular-nums text-slate-300">{l.attempt_count}</td>
                    <td className="max-w-[240px] truncate text-slate-300">
                      {l.error_message ? (
                        <span className="text-red-300">{l.error_message}</span>
                      ) : (
                        l.provider_response ?? "OK"
                      )}
                    </td>
                    <td className="text-slate-500">{fmtDate(l.created_at)}</td>
                    <td className="text-right">
                      {l.status === "failed" && (
                        <Button
                          size="sm"
                          variant="outline"
                          loading={retryingId === l.id}
                          onClick={() => retry(l.id)}
                        >
                          <RotateCcw className="h-3 w-3" /> Retry
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
