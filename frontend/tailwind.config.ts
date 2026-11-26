import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#0B1424",
          900: "#0E1A2F",
          850: "#11243A",
          800: "#162D48",
          700: "#1E3A5C",
          600: "#284B75",
        },
        ct: {
          bg: "var(--ct-bg)",
          surface: "var(--ct-surface)",
          soft: "var(--ct-surface-soft)",
          border: "var(--ct-border)",
          text: "var(--ct-text)",
          secondary: "var(--ct-text-secondary)",
          muted: "var(--ct-text-muted)",
          navy: "#0B1424",
          blue: "#11243A",
          accent: "#21C7D9",
          danger: "#DC454D",
          warning: "#E9A23B",
          success: "#16A34A",
        },
        line: "#203957",
        sand: { 300: "#f3d398", 400: "#e8b469", 500: "#d9964a", 600: "#b8743a" },
        clay: { 400: "#d9805a", 500: "#c0613e" },
        cyan: { 300: "#67e8f9", 400: "#21C7D9", 500: "#06b6d4", 600: "#0891b2", 700: "#0e7490" },
        risk: { low: "#16A34A", moderate: "#E9A23B", high: "#FB923C", severe: "#DC454D", none: "#64748b" },
      },
      fontFamily: {
        sans: ["var(--font-body)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-body)", "ui-sans-serif", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
        urdu: ["Noto Nastaliq Urdu", "Jameel Noori Nastaleeq", "Noto Naskh Arabic", "Tahoma", "serif"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(33,199,217,.28), 0 8px 28px -8px rgba(33,199,217,.24)",
        card: "var(--ct-shadow)",
      },
      keyframes: {
        fadeUp: { "0%": { opacity: "0", transform: "translateY(8px)" }, "100%": { opacity: "1", transform: "none" } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
        float: { "0%,100%": { transform: "translate(0,0)" }, "50%": { transform: "translate(24px,-18px)" } },
      },
      animation: {
        fadeUp: "fadeUp .22s cubic-bezier(0.16, 1, 0.3, 1) both",
        float: "float 14s ease-in-out infinite",
        "float-slow": "float 22s ease-in-out infinite reverse",
      },
    },
  },
  plugins: [],
};
export default config;
