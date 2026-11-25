import { RISK_COLORS } from "@/lib/types";

/** Semi-circular score gauge, 0..100. Shows "N/A" when no score could be produced. */
export function RiskGauge({ score, category }: { score: number | null; category: string }) {
  const r = 78, c = Math.PI * r, color = RISK_COLORS[category] ?? RISK_COLORS.None;
  const pct = score === null ? 0 : Math.max(0, Math.min(100, score)) / 100;
  return (
    <div className="relative mx-auto w-full max-w-[240px]" role="img" aria-label={score === null ? "No score available" : `Risk score ${score} out of 100, ${category}`}>
      <svg viewBox="0 0 200 118" className="w-full">
        <path d="M 22 100 A 78 78 0 0 1 178 100" fill="none" stroke="#16305a" strokeWidth="14" strokeLinecap="round" />
        <path d="M 22 100 A 78 78 0 0 1 178 100" fill="none" stroke={color} strokeWidth="14" strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} style={{ transition: "stroke-dasharray .8s ease", filter: `drop-shadow(0 0 6px ${color}88)` }} />
      </svg>
      <div className="absolute inset-x-0 bottom-1 text-center">
        <div className="text-4xl font-extrabold text-white tabular-nums">{score === null ? "N/A" : score.toFixed(1)}</div>
        <div className="text-xs font-semibold uppercase tracking-widest" style={{ color }}>{category}</div>
      </div>
    </div>
  );
}
