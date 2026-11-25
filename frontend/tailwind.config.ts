import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { 950: "#050b17", 900: "#081224", 850: "#0b1a33", 800: "#0f2140", 700: "#16305a", 600: "#1f3f72" },
        line: "#1b2f55",
        sand: { 300: "#f3d398", 400: "#e8b469", 500: "#d9964a", 600: "#b8743a" },
        clay: { 400: "#d9805a", 500: "#c0613e" },
        cyan: { 300: "#67e8f9", 400: "#22d3ee", 500: "#06b6d4" },
        risk: { low: "#34d399", moderate: "#fbbf24", high: "#fb923c", severe: "#ef4444", none: "#64748b" },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        urdu: ["Noto Nastaliq Urdu", "Jameel Noori Nastaleeq", "Noto Naskh Arabic", "Tahoma", "serif"],
      },
      boxShadow: { glow: "0 0 0 1px rgba(34,211,238,.25), 0 8px 30px -8px rgba(34,211,238,.25)", card: "0 1px 0 rgba(255,255,255,.03) inset, 0 10px 30px -12px rgba(0,0,0,.6)" },
      keyframes: {
        fadeUp: { "0%": { opacity: "0", transform: "translateY(8px)" }, "100%": { opacity: "1", transform: "none" } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
        float: { "0%,100%": { transform: "translate(0,0)" }, "50%": { transform: "translate(24px,-18px)" } },
      },
      animation: { fadeUp: "fadeUp .4s ease-out both", float: "float 14s ease-in-out infinite", "float-slow": "float 22s ease-in-out infinite reverse" },
    },
  },
  plugins: [],
};
export default config;
