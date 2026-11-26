"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
  Phone,
  Printer,
  Search,
  ShieldAlert,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Input,
  Notice,
  PageHeader,
  Select,
  Skeleton,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { useAsync } from "@/lib/hooks";

type Helpline = {
  id: string;
  name: string;
  number: string;
  category: string;
  scope: string;
  confidence: "official" | "secondary" | "unconfirmed" | "outdated";
  note: string;
  source: { title: string; url: string };
};

type Contacts = {
  retrieved: string;
  disclaimer: string;
  helplines: Helpline[];
  hospitals_source: { title: string; url: string };
  hospitals: { name: string; district: string; district_as_listed: string; phone: string | null }[];
  district_changes_note: string;
};

const CONF = {
  official: { tone: "green", label: "Official source" },
  secondary: { tone: "cyan", label: "Reported by secondary source" },
  unconfirmed: { tone: "amber", label: "Unconfirmed" },
  outdated: { tone: "amber", label: "Outdated source" },
} as const;

const tel = (n: string) => `tel:${n.replace(/[^\d+]/g, "")}`;

export default function EmergencyPage() {
  const q = useAsync(
    () =>
      fetch("/data/emergency_contacts.json").then((r) => {
        if (!r.ok) throw new Error("Could not load the contact directory");
        return r.json() as Promise<Contacts>;
      }),
    [],
    "contacts"
  );
  const [s, setS] = useState("");
  const [district, setDistrict] = useState("");
  const d = q.data;
  const districts = useMemo(
    () => [...new Set((d?.hospitals ?? []).map((h) => h.district))].sort(),
    [d]
  );
  const list = useMemo(
    () =>
      (d?.hospitals ?? []).filter(
        (h) =>
          (!district || h.district === district) &&
          h.name.toLowerCase().includes(s.toLowerCase())
      ),
    [d, s, district]
  );

  if (q.error) return <ErrorState message={q.error} onRetry={q.reload} />;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Emergency Contacts Directory"
        subtitle="Helplines and government hospital numbers collected from official and public sources, each labeled with its source and reliability."
        actions={
          <div className="flex flex-wrap gap-2 no-print">
            <Link
              href="/resources"
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-ct-border bg-ct-surface px-3 py-1.5 text-xs font-semibold text-ct-text hover:border-[#21C7D9]"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Get Help Overview
            </Link>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-3.5 w-3.5" /> Print
            </Button>
          </div>
        }
      />

      <div className="flex gap-3 rounded-xl border border-[#DC454D]/35 bg-[#DC454D]/10 p-4 text-sm text-[#991b1b] dark:text-red-100">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
        <p>
          <b>In an emergency call the numbers directly. Do not rely solely on this website.</b>{" "}
          {d?.disclaimer ??
            "Numbers were copied from the sources shown and have not been verified by calling them."}
          {d && <> Collected on {d.retrieved}.</>}
        </p>
      </div>

      <div>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-ct-muted">
          Helplines
        </h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {!d
            ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-44" />)
            : d.helplines.map((h) => (
                <Card key={h.id} className="flex flex-col p-5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-ct-text">{h.name}</p>
                    <Badge tone={CONF[h.confidence].tone}>{CONF[h.confidence].label}</Badge>
                  </div>
                  <a
                    href={tel(h.number)}
                    className="mt-3 inline-flex items-center gap-2 font-mono text-2xl font-extrabold tracking-wide text-cyan-700 hover:underline dark:text-[#21C7D9]"
                  >
                    <Phone className="h-5 w-5" />
                    {h.number}
                  </a>
                  <p className="mt-1 text-xs text-ct-muted">{h.scope}</p>
                  <p
                    className={cn(
                      "mt-3 flex-1 text-xs leading-relaxed",
                      h.confidence === "official" || h.confidence === "secondary"
                        ? "text-ct-secondary"
                        : "text-amber-800 dark:text-amber-200"
                    )}
                  >
                    {(h.confidence === "unconfirmed" || h.confidence === "outdated") && (
                      <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
                    )}
                    {h.note}
                  </p>
                  <a
                    href={h.source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-cyan-700 hover:underline dark:text-[#21C7D9]"
                  >
                    Source: {h.source.title}
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                </Card>
              ))}
        </div>
      </div>

      <Card>
        <CardHeader
          title="Government hospitals directory"
          subtitle={d ? `${d.hospitals.length} facilities · source: ${d.hospitals_source.title}` : ""}
          action={
            d && (
              <a
                href={d.hospitals_source.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-700 hover:underline dark:text-[#21C7D9]"
              >
                Open source PDF
                <ExternalLink className="h-3 w-3" />
              </a>
            )
          }
        />
        <div className="grid gap-2 border-b border-ct-border p-3 sm:grid-cols-[1fr_220px]">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-ct-muted" />
            <Input
              className="pl-9"
              placeholder="Search hospital name"
              value={s}
              onChange={(e) => setS(e.target.value)}
              aria-label="Search hospitals"
            />
          </div>
          <Select value={district} onChange={(e) => setDistrict(e.target.value)} aria-label="Filter by district">
            <option value="">All districts</option>
            {districts.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </Select>
        </div>
        {!d ? (
          <Skeleton className="m-5 h-40" />
        ) : list.length === 0 ? (
          <EmptyState title="No hospitals match" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-ct-muted">
                <tr>
                  <th className="px-5 py-3">Hospital</th>
                  <th>District</th>
                  <th>Contact</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ct-border/60">
                {list.map((h, i) => (
                  <tr key={h.name + i} className="text-ct-secondary hover:bg-ct-soft/50">
                    <td className="px-5 py-3 font-medium text-ct-text">{h.name}</td>
                    <td>{h.district}</td>
                    <td>
                      {h.phone ? (
                        <a
                          href={tel(h.phone)}
                          className="inline-flex items-center gap-1.5 font-mono text-cyan-700 hover:underline dark:text-[#21C7D9]"
                        >
                          <Phone className="h-3.5 w-3.5" />
                          {h.phone}
                        </a>
                      ) : (
                        <span className="text-ct-muted">Not listed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-ct-border px-5 py-3 text-xs text-ct-muted">
          Numbers are the facility contacts published by the Health Department (list dated 28 Oct 2025). Several are mobile numbers of the hospital administration, not 24-hour emergency desks.
        </p>
      </Card>
      {d && <Notice tone="cyan">{d.district_changes_note}</Notice>}
    </div>
  );
}
