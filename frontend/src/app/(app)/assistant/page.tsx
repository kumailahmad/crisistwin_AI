"use client";
import { useEffect, useRef, useState } from "react";
import { Bot, Loader2, RotateCcw, Send, ShieldAlert, User as UserIcon } from "lucide-react";
import { Badge, Button, Card, ErrorState, Notice, PageHeader, Select, Textarea } from "@/components/ui";
import { useAuth } from "@/lib/auth/AuthContext";
import { useAsync } from "@/lib/hooks";
import { cn } from "@/lib/cn";
import { assistant, districts } from "@/lib/services";

type Msg = { role: "user" | "assistant"; text: string; lang: "en" | "ur"; error?: boolean };
const SUGGEST = {
  en: ["What does a 'High' risk category mean for a district?", "How should a household prepare before heavy rain?", "What does the simulation show and what are its limits?", "Which verified shelters or hospitals are recorded for this district?"],
  ur: ["کسی ضلع کے لیے «زیادہ» خطرے کی درجہ بندی کا کیا مطلب ہے؟", "شدید بارش سے پہلے گھر والوں کو کیا تیاری کرنی چاہیے؟", "یہ سمولیشن کیا ظاہر کرتی ہے اور اس کی حدود کیا ہیں؟", "اس ضلع کے لیے کون سے تصدیق شدہ پناہ گاہیں یا ہسپتال درج ہیں؟"],
};
const KEY = "ct_chat";

export default function AssistantPage() {
  const { demo, user } = useAuth();
  const ds = useAsync(() => districts.list(), [], "districts");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState(""); const [lang, setLang] = useState<"en" | "ur">("en"); const [district, setDistrict] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const storeKey = `${KEY}_${user?.id ?? 0}`;

  useEffect(() => { try { setMsgs(JSON.parse(localStorage.getItem(storeKey) ?? "[]")); } catch { /* ignore */ } }, [storeKey]);
  useEffect(() => { try { localStorage.setItem(storeKey, JSON.stringify(msgs.slice(-60))); } catch { /* ignore */ } end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, storeKey]);

  async function send(t = text) {
    t = t.trim(); if (!t || busy || demo) return;
    setMsgs((m) => [...m, { role: "user", text: t, lang }]); setText(""); setBusy(true);
    try {
      const r = await assistant.chat({ message: t, language: lang, district_id: district ? Number(district) : null });
      setMsgs((m) => [...m, { role: "assistant", text: r.reply, lang }]);
    } catch (e) {
      const err = e as { status?: number; message: string };
      setMsgs((m) => [...m, { role: "assistant", lang, error: true, text: err.status === 503 ? "The AI assistant is not configured on the server (add GROQ_API_KEY to the backend .env)." : err.status === 429 ? "Too many requests. Please wait a minute and try again." : err.message }]);
    } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader title="AI assistant" subtitle="Ask about risk assessments, simulations and general preparedness in English or Urdu. Answers use only platform data." actions={
        <div className="flex items-center gap-2"><div className="flex rounded-lg border border-line p-0.5 text-xs">{(["en", "ur"] as const).map((l) => <button key={l} onClick={() => setLang(l)} className={cn("rounded-md px-3 py-1.5 font-medium", lang === l ? "bg-cyan-400/15 text-cyan-200" : "text-slate-400")}>{l === "en" ? "English" : "اردو"}</button>)}</div>
          <Button variant="outline" size="sm" onClick={() => { setMsgs([]); }} disabled={!msgs.length}><RotateCcw className="h-3.5 w-3.5" />Clear</Button></div>} />
      {demo && <div className="mb-4"><Notice>The assistant needs the backend (and an AI API key such as Groq on the server). It is unavailable in demo mode.</Notice></div>}
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <Card className="flex h-[calc(100vh-260px)] min-h-[460px] flex-col">
          <div className="flex-1 space-y-4 overflow-auto p-5" aria-live="polite">
            {msgs.length === 0 && (
              <div className="mx-auto mt-6 max-w-lg text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-cyan-400/10 text-cyan-300 ring-1 ring-cyan-400/30"><Bot className="h-7 w-7" /></div>
                <p className="mt-3 text-lg font-semibold text-white">{lang === "ur" ? "میں آپ کی کیسے مدد کر سکتا ہوں؟" : "How can I help?"}</p>
                <div className="mt-5 grid gap-2">{SUGGEST[lang].map((s) => <button key={s} disabled={demo || busy} dir={lang === "ur" ? "rtl" : "ltr"} onClick={() => send(s)} className={cn("rounded-xl border border-line px-4 py-2.5 text-sm text-slate-200 transition hover:border-cyan-400/50 hover:bg-ink-800 disabled:opacity-50", lang === "ur" ? "font-urdu text-right" : "text-left")}>{s}</button>)}</div></div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={cn("flex gap-3", m.role === "user" && "flex-row-reverse")}>
                <div className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full", m.role === "user" ? "bg-ink-600 text-white" : "bg-cyan-400/15 text-cyan-300")}>{m.role === "user" ? <UserIcon className="h-4 w-4" /> : <Bot className="h-4 w-4" />}</div>
                <div dir="auto" className={cn("max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed", m.lang === "ur" && "font-urdu leading-loose", m.role === "user" ? "bg-cyan-400 text-ink-950" : m.error ? "border border-red-400/40 bg-red-500/10 text-red-200" : "border border-line bg-ink-900 text-slate-200")}>{m.text}</div>
              </div>
            ))}
            {busy && <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin text-cyan-300" />Thinking…</div>}
            <div ref={end} />
          </div>
          <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-end gap-2 border-t border-line p-3">
            <Textarea dir="auto" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} maxLength={2000} placeholder={lang === "ur" ? "اپنا سوال لکھیں…" : "Type your question…  (Enter to send)"} className={cn("min-h-[44px] flex-1 resize-none", lang === "ur" && "font-urdu")} rows={1} disabled={demo} aria-label="Message" />
            <Button type="submit" loading={busy} disabled={!text.trim() || demo} aria-label="Send"><Send className="h-4 w-4" /></Button>
          </form>
        </Card>
        <div className="space-y-4">
          <Card className="space-y-3 p-4"><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Context</p>
            <Select value={district} onChange={(e) => setDistrict(e.target.value)} aria-label="District context"><option value="">No district</option>{(ds.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
            <p className="text-xs text-slate-500">Selecting a district gives the assistant its latest assessment and recorded resources.</p></Card>
          <Card className="space-y-2 p-4"><p className="flex items-center gap-2 text-sm font-semibold text-amber-200"><ShieldAlert className="h-4 w-4" />Safety notice</p>
            <p className="text-xs leading-relaxed text-slate-400">Prototype assistant, not an official warning source. It can be wrong. In an emergency, contact local authorities and rescue services immediately.</p><Badge tone="amber">Not for emergency decisions</Badge></Card>
          {ds.error && <ErrorState message={ds.error} />}
        </div>
      </div>
    </>
  );
}
