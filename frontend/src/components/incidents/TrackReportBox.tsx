"use client";
import { useEffect, useState } from "react";
import { Clock, MapPin, Search, ShieldCheck } from "lucide-react";
import { Badge, Button, Card, Field, Input } from "@/components/ui";
import { loadGuestReceipts, type GuestReceipt } from "@/lib/auth/token";
import { fmtDate } from "@/lib/hooks";
import { incidents as incidentsApi } from "@/lib/services";
import { INCIDENT_TYPES, SEVERITY, STATUS_LABEL, type IncidentStatus, type TrackedIncident } from "@/lib/types";

const STATUS_TONE: Record<IncidentStatus, "amber" | "cyan" | "green" | "red"> = {
  pending: "amber",
  under_review: "cyan",
  verified: "green",
  response_assigned: "cyan",
  resolved: "green",
  rejected: "red",
};

export function TrackReportBox({
  initialCode = "",
  initialPin = "",
  compact = false,
}: {
  initialCode?: string;
  initialPin?: string;
  compact?: boolean;
}) {
  const [code, setCode] = useState(initialCode);
  const [pin, setPin] = useState(initialPin);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<TrackedIncident | null>(null);
  const [receipts, setReceipts] = useState<GuestReceipt[]>([]);

  useEffect(() => {
    setReceipts(loadGuestReceipts());
  }, []);

  useEffect(() => {
    if (initialCode) setCode(initialCode);
    if (initialPin) setPin(initialPin);
  }, [initialCode, initialPin]);

  async function lookup(lookupCode = code, lookupPin = pin) {
    const cleanCode = lookupCode.trim().toUpperCase();
    const cleanPin = lookupPin.trim().toUpperCase();
    if (!cleanCode || !cleanPin) {
      setErr("Enter both your Reference ID and Verification PIN.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await incidentsApi.track({
        code: cleanCode,
        verification_code: cleanPin,
      });
      setResult(res);
    } catch (e) {
      setResult(null);
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const typeMeta = result ? INCIDENT_TYPES.find((t) => t.value === result.type) : null;

  return (
    <Card className={compact ? "p-4 sm:p-5" : "p-5 sm:p-6"}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          lookup();
        }}
        className="space-y-3"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Reference ID">
            <Input
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                setErr(null);
              }}
              placeholder="e.g. CT-261126-A1B2"
              className="font-mono uppercase"
              aria-label="Reference ID"
            />
          </Field>
          <Field label="Verification PIN">
            <Input
              value={pin}
              onChange={(e) => {
                setPin(e.target.value.toUpperCase());
                setErr(null);
              }}
              placeholder="8-character PIN"
              className="font-mono uppercase"
              aria-label="Verification PIN"
            />
          </Field>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-ct-muted">
            Guest reports issue a one-time Verification PIN at submission for private status tracking.
          </p>
          <Button type="submit" size="sm" variant="navy" loading={busy}>
            <Search className="h-3.5 w-3.5" />
            Track Report
          </Button>
        </div>
      </form>

      {receipts.length > 0 && (
        <div className="mt-4 border-t border-ct-border pt-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ct-muted">
            Recent submissions on this device
          </p>
          <div className="flex flex-wrap gap-2">
            {receipts.slice(0, 4).map((r) => (
              <button
                key={r.code}
                type="button"
                onClick={() => {
                  setCode(r.code);
                  setPin(r.verification_code);
                  lookup(r.code, r.verification_code);
                }}
                className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-ct-border bg-ct-soft px-2.5 py-1 text-xs font-medium text-ct-text hover:border-[#21C7D9]"
              >
                <span className="font-mono font-bold text-[#0b8a99] dark:text-[#21C7D9]">{r.code}</span>
                <span className="text-ct-muted">· Check status</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {err && (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-[#DC454D]/40 bg-[#DC454D]/10 px-3.5 py-2.5 text-xs font-medium text-[#b91c25] dark:text-red-200"
        >
          {err}
        </div>
      )}

      {result && (
        <div className="mt-4 space-y-3 rounded-xl border border-[#21C7D9]/40 bg-[#21C7D9]/8 p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-bold text-[#0b8a99] dark:text-[#21C7D9]">
                {result.code}
              </span>
              <Badge tone={STATUS_TONE[result.status]}>{STATUS_LABEL[result.status]}</Badge>
              {result.assigned_team && <Badge tone="cyan">Team: {result.assigned_team}</Badge>}
            </div>
            <span className="text-xs text-ct-muted tabular-nums">{fmtDate(result.created_at)}</span>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-ct-secondary">
            <span className="font-semibold text-ct-text">
              {typeMeta?.label ?? result.type.replace(/_/g, " ")} ({SEVERITY[result.severity].label} urgency)
            </span>
            {result.district_name && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 text-[#0b8a99] dark:text-[#21C7D9]" />
                {result.district_name}
              </span>
            )}
          </div>

          {result.admin_note && (
            <div className="rounded-lg border border-ct-border bg-ct-surface p-3 text-xs">
              <p className="flex items-center gap-1 font-bold text-[#0b8a99] dark:text-[#21C7D9]">
                <ShieldCheck className="h-3.5 w-3.5" /> Coordinator Note
              </p>
              <p className="mt-1 text-ct-text">{result.admin_note}</p>
            </div>
          )}

          {result.history?.length > 0 && (
            <ol className="space-y-1.5 border-t border-ct-border pt-2.5 text-xs">
              {result.history.map((h, i) => (
                <li key={i} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-3 w-3 text-[#0b8a99] dark:text-[#21C7D9]" />
                    <strong className="text-ct-text">{STATUS_LABEL[h.status]}</strong>
                    {h.note && <span className="text-ct-secondary">— {h.note}</span>}
                  </span>
                  <span className="text-ct-muted tabular-nums">{fmtDate(h.at)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </Card>
  );
}
