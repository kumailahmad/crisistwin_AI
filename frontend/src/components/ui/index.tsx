"use client";
import { AlertTriangle, CheckCircle2, Inbox, Loader2, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useId, useState } from "react";
import { cn } from "@/lib/cn";
import { RISK_COLORS } from "@/lib/types";

/* ---------- Button ---------- */
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "outline" | "danger"; size?: "sm" | "md"; loading?: boolean };
export function Button({ variant = "primary", size = "md", loading, className, children, disabled, ...p }: BtnProps) {
  const v = {
    primary: "bg-cyan-400 text-ink-950 hover:bg-cyan-300 shadow-glow font-semibold",
    ghost: "text-slate-300 hover:bg-ink-800 hover:text-white",
    outline: "border border-line text-slate-200 hover:border-cyan-400/60 hover:bg-ink-800",
    danger: "bg-red-500/15 text-red-300 border border-red-500/40 hover:bg-red-500/25",
  }[variant];
  return (
    <button {...p} disabled={disabled || loading} className={cn("inline-flex items-center justify-center gap-2 rounded-lg transition disabled:cursor-not-allowed disabled:opacity-50", size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2.5 text-sm", v, className)}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}{children}
    </button>
  );
}

/* ---------- Card ---------- */
export const Card = ({ className, children, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div {...p} className={cn("rounded-2xl border border-line bg-ink-850/80 shadow-card backdrop-blur-sm", className)}>{children}</div>
);
export const CardHeader = ({ title, subtitle, action }: { title: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode }) => (
  <div className="flex items-start justify-between gap-3 border-b border-line/70 px-5 py-4">
    <div><h3 className="text-sm font-semibold tracking-wide text-white">{title}</h3>{subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}</div>{action}
  </div>
);

/* ---------- Badge ---------- */
const tones = { neutral: "border-line bg-ink-800 text-slate-300", cyan: "border-cyan-400/40 bg-cyan-400/10 text-cyan-300", green: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300", amber: "border-amber-400/40 bg-amber-400/10 text-amber-300", red: "border-red-400/40 bg-red-400/10 text-red-300", orange: "border-orange-400/40 bg-orange-400/10 text-orange-300" };
export const Badge = ({ tone = "neutral", className, children }: { tone?: keyof typeof tones; className?: string; children: React.ReactNode }) => (
  <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", tones[tone], className)}>{children}</span>
);
export function RiskBadge({ category }: { category: string }) {
  const c = RISK_COLORS[category] ?? RISK_COLORS.None;
  return <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold" style={{ color: c, borderColor: c + "66", background: c + "1a" }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />{category}</span>;
}
export const VerifiedBadge = ({ ok }: { ok: boolean }) => ok ? <Badge tone="green"><CheckCircle2 className="h-3 w-3" />Verified</Badge> : <Badge tone="amber">Unverified</Badge>;

/* ---------- Form ---------- */
const field = "w-full rounded-lg border border-line bg-ink-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400/70 focus:outline-none focus:ring-2 focus:ring-cyan-400/20 disabled:opacity-60";
export const Input = ({ className, ...p }: React.InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cn(field, className)} />;
export const Select = ({ className, children, ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cn(field, "pr-8", className)}>{children}</select>;
export const Textarea = ({ className, ...p }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={cn(field, "min-h-[90px]", className)} />;
export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-slate-300">{label}</span>{children}
      {hint && !error && <span className="block text-[11px] text-slate-500">{hint}</span>}
      {error && <span className="block text-[11px] text-red-300" role="alert">{error}</span>}
    </label>
  );
}

/* ---------- States ---------- */
export const Skeleton = ({ className }: { className?: string }) => <div className={cn("skeleton", className)} aria-hidden />;
export const Spinner = ({ className }: { className?: string }) => <Loader2 className={cn("h-4 w-4 animate-spin text-cyan-300", className)} />;
export const EmptyState = ({ title, text, action, icon }: { title: string; text?: string; action?: React.ReactNode; icon?: React.ReactNode }) => (
  <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
    <div className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-ink-800 text-cyan-300">{icon ?? <Inbox className="h-5 w-5" />}</div>
    <p className="text-sm font-semibold text-white">{title}</p>{text && <p className="max-w-sm text-xs text-slate-400">{text}</p>}{action}
  </div>
);
export const ErrorState = ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
  <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div className="flex-1">{message}</div>
    {onRetry && <button onClick={onRetry} className="text-xs font-semibold underline">Retry</button>}
  </div>
);
export const Notice = ({ tone = "amber", children }: { tone?: "amber" | "cyan"; children: React.ReactNode }) => (
  <div role="status" className={cn("rounded-xl border px-4 py-3 text-xs leading-relaxed", tone === "amber" ? "border-amber-400/30 bg-amber-400/10 text-amber-100" : "border-cyan-400/30 bg-cyan-400/10 text-cyan-100")}>{children}</div>
);

/* ---------- Layout bits ---------- */
export const PageHeader = ({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) => (
  <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
    <div><h1 className="text-2xl font-bold tracking-tight text-white">{title}</h1>{subtitle && <p className="mt-1 max-w-2xl text-sm text-slate-400">{subtitle}</p>}</div>{actions}
  </div>
);
export function StatCard({ label, value, hint, icon, accent = "#22d3ee" }: { label: string; value: React.ReactNode; hint?: string; icon: React.ReactNode; accent?: string }) {
  return (
    <Card className="relative overflow-hidden p-5">
      <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-20 blur-2xl" style={{ background: accent }} />
      <div className="flex items-center justify-between"><p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p><div style={{ color: accent }}>{icon}</div></div>
      <p className="mt-3 text-3xl font-bold text-white tabular-nums">{value}</p>{hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </Card>
  );
}

/* ---------- Modal + Confirm ---------- */
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[3000] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby={id} className={cn("max-h-[90vh] w-full overflow-auto rounded-2xl border border-line bg-ink-850 shadow-card animate-fadeUp", wide ? "max-w-2xl" : "max-w-md")}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4"><h2 id={id} className="text-base font-semibold text-white">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-slate-400 hover:bg-ink-800 hover:text-white"><X className="h-4 w-4" /></button></div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
export function ConfirmDialog({ open, title, message, confirmLabel = "Delete", onConfirm, onClose }: { open: boolean; title: string; message: string; confirmLabel?: string; onConfirm: () => Promise<void> | void; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-sm text-slate-300">{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="danger" loading={busy} onClick={async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); onClose(); } }}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}

/* ---------- Toasts ---------- */
type Toast = { id: number; kind: "ok" | "err"; text: string };
const ToastCtx = createContext<(kind: Toast["kind"], text: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast["kind"], text: string) => {
    const id = Date.now() + Math.random(); setItems((s) => [...s, { id, kind, text }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>{children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[4000] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={cn("pointer-events-auto flex items-start gap-2 rounded-xl border px-4 py-3 text-sm shadow-card animate-fadeUp", t.kind === "ok" ? "border-emerald-400/40 bg-emerald-950 text-emerald-100" : "border-red-400/40 bg-red-950 text-red-100")}>
            {t.kind === "ok" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}{t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
