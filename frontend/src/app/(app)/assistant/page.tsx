"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import {
  Bot,
  Loader2,
  MapPin,
  Mic,
  MicOff,
  Phone,
  RotateCcw,
  Send,
  ShieldAlert,
  Siren,
  User as UserIcon,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  ErrorState,
  PageHeader,
  Select,
  Textarea,
} from "@/components/ui";
import { useAuth } from "@/lib/auth/AuthContext";
import { cn } from "@/lib/cn";
import { useAsync } from "@/lib/hooks";
import { useCitizenLocation } from "@/lib/hooks/useCitizenLocation";
import { assistant, districts } from "@/lib/services";
import type { AssistantLanguage } from "@/lib/types";

type Msg = {
  role: "user" | "assistant";
  text: string;
  lang: AssistantLanguage;
  error?: boolean;
};

type QuickAction = {
  label: string;
  prompt: string;
};

const QUICK_ACTIONS: Record<AssistantLanguage, QuickAction[]> = {
  en: [
    { label: "What should I do during a flood?", prompt: "What should I do during a flood?" },
    { label: "How can I stay safe during an earthquake?", prompt: "How can I stay safe during an earthquake?" },
    { label: "Report an emergency.", prompt: "How do I report an emergency right now on CrisisTwin AI?" },
    { label: "Find nearby hospitals.", prompt: "Find nearby verified hospitals and rescue centers in my area." },
    { label: "Explain an emergency alert.", prompt: "Are there any verified emergency alerts right now, and what do the alert severity levels mean?" },
    { label: "Check disaster safety instructions.", prompt: "Check disaster safety instructions and preparedness steps for Balochistan households." },
  ],
  ur: [
    { label: "سیلاب کے دوران مجھے کیا کرنا چاہیے؟", prompt: "سیلاب کے دوران مجھے کیا کرنا چاہیے؟" },
    { label: "زلزلے کے دوران محفوظ کیسے رہیں؟", prompt: "زلزلے کے دوران میں خود کو اور اپنے خاندان کو محفوظ کیسے رکھوں؟" },
    { label: "ہنگامی صورتحال کی اطلاع دیں۔", prompt: "میں فوری طور پر ہنگامی صورتحال کی رپورٹ کیسے درج کروں؟" },
    { label: "قریبی ہسپتال تلاش کریں۔", prompt: "میرے علاقے میں قریبی تصدیق شدہ ہسپتال اور ریسکیو مراکز کون سے ہیں؟" },
    { label: "ہنگامی الرٹ کی وضاحت کریں۔", prompt: "کیا اس وقت کوئی تصدیق شدہ ہنگامی الرٹ موجود ہے اور الرٹ کی شدت کا کیا مطلب ہے؟" },
    { label: "قدرتی آفات سے بچاؤ کی ہدایات دیکھیں۔", prompt: "بلوچستان میں قدرتی آفات سے بچاؤ اور تیاری کی حفاظتی ہدایات بتائیں۔" },
  ],
  bal: [
    { label: "ھور ءُ ہار ءِ وھد ءَ من چے بہ کناں؟", prompt: "ھور ءُ ہار ءِ وھد ءَ من چے بہ کناں؟" },
    { label: "زمین چنڈ ءِ وھد ءَ چوں سلامت بہ بئیں؟", prompt: "زمین چنڈ ءِ وھد ءَ وت ءَ چوں سلامت دارگ بیت؟" },
    { label: "ہنگامی حال ءَ درج بہ کن ات۔", prompt: "من ہنگامی واقعہ ءِ رپورٹ چوں درج کناں؟" },
    { label: "نزدیکیں شفاخانہ شوهاز بہ کن ات۔", prompt: "منی دمگ ءَ نزدیکیں تصدیق بوتگیں شفاخانہ ءُ ریسکیو جاہ کجام اَنت؟" },
    { label: "ہنگامی الرٹ ءِ مطلب ءَ بیان بہ کن ات۔", prompt: "مرچی کجام تصدیق بوتگیں الرٹ درج اَنت ءُ الرٹ ءِ درجہ بندی ءِ مطلب چے اِنت؟" },
    { label: "آفت ءَ چہ رکّگ ءِ ہدایت چیک بہ کن ات۔", prompt: "بلوچستان ءَ قدرتی آفت ءَ چہ رکّگ ءِ حفاظتی ہدایت بیان بہ کن ات۔" },
  ],
};

