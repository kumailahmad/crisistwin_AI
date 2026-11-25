"use client";
import { useEffect, useState } from "react";
import { Activity, AlertTriangle, Bot, CheckCircle2, Clock, Save } from "lucide-react";
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field, Input, Notice, PageHeader, Select, Skeleton, StatCard, useToast } from "@/components/ui";
import { fmtDate, useAsync } from "@/lib/hooks";
import { admin } from "@/lib/services";
import type { AiConfig } from "@/lib/types";

export default function AdminAiPage() {
  const toast = useToast();
  const cfgQ = useAsync(() => admin.aiConfig(), [], "admin-ai-cfg");
  const logsQ = useAsync(() => admin.aiLogs(150), [], "admin-ai-logs");

  const [enabled, setEnabled] = useState(true);
  const [pref, setPref] = useState<AiConfig["provider_preference"]>("auto");
  const [model, setModel] = useState("");
  const [rateLimit, setRateLimit] = useState("20");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!cfgQ.data) return;
    setEnabled(cfgQ.data.enabled);
    setPref(cfgQ.data.provider_preference);
    setModel(cfgQ.data.model);
    setRateLimit(String(cfgQ.data.rate_limit_per_minute));
  }, [cfgQ.data]);

  async function saveConfig() {
    setBusy(true);
    try {
      await admin.updateAiConfig({
        enabled,
        provider_preference: pref,
        model: model.trim(),
        rate_limit_per_minute: Number(rateLimit),
      });
      toast("ok", "AI configuration updated");
      cfgQ.reload();
    } catch (e) {
      toast("err", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (cfgQ.error) return <ErrorState message={cfgQ.error} onRetry={cfgQ.reload} />;

  const cfg = cfgQ.data;
  const logs = logsQ.data?.logs ?? [];
  const sum = logsQ.data?.summary;

  return (
    <>
      <PageHeader title="AI management" subtitle="Monitor assistant usage, latency, errors, rate limits, and server-side provider routing." />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total AI requests" value={sum?.total ?? "—"} icon={<Bot className="h-5 w-5" />} />
        <StatCard label="Successful replies" value={sum?.ok ?? "—"} icon={<CheckCircle2 className="h-5 w-5" />} accent="#34d399" />
        <StatCard label="Error count" value={sum?.errors ?? "—"} icon={<AlertTriangle className="h-5 w-5" />} accent="#ef4444" />
        <StatCard label="Avg latency" value={sum ? `${sum.avg_latency_ms} ms` : "—"} icon={<Clock className="h-5 w-5" />} accent="#fbbf24" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
        <Card className="h-fit">
          <CardHeader title="Model & rate-limit config" subtitle={cfg?.provider_active ? `Active provider: ${cfg.provider_active}` : "No provider key set"} />
          {cfgQ.loading || !cfg ? (
            <Skeleton className="m-5 h-48" />
          ) : (
            <div className="space-y-4 p-5">
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge tone={cfg.groq_configured ? "green" : "amber"}>GROQ_API_KEY: {cfg.groq_configured ? "Configured" : "Not set"}</Badge>
                <Badge tone={cfg.gemini_configured ? "green" : "amber"}>GEMINI_API_KEY: {cfg.gemini_configured ? "Configured" : "Not set"}</Badge>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-200">
                <input type="checkbox" className="accent-cyan-400" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
                Enable AI Assistant endpoint
              </label>
              <Field label="Provider preference">
                <Select value={pref} onChange={(e) => setPref(e.target.value as AiConfig["provider_preference"])}>
                  <option value="auto">Auto (Groq then Gemini)</option>
                  <option value="groq">Groq</option>
                  <option value="gemini">Gemini</option>
                </Select>
              </Field>
              <Field label="Model identifier">
                <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="llama-3.1-8b-instant" />
              </Field>
              <Field label="Rate limit (requests / minute / user)">
                <Input type="number" min={1} max={120} value={rateLimit} onChange={(e) => setRateLimit(e.target.value)} />
              </Field>
              <Button className="w-full" loading={busy} onClick={saveConfig}>
                <Save className="h-4 w-4" /> Save configuration
              </Button>
              <Notice tone="cyan">API keys are read only from server environment variables (`GROQ_API_KEY`, `GEMINI_API_KEY`) and are never exposed to the client.</Notice>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Request & error log" subtitle="Most recent AI assistant calls across EN / UR / BAL" />
          {logsQ.loading ? (
            <Skeleton className="m-5 h-48" />
          ) : !logs.length ? (
            <EmptyState icon={<Activity className="h-5 w-5" />} title="No AI requests logged yet" text="Requests made on the AI Assistant page appear here with latency and provider details." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Time</th>
                    <th>Lang</th>
                    <th>Provider / Model</th>
                    <th>Status</th>
                    <th>Latency</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {logs.map((l) => (
                    <tr key={l.id} className="text-slate-300">
                      <td className="px-4 py-2.5 text-xs text-slate-400">{fmtDate(l.created_at)}</td>
                      <td className="uppercase">{l.language}</td>
                      <td className="text-xs">
                        <span className="text-white">{l.provider}</span>
                        <span className="block text-slate-500">{l.model}</span>
                      </td>
                      <td>
                        <Badge tone={l.status === "ok" ? "green" : "red"}>{l.status}</Badge>
                      </td>
                      <td className="font-mono text-xs">{l.latency_ms} ms</td>
                      <td className="max-w-[220px] truncate text-xs text-slate-400">
                        {l.error_message ? <span className="text-red-300">{l.error_message}</span> : `${l.prompt_chars}→${l.reply_chars} chars`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
