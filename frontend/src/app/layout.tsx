import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth/AuthContext";
import { ToastProvider } from "@/components/ui";

export const metadata: Metadata = {
  title: "CrisisTwin AI — Balochistan disaster intelligence",
  description: "Geospatial flood-risk exploration, hypothetical scenario simulation and emergency resource mapping for Balochistan. Academic prototype.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en"><body><AuthProvider><ToastProvider>{children}</ToastProvider></AuthProvider></body></html>
  );
}
