"use client";
import { AlertTriangle, CheckCircle2, Inbox, Loader2, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useId, useState } from "react";
import { cn } from "@/lib/cn";
import { RISK_COLORS } from "@/lib/types";

/* ---------- Button ---------- */
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "emergency" | "navy" | "ghost" | "outline" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
};

export function Button({
  variant = "primary",
  size = "md",
  loading,
  className,
  children,
  disabled,
  ...p
}: BtnProps) {
  const v = {
    primary: "bg-[#21C7D9] text-[#0B1424] hover:bg-[#3ad3e3] shadow-glow font-semibold",
    emergency: "bg-[#DC454D] text-white hover:bg-[#c53a42] shadow-sm font-bold",
    navy: "bg-[#0B1424] text-[#EDF5FA] hover:bg-[#11243A] dark:bg-[#21C7D9] dark:text-[#0B1424] font-semibold",
    ghost: "text-ct-secondary hover:bg-ct-soft hover:text-ct-text",
    outline: "border border-ct-border bg-ct-surface text-ct-text hover:border-[#21C7D9] hover:bg-ct-soft",
    danger: "bg-[#DC454D]/12 text-[#DC454D] dark:text-red-300 border border-[#DC454D]/40 hover:bg-[#DC454D]/20 font-medium",
  }[variant];
  const s = {
    sm: "min-h-[38px] px-3 py-1.5 text-xs",
    md: "min-h-[44px] px-4 py-2 text-sm",
    lg: "min-h-[52px] px-6 py-3 text-base",
  }[size];
  return (
    <button
      {...p}
      disabled={disabled || loading}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl transition duration-150 disabled:cursor-not-allowed disabled:opacity-50",
        s,
        v,
        className
      )}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

/* ---------- Card ---------- */
export const Card = ({ className, children, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    {...p}
    className={cn(
      "rounded-2xl border border-ct-border bg-ct-surface shadow-card transition-colors",
      className
    )}
  >
    {children}
  </div>
);

export const CardHeader = ({
  title,
  subtitle,
  action,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
}) => (
  <div className="flex items-start justify-between gap-3 border-b border-ct-border/80 px-5 py-4">
    <div>
      <h3 className="text-sm font-semibold tracking-wide text-ct-text">{title}</h3>
      {subtitle && <p className="mt-0.5 text-xs text-ct-muted">{subtitle}</p>}
    </div>
    {action}
  </div>
);

/* ---------- Status & Metadata Labels ---------- */
const tones = {
  neutral: "border-ct-border bg-ct-soft text-ct-secondary",
  cyan: "border-cyan-500/35 bg-cyan-500/10 text-cyan-800 dark:text-cyan-200",
  blue: "border-sky-500/35 bg-sky-500/10 text-sky-800 dark:text-sky-200",
  green: "border-emerald-600/30 bg-emerald-500/12 text-emerald-800 dark:text-emerald-300",
  amber: "border-amber-500/40 bg-amber-500/12 text-amber-900 dark:text-amber-200",
  red: "border-[#DC454D]/40 bg-[#DC454D]/12 text-[#b91c25] dark:text-red-200",
  orange: "border-orange-500/40 bg-orange-500/12 text-orange-800 dark:text-orange-200",
};

export const Badge = ({
  tone = "neutral",
  className,
  children,
}: {
  tone?: keyof typeof tones;
  className?: string;
  children: React.ReactNode;
}) => (
  <span
    className={cn(
      "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-semibold",
      tones[tone],
      className
    )}
  >
    {children}
  </span>
);

export function RiskBadge({ category }: { category: string }) {
  const c = RISK_COLORS[category] ?? RISK_COLORS.None;
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-semibold"
      style={{ color: c, borderColor: c + "66", background: c + "1a" }}
    >
      {category}
    </span>
  );
}

export const VerifiedBadge = ({ ok }: { ok: boolean }) =>
  ok ? (
    <Badge tone="green">
      <CheckCircle2 className="h-3 w-3" />
      Verified
    </Badge>
  ) : (
    <Badge tone="amber">Unverified</Badge>
  );

/* ---------- Form ---------- */
const field =
  "w-full rounded-xl border border-ct-border bg-ct-surface px-3.5 py-2.5 text-sm text-ct-text placeholder:text-ct-muted focus:border-[#21C7D9] focus:outline-none focus:ring-2 focus:ring-[#21C7D9]/25 disabled:opacity-60";

