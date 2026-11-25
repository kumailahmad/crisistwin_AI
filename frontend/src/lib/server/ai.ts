import type { AiConfig, AssistantLanguage } from "@/lib/types";

const SYSTEM_PROMPT =
  "You are the CrisisTwin AI assistant for CrisisTwin AI — Balochistan Intelligent Disaster Management, Digital Twin & Emergency Response System. " +
  "Answer in the user's requested language (English, Urdu, or Balochi). " +
  "Use ONLY the JSON context provided for any statement about districts, active alerts, verified incidents, risk assessments, simulations, hospital directory, or emergency resources. " +
  "If the context lacks an answer (such as live weather forecasts, unlisted alerts, or unlisted facilities), state clearly that you do not have that data. " +
  "Phone numbers may come ONLY from the context (official_helplines, hospital_directory_from_health_department, resources); " +
  "mention each number's confidence and advise verifying before relying on it. Never invent phone numbers, locations, official warnings, weather forecasts, or database records. " +
  "Simulation outputs are hypothetical indicators, not verified predictions. Keep answers clear, concise, and structured with short paragraphs or bullet points. For immediate life-threatening emergencies, advise calling local authorities and Police 15.";

export class AIUnavailable extends Error {}
export class AIFailure extends Error {}

export function resolveProvider(cfg?: AiConfig): "groq" | "gemini" | null {
  if (cfg && !cfg.enabled) return null;
  const pref = cfg?.provider_preference ?? (process.env.AI_PROVIDER || "auto").toLowerCase();
  const groq = process.env.GROQ_API_KEY?.trim();
  const gemini = process.env.GEMINI_API_KEY?.trim();
  if (pref === "groq") return groq ? "groq" : null;
  if (pref === "gemini") return gemini ? "gemini" : null;
  if (groq) return "groq";
  return gemini ? "gemini" : null;
}

export function activeProvider(): "groq" | "gemini" | null {
  return resolveProvider();
}

async function postWithRetry(url: string, init: RequestInit): Promise<Response> {
  for (const attempt of [0, 1]) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 30_000);
    try {
      const res = await fetch(url, { ...init, signal: ctl.signal });
      if ([429, 500, 502, 503].includes(res.status) && attempt === 0) {
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("Unreachable");
}

export async function callAi(
  prompt: string,
  opts: { language?: AssistantLanguage; config?: AiConfig } = {}
): Promise<{ reply: string; provider: string; model: string }> {
  const provider = resolveProvider(opts.config);
  if (!provider) {
    throw new AIUnavailable(
      opts.config && !opts.config.enabled
        ? "AI assistant has been temporarily disabled by an administrator"
        : "AI assistant is not configured on this server"
    );
  }

  const configuredModel = opts.config?.model?.trim();
  try {
    let text = "";
    let model = "";
    if (provider === "groq") {
      model = configuredModel || process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
      const res = await postWithRetry("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_tokens: 900,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: prompt },
          ],
        }),
      });
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      text = json.choices?.[0]?.message?.content ?? "";
    } else {
      model = configuredModel || process.env.GEMINI_MODEL || "gemini-2.0-flash";
      const res = await postWithRetry(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": process.env.GEMINI_API_KEY || "",
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            generationConfig: { temperature: 0.2 },
            contents: [{ role: "user", parts: [{ text: prompt }] }],
          }),
        }
      );
      const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    }
    if (!text.trim()) throw new AIFailure("AI provider returned an empty answer");
    return { reply: text, provider, model };
  } catch (err) {
    if (err instanceof AIUnavailable || err instanceof AIFailure) throw err;
    throw new AIFailure(err instanceof Error ? err.message : "AI provider request failed");
  }
}
