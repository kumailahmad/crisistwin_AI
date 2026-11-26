import Link from "next/link";
import { cn } from "@/lib/cn";

export function Logo({
  className,
  href = "/",
  inverse = false,
  compact = false,
}: {
  className?: string;
  href?: string;
  inverse?: boolean;
  compact?: boolean;
}) {
  return (
    <Link href={href} className={cn("flex shrink-0 items-center", compact ? "gap-2 sm:gap-2.5" : "gap-2.5", className)}>
      <span
        className={cn(
          "relative grid shrink-0 place-items-center rounded-xl border border-cyan-400/40 bg-[#0B1424] shadow-glow",
          compact ? "h-8 w-8 sm:h-9 sm:w-9" : "h-9 w-9"
        )}
      >
        <svg
          viewBox="0 0 24 24"
          className={compact ? "h-4 w-4 sm:h-5 sm:w-5" : "h-5 w-5"}
          fill="none"
          stroke="#21C7D9"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2 3 7v10l9 5 9-5V7z" />
          <path d="M3 7l9 5 9-5M12 12v10" />
        </svg>
      </span>
      <span className="leading-none">
        <span
          className={cn(
            "block font-extrabold tracking-tight",
            compact ? "text-[13px] sm:text-[15px]" : "text-[15px]",
            inverse ? "text-[#EDF5FA]" : "text-ct-text"
          )}
        >
          CRISISTWIN<span className="text-cyan-600 dark:text-[#21C7D9]"> AI</span>
        </span>
        <span
          className={cn(
            "mt-0.5 block font-semibold uppercase tracking-[.14em]",
            compact ? "text-[9px] sm:text-[10px]" : "text-[10px]",
            inverse ? "text-slate-300" : "text-ct-muted"
          )}
        >
          Balochistan
        </span>
      </span>
    </Link>
  );
}
