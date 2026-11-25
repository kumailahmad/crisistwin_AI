/** Layered Balochistan-style ridge line illustration (barren, jagged ranges at dusk). Deterministic, pure SVG, no images. */
function rng(seed: number) { let a = seed; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function ridgePath(seed: number, base: number, amp: number, W = 1440, H = 420, steps = 7): string {
  const r = rng(seed); let pts: number[] = [base + (r() - 0.5) * amp, base + (r() - 0.5) * amp];
  let disp = amp;
  for (let s = 0; s < steps; s++) { // midpoint displacement => natural jagged skyline
    const next: number[] = [];
    for (let i = 0; i < pts.length - 1; i++) { next.push(pts[i], (pts[i] + pts[i + 1]) / 2 + (r() - 0.5) * disp); }
    next.push(pts[pts.length - 1]); pts = next; disp *= 0.6;
  }
  const dx = W / (pts.length - 1);
  return `M0 ${H} ` + pts.map((y, i) => `L${(i * dx).toFixed(1)} ${Math.max(10, Math.min(H - 5, y)).toFixed(1)}`).join(" ") + ` L${W} ${H} Z`;
}

const LAYERS = [
  { seed: 11, base: 170, amp: 260, fill: "url(#m1)", op: 0.8 },
  { seed: 23, base: 235, amp: 230, fill: "url(#m2)", op: 0.9 },
  { seed: 37, base: 295, amp: 190, fill: "url(#m3)", op: 0.9 },
  { seed: 59, base: 350, amp: 120, fill: "url(#m4)", op: 1 },
];

export function Mountains({ className = "", sun = true }: { className?: string; sun?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 1440 420" preserveAspectRatio="xMidYMax slice" aria-hidden focusable="false">
      <defs>
        <linearGradient id="m1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#b0776f" /><stop offset="1" stopColor="#4a3a62" /></linearGradient>
        <linearGradient id="m2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8a5a4d" /><stop offset="1" stopColor="#2f2848" /></linearGradient>
        <linearGradient id="m3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5b3f3c" /><stop offset="1" stopColor="#1a1d3a" /></linearGradient>
        <linearGradient id="m4" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2b2332" /><stop offset="1" stopColor="#050b17" /></linearGradient>
        <radialGradient id="sun" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#ffd98a" stopOpacity=".95" /><stop offset=".35" stopColor="#f2a65a" stopOpacity=".45" /><stop offset="1" stopColor="#f2a65a" stopOpacity="0" /></radialGradient>
      </defs>
      {sun && <circle cx="1030" cy="190" r="190" fill="url(#sun)" />}
      {LAYERS.map((l) => <path key={l.seed} d={ridgePath(l.seed, l.base, l.amp)} fill={l.fill} opacity={l.op} />)}
    </svg>
  );
}

/** Dusk sky: gradient + faint stars. Place behind <Mountains/>. */
export function DuskSky({ className = "" }: { className?: string }) {
  const r = rng(5); const stars = Array.from({ length: 70 }, () => ({ x: r() * 100, y: r() * 55, s: r() * 1.4 + 0.4, o: r() * 0.6 + 0.2 }));
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden>
      <div className="absolute inset-0 bg-gradient-to-b from-[#050b17] via-[#14183a] via-55% to-[#6b3d4f]" />
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#e8a35f]/35 to-transparent" />
      <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none">{stars.map((s, i) => <circle key={i} cx={`${s.x}%`} cy={`${s.y}%`} r={s.s} fill="#fff" opacity={s.o} />)}</svg>
    </div>
  );
}
