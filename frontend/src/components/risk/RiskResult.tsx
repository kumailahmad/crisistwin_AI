import { Info } from "lucide-react";
import { RiskGauge } from "@/components/charts/RiskGauge";
import { Badge, Card, CardHeader, Notice } from "@/components/ui";
import { FACTOR_LABELS, RISK_COLORS, type RiskResult as R } from "@/lib/types";

const tone = (s: string) => (s === "measured" ? "green" : s === "estimate" ? "cyan" : s === "assumption" ? "amber" : s === "missing" ? "red" : "neutral") as "green" | "cyan" | "amber" | "red" | "neutral";

export function RiskResultPanel({ r, title = "Risk result", meta }: { r: R; title?: string; meta?: React.ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} subtitle={meta} />
      <div className="grid gap-6 p-5 md:grid-cols-[240px_1fr]">
        <div className="space-y-3"><RiskGauge score={r.score} category={r.category} />
          <p className="text-center text-xs text-slate-400">Data coverage <b className="text-white">{Math.round(r.coverage * 100)}%</b> of factor weight</p></div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Factor contributions</p>
          <ul className="space-y-3">
            {r.factors.map((f) => (
              <li key={f.name}>
                <div className="mb-1 flex items-center justify-between text-sm"><span className="text-slate-200">{FACTOR_LABELS[f.name] ?? f.name} <span className="text-xs text-slate-500">· weight {Math.round(f.weight * 100)}%</span></span><Badge tone={tone(f.status)}>{f.status}</Badge></div>
                {f.normalised === null ? <p className="rounded-md border border-dashed border-red-400/30 px-2 py-1 text-xs text-red-300">No data. Excluded from the score, not counted as zero.</p> : (
                  <div className="h-2 overflow-hidden rounded-full bg-ink-700"><div className="h-full rounded-full transition-all duration-700" style={{ width: `${f.normalised * 100}%`, background: RISK_COLORS[r.category] ?? "#22d3ee" }} /></div>
                )}
                {f.value !== null && <p className="mt-0.5 text-[11px] text-slate-500">input {f.value} → normalised {f.normalised}</p>}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="space-y-3 border-t border-line/70 p-5">
        <p className="flex gap-2 text-sm text-slate-300"><Info className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />{r.explanation}</p>
        <Notice>{r.disclaimer}</Notice>
      </div>
    </Card>
  );
}
