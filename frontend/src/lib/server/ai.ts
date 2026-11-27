import type { AiConfig, AssistantLanguage } from "@/lib/types";

const SYSTEM_PROMPT =
  "You are CRISISTWIN AI SAFETY ASSISTANT for CrisisTwin AI — Balochistan Intelligent Disaster Management, Digital Twin & Emergency Response System. " +
  "Answer clearly in the user's requested language (English, Urdu, or Balochi). " +
  "You may provide calm, standard public disaster preparedness and personal safety steps (e.g., for floods, earthquakes, fires, or landslides). " +
  "However, use ONLY the JSON context provided for ANY statement about real-world districts, active alerts, verified incidents, risk assessments, simulations, hospital directory entries, or emergency resources. " +
  "If the context lacks real-time weather forecasts, unlisted alerts, or unlisted facilities, state clearly that you do not have that live data. " +
  "Phone numbers may come ONLY from the context (official_helplines, hospital_directory_from_health_department, resources); " +
  "mention each number's confidence and advise verifying before relying on it. Never invent phone numbers, disasters, locations, official warnings, or verification status. " +
  "Simulation outputs are hypothetical indicators, not verified predictions. Keep answers concise and structured with short steps. For immediate life-threatening emergencies, direct the person immediately to call local authorities and Police 15.";

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

export const MAX_AI_PROMPT_CHARS = 14_000;

export function boundAiPrompt(prompt: string, maxChars = MAX_AI_PROMPT_CHARS): string {
  if (prompt.length <= maxChars) return prompt;
  const qIdx = prompt.lastIndexOf("\nQuestion:");
  if (qIdx > 0) {
    const qPart = prompt.slice(qIdx);
    const budget = Math.max(500, maxChars - qPart.length - 32);
    return prompt.slice(0, budget) + "\n...(context trimmed)" + qPart;
  }
  return prompt.slice(0, maxChars);
}

async function postWithRetry(url: string, init: RequestInit, timeoutMs = 25_000): Promise<Response> {
  for (const attempt of [0, 1]) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: ctl.signal });
      if ([429, 500, 502, 503].includes(res.status) && attempt === 0) {
        await new Promise((r) => setTimeout(r, 1200));
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

function resolveModel(provider: "groq" | "gemini", configured?: string): string {
  const c = configured?.trim();
  if (provider === "groq") {
    const validConfigured = c && !c.startsWith("gemini-") ? c : undefined;
    return validConfigured || process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
  }
  const validConfigured = c && c.startsWith("gemini-") ? c : undefined;
  return validConfigured || process.env.GEMINI_MODEL || "gemini-2.0-flash";
}

export async function callAi(
  rawPrompt: string,
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

  const prompt = boundAiPrompt(rawPrompt);
  const configuredModel = opts.config?.model?.trim();
  try {
    let text = "";
    let model = "";
    if (provider === "groq") {
      model = resolveModel("groq", configuredModel);
      const res = await postWithRetry("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_tokens: 750,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: prompt },
          ],
        }),
      });
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      text = json.choices?.[0]?.message?.content ?? "";
    } else {
      model = resolveModel("gemini", configuredModel);
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
            generationConfig: { temperature: 0.2, maxOutputTokens: 750 },
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

async function* parseSseStream(
  body: ReadableStream<Uint8Array>,
  extractDelta: (jsonStr: string) => string
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        const delta = extractDelta(payload);
        if (delta) yield delta;
      }
    }
    const tail = buffer.trim();
    if (tail.startsWith("data:")) {
      const payload = tail.slice(5).trim();
      if (payload && payload !== "[DONE]") {
        const delta = extractDelta(payload);
        if (delta) yield delta;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function streamAi(
  rawPrompt: string,
  opts: { language?: AssistantLanguage; config?: AiConfig } = {}
): Promise<{ stream: AsyncIterable<string>; provider: string; model: string }> {
  const provider = resolveProvider(opts.config);
  if (!provider) {
    throw new AIUnavailable(
      opts.config && !opts.config.enabled
        ? "AI assistant has been temporarily disabled by an administrator"
        : "AI assistant is not configured on this server"
    );
  }

  const prompt = boundAiPrompt(rawPrompt);
  const configuredModel = opts.config?.model?.trim();

  try {
    if (provider === "groq") {
      const model = resolveModel("groq", configuredModel);
      const res = await postWithRetry("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_tokens: 750,
          stream: true,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: prompt },
          ],
        }),
      });
      if (!res.body) throw new AIFailure("Streaming body missing");
      const stream = parseSseStream(res.body, (payload) => {
        try {
          const j = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
          return j.choices?.[0]?.delta?.content ?? "";
        } catch {
          return "";
        }
      });
      return { stream, provider, model };
    }

    const model = resolveModel("gemini", configuredModel);
    const res = await postWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY || "",
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          generationConfig: { temperature: 0.2, maxOutputTokens: 750 },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
        }),
      }
    );
    if (!res.body) throw new AIFailure("Streaming body missing");
    const stream = parseSseStream(res.body, (payload) => {
      try {
        const j = JSON.parse(payload) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
        return j.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      } catch {
        return "";
      }
    });
    return { stream, provider, model };
  } catch (err) {
    if (err instanceof AIUnavailable || err instanceof AIFailure) throw err;
    throw new AIFailure(err instanceof Error ? err.message : "AI streaming request failed");
  }
}
