import type { Metadata, Viewport } from "next";
import { DM_Sans, JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth/AuthContext";
import { ToastProvider } from "@/components/ui";
import { PWAProvider } from "@/components/pwa/PWAProvider";
import { ThemeProvider } from "@/lib/theme/ThemeContext";

const displayFont = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

const bodyFont = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

const monoFont = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#0B1424",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "CrisisTwin AI — Balochistan Disaster Management & Digital Twin",
  description:
    "Balochistan Intelligent Disaster Management, Digital Twin & Emergency Response System. Predict Risks. Simulate Disasters. Save Lives.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "CrisisTwin AI",
  },
  icons: {
    icon: [
      { url: "/pwa-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/pwa-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${displayFont.variable} ${bodyFont.variable} ${monoFont.variable}`}>
      <body>
        <ThemeProvider>
          <PWAProvider>
            <AuthProvider>
              <ToastProvider>{children}</ToastProvider>
            </AuthProvider>
          </PWAProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