const WELCOME: Record<AssistantLanguage, string> = {
  en: "Hello! I'm your CRISISTWIN emergency assistant. How can I help you stay safe today?",
  ur: "ہیلو! میں آپ کا CRISISTWIN ایمرجنسی اسسٹنٹ ہوں۔ آج آپ کی حفاظت کے لیے میں کیسے مدد کر سکتا ہوں؟",
  bal: "سلام! من شمئے CRISISTWIN ایمرجنسی کمک کار آں۔ مرچی شمئے سلامتی ءِ ھاترا چے کمک کناں؟",
};

const PLACEHOLDER: Record<AssistantLanguage, string> = {
  en: "Ask a safety question or tap a quick action above…",
  ur: "حفاظتی سوال لکھیں یا اوپر دیے گئے بٹن دبائیں…",
  bal: "سلامتی ءِ جُست ءَ نبیس ات یا بٹن ءَ بہ جن ات…",
};

const STORE_KEY = "ct_chat";

interface SpeechRecLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function getSpeechConstructor(): (new () => SpeechRecLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecLike;
    webkitSpeechRecognition?: new () => SpeechRecLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function AssistantContent() {
  const { user } = useAuth();
  const sp = useSearchParams();
  const ds = useAsync(() => districts.list(), [], "districts");
  const loc = useCitizenLocation(ds.data ?? []);

  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [lang, setLang] = useState<AssistantLanguage>("en");
  const [district, setDistrict] = useState("");
  const [shareLocation, setShareLocation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const [speechSupported, setSpeechSupported] = useState(false);

  const recRef = useRef<SpeechRecLike | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const storeKey = `${STORE_KEY}_${user?.id ?? "guest"}`;

  useEffect(() => {
    const q = sp.get("q");
    if (q) setText(q);
  }, [sp]);

  useEffect(() => {
    setSpeechSupported(Boolean(getSpeechConstructor()));
    return () => {
      try {
        recRef.current?.stop();
      } catch {
        /* ignore */
      }
    };
  }, []);

  useEffect(() => {
    if (!district && loc.selectedDistrictId) {
      setDistrict(String(loc.selectedDistrictId));
    }
  }, [district, loc.selectedDistrictId]);

  useEffect(() => {
    try {
      setMsgs(JSON.parse(localStorage.getItem(storeKey) ?? "[]"));
    } catch {
      /* ignore */
    }
  }, [storeKey]);

  useEffect(() => {
    try {
      localStorage.setItem(storeKey, JSON.stringify(msgs.slice(-60)));
    } catch {
      /* ignore */
    }
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, storeKey]);

  const isRtl = lang === "ur" || lang === "bal";

  async function toggleLocationContext() {
    if (shareLocation) {
      setShareLocation(false);
      return;
    }
    if (loc.lat != null && loc.lon != null) {
      setShareLocation(true);
      return;
    }
    const fix = await loc.requestGps();
    if (fix) setShareLocation(true);
  }

  function toggleVoice() {
    if (listening) {
      try {
        recRef.current?.stop();
      } catch {
        /* ignore */
      }
      setListening(false);
      return;
    }
    const Ctor = getSpeechConstructor();
    if (!Ctor) {
      setVoiceNote("Voice input is not supported in this browser. You can type your question below.");
      return;
    }
    setVoiceNote(null);
    try {
      const rec = new Ctor();
      rec.lang = lang === "ur" ? "ur-PK" : "en-US";
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onresult = (ev) => {
        const transcript = ev.results?.[0]?.[0]?.transcript?.trim();
        if (transcript) {
          setText((prev) => (prev ? `${prev} ${transcript}` : transcript));
        }
      };
      rec.onerror = (ev) => {
        setListening(false);
        setVoiceNote(
          ev.error === "not-allowed"
            ? "Microphone permission was denied. Enable mic access in browser settings or type below."
            : "Could not capture voice input. Please type your message."
        );
      };
      rec.onend = () => setListening(false);
      recRef.current = rec;
      setListening(true);
      rec.start();
    } catch {
      setListening(false);
      setVoiceNote("Voice input could not be started in this browser.");
    }
  }

  async function send(t = text) {
    const clean = t.trim();
    if (!clean || busy) return;
    setMsgs((m) => [...m, { role: "user", text: clean, lang }]);
    setText("");
    setBusy(true);
    try {
      const r = await assistant.chat({
        message: clean,
        language: lang,
        district_id: district ? Number(district) : null,
        latitude: shareLocation && loc.lat != null ? loc.lat : null,
        longitude: shareLocation && loc.lon != null ? loc.lon : null,
      });
      setMsgs((m) => [...m, { role: "assistant", text: r.reply, lang }]);
    } catch (e) {
      const err = e as { status?: number; message: string };
      setMsgs((m) => [
        ...m,
        {
          role: "assistant",
          lang,
          error: true,
          text:
            err.status === 503
              ? "The AI assistant is temporarily unavailable or not configured on the server. Please check Official Alerts or Emergency Help for verified information."
              : err.status === 429
                ? "Too many requests right now. Please wait a minute and try again."
                : err.message,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="CRISISTWIN AI SAFETY ASSISTANT"
        subtitle="Clear safety guidance, verified alert explanations, and nearby hospital information in English, Urdu, or Balochi."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl border border-ct-border bg-ct-surface p-0.5 text-xs">
              {(
                [
                  { id: "en", label: "English" },
                  { id: "ur", label: "اردو" },
                  { id: "bal", label: "بلوچی" },
                ] as const
              ).map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setLang(l.id)}
                  className={cn(
                    "min-h-[36px] rounded-lg px-3 py-1 font-semibold transition",
                    lang === l.id
                      ? "bg-[#21C7D9]/20 text-cyan-800 dark:text-[#21C7D9]"
                      : "text-ct-muted hover:text-ct-text"
                  )}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={() => setMsgs([])} disabled={!msgs.length}>
              <RotateCcw className="h-3.5 w-3.5" />
              New chat
            </Button>
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_310px]">
        <Card className="flex h-[calc(100vh-270px)] min-h-[500px] flex-col overflow-hidden">
          <div className="flex-1 space-y-4 overflow-auto p-5" aria-live="polite">
            {/* Grounded Welcome Header */}
            <div className="rounded-2xl border border-ct-border bg-ct-soft/70 p-4">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#21C7D9]/15 text-cyan-700 ring-1 ring-[#21C7D9]/35 dark:text-[#21C7D9]">
                  <Bot className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold uppercase tracking-wider text-cyan-700 dark:text-[#21C7D9]">
                    CRISISTWIN AI SAFETY ASSISTANT
                  </p>
                  <p
                    dir={isRtl ? "rtl" : "ltr"}
                    className={cn(
                      "mt-1 text-[15px] font-medium leading-relaxed text-ct-text",
                      isRtl && "font-urdu text-right leading-loose"
                    )}
                  >
                    {WELCOME[lang]}
                  </p>
                </div>
              </div>

              {/* All 6 Quick Action Buttons */}
              <div className="mt-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ct-muted">
                  Quick Actions
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {QUICK_ACTIONS[lang].map((q) => (
                    <button
                      key={q.label}
                      type="button"
                      disabled={busy}
                      dir={isRtl ? "rtl" : "ltr"}
                      onClick={() => send(q.prompt)}
                      className={cn(
                        "min-h-[44px] rounded-xl border border-ct-border bg-ct-surface px-3.5 py-2.5 text-sm font-medium text-ct-text transition hover:border-[#21C7D9] hover:bg-[#21C7D9]/10 disabled:opacity-50",
                        isRtl ? "font-urdu text-right" : "text-left"
                      )}
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {msgs.map((m, i) => (
              <div key={i} className={cn("flex gap-3", m.role === "user" && "flex-row-reverse")}>
                <div
                  className={cn(
                    "grid h-9 w-9 shrink-0 place-items-center rounded-full border",
                    m.role === "user"
                      ? "border-ct-border bg-[#0B1424] text-[#EDF5FA] dark:bg-[#21C7D9] dark:text-[#0B1424]"
                      : "border-[#21C7D9]/35 bg-[#21C7D9]/15 text-cyan-700 dark:text-[#21C7D9]"
                  )}
                >
                  {m.role === "user" ? <UserIcon className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                </div>
                <div
                  dir="auto"
                  className={cn(
                    "max-w-[82%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-[15px] leading-relaxed",
                    (m.lang === "ur" || m.lang === "bal") && "font-urdu leading-loose",
                    m.role === "user"
                      ? "bg-[#0B1424] text-[#EDF5FA] dark:bg-[#21C7D9] dark:text-[#0B1424]"
                      : m.error
                        ? "border border-[#DC454D]/40 bg-[#DC454D]/10 text-[#991b1b] dark:text-red-200"
                        : "border border-ct-border bg-ct-soft/75 text-ct-text"
                  )}
                >
                  {m.text}
                </div>
              </div>
            ))}

            {busy && (
              <div className="flex items-center gap-2 text-sm text-ct-muted">
                <Loader2 className="h-4 w-4 animate-spin text-cyan-700 dark:text-[#21C7D9]" />
                Checking safety guidance and verified records…
              </div>
            )}
            <div ref={endRef} />
          </div>

          {voiceNote && (
            <div className="border-t border-ct-border bg-ct-soft px-4 py-2 text-xs text-ct-secondary">
              {voiceNote}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="flex items-end gap-2 border-t border-ct-border bg-ct-surface p-3"
          >
            <Button
              type="button"
              variant={listening ? "emergency" : "outline"}
              onClick={toggleVoice}
              disabled={busy}
              title={
                speechSupported
                  ? listening
                    ? "Stop voice input"
                    : "Speak your question"
                  : "Voice input not supported in this browser"
              }
              aria-label={listening ? "Stop voice input" : "Voice input"}
              className="shrink-0 px-3"
            >
              {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>
            <Textarea
              dir="auto"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              maxLength={2000}
              placeholder={PLACEHOLDER[lang]}
              className={cn("min-h-[44px] flex-1 resize-none", isRtl && "font-urdu")}
              rows={1}
              aria-label="Message"
            />
            <Button type="submit" loading={busy} disabled={!text.trim()} aria-label="Send message">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </Card>

        {/* Context & Safety Sidebar */}
        <div className="space-y-4">
          <Card className="space-y-3 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-ct-muted">
              Your Area Context
            </p>
            <Select
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              aria-label="District context"
            >
              <option value="">All Balochistan</option>
              {(ds.data ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>

            <button
              type="button"
              onClick={toggleLocationContext}
              disabled={loc.locating}
              className={cn(
                "flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-xs font-medium transition",
                shareLocation && loc.lat != null
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
                  : "border-ct-border bg-ct-soft/60 text-ct-secondary hover:border-[#21C7D9]"
              )}
            >
              <span className="flex items-center gap-2">
                <MapPin className="h-4 w-4 shrink-0" />
                {loc.locating
                  ? "Locating GPS…"
                  : shareLocation && loc.lat != null
                    ? "GPS location shared with assistant"
                    : "Share GPS for nearby hospitals"}
              </span>
              <span className="font-mono text-[11px] uppercase">
                {shareLocation && loc.lat != null ? "ON" : "OFF"}
              </span>
            </button>
            {loc.error && <p className="text-[11px] text-amber-700 dark:text-amber-300">{loc.error}</p>}

            <p className="text-xs leading-relaxed text-ct-muted">
              Only verified alerts and recorded facilities from your selected area are used to answer location-specific questions.
            </p>
          </Card>

          <Card className="space-y-3 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-ct-text">
              <ShieldAlert className="h-4 w-4 text-[#E9A23B]" />
              Emergency Reminder
            </p>
            <p className="text-xs leading-relaxed text-ct-secondary">
              This assistant provides preparedness guidance and verified platform records. It cannot dispatch rescue vehicles directly.
            </p>
            <Badge tone="amber">Not for emergency dispatch</Badge>
            <div className="grid gap-2 pt-1">
              <a
                href="tel:15"
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#DC454D] px-4 py-2 text-xs font-bold text-white hover:bg-[#c53a42]"
              >
                <Phone className="h-4 w-4" /> Call Police 15 Now
              </a>
              <Link
                href="/report"
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-ct-border bg-ct-surface px-4 py-2 text-xs font-semibold text-ct-text hover:border-[#21C7D9]"
              >
                <Siren className="h-4 w-4 text-[#DC454D]" /> Open Report Emergency
              </Link>
            </div>
          </Card>

          {ds.error && <ErrorState message={ds.error} />}
        </div>
      </div>
    </div>
  );
}

export default function AssistantPage() {
  return (
    <Suspense>
      <AssistantContent />
    </Suspense>
  );
}