export const Input = ({ className, ...p }: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input {...p} className={cn(field, className)} />
);
export const Select = ({ className, children, ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...p} className={cn(field, "pr-8", className)}>
    {children}
  </select>
);
export const Textarea = ({ className, ...p }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea {...p} className={cn(field, "min-h-[96px]", className)} />
);
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold text-ct-secondary">{label}</span>
      {children}
      {hint && !error && <span className="block text-[11px] text-ct-muted">{hint}</span>}
      {error && (
        <span className="block text-[11px] font-medium text-[#DC454D] dark:text-red-300" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}

/* ---------- States ---------- */
export const Skeleton = ({ className }: { className?: string }) => (
  <div className={cn("skeleton", className)} aria-hidden />
);
export const Spinner = ({ className }: { className?: string }) => (
  <Loader2 className={cn("h-4 w-4 animate-spin text-[#21C7D9]", className)} />
);
export const EmptyState = ({
  title,
  text,
  action,
  icon,
}: {
  title: string;
  text?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) => (
  <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
    <div className="grid h-11 w-11 place-items-center rounded-xl border border-ct-border bg-ct-soft text-cyan-700 dark:text-[#21C7D9]">
      {icon ?? <Inbox className="h-5 w-5" />}
    </div>
    <p className="text-sm font-semibold text-ct-text">{title}</p>
    {text && <p className="max-w-sm text-xs text-ct-muted">{text}</p>}
    {action}
  </div>
);

export const ErrorState = ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
  <div
    role="alert"
    className="flex items-start gap-3 rounded-xl border border-[#DC454D]/35 bg-[#DC454D]/10 p-4 text-sm text-[#991b1b] dark:text-red-200"
  >
    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
    <div className="flex-1">{message}</div>
    {onRetry && (
      <button onClick={onRetry} className="text-xs font-semibold underline">
        Retry
      </button>
    )}
  </div>
);

export const Notice = ({
  tone = "amber",
  children,
}: {
  tone?: "amber" | "cyan";
  children: React.ReactNode;
}) => (
  <div
    role="status"
    className={cn(
      "rounded-xl border px-4 py-3 text-xs leading-relaxed",
      tone === "amber"
        ? "border-[#E9A23B]/45 bg-[#E9A23B]/12 text-amber-950 dark:text-amber-100"
        : "border-[#21C7D9]/40 bg-[#21C7D9]/10 text-slate-800 dark:text-cyan-100"
    )}
  >
    {children}
  </div>
);

/* ---------- Layout bits ---------- */
export const PageHeader = ({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) => (
  <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
    <div>
      <h1 className="text-2xl font-bold tracking-normal text-ct-text">{title}</h1>
      {subtitle && <p className="mt-1 max-w-2xl text-sm text-ct-secondary">{subtitle}</p>}
    </div>
    {actions}
  </div>
);

export function StatCard({
  label,
  value,
  hint,
  icon,
  accent = "#21C7D9",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon: React.ReactNode;
  accent?: string;
}) {
  return (
    <Card className="relative overflow-hidden p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-ct-muted">{label}</p>
        <div style={{ color: accent }}>{icon}</div>
      </div>
      <p className="mt-3 font-mono text-3xl font-bold text-ct-text tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-ct-muted">{hint}</p>}
    </Card>
  );
}

/* ---------- Modal + Confirm ---------- */
export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[3000] grid place-items-center bg-[#0B1424]/70 p-4 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        className={cn(
          "max-h-[90vh] w-full overflow-auto rounded-2xl border border-ct-border bg-ct-surface shadow-card animate-fadeUp",
          wide ? "max-w-2xl" : "max-w-md"
        )}
      >
        <div className="flex items-center justify-between border-b border-ct-border px-5 py-4">
          <h2 id={id} className="text-base font-semibold text-ct-text">
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid min-h-[36px] min-w-[36px] place-items-center rounded-lg text-ct-muted hover:bg-ct-soft hover:text-ct-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Delete",
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-sm text-ct-secondary">{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="danger"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
            } finally {
              setBusy(false);
              onClose();
            }
          }}
        >
          {confirmLabel}
        </Button>
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
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, kind, text }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div
        className="pointer-events-none fixed bottom-20 right-4 z-[4000] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2 lg:bottom-4"
        aria-live="polite"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex items-start gap-2 rounded-xl border px-4 py-3 text-sm shadow-card animate-fadeUp",
              t.kind === "ok"
                ? "border-emerald-500/40 bg-emerald-950 text-emerald-100"
                : "border-[#DC454D]/45 bg-[#3d1216] text-red-100"
            )}
          >
            {t.kind === "ok" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
