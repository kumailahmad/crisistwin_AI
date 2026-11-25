const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();

export const API_URL =
  configuredApiUrl && !configuredApiUrl.startsWith("http://localhost:8000")
    ? configuredApiUrl
    : "/api/v1";

export const APP_NAME = "CrisisTwin AI";
export const DISCLAIMER =
  "Prototype for academic and innovation-expo use. Risk scores and simulations are heuristic indicators, not verified flood predictions or official warnings.";
