"use client";
import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, PlayCircle } from "lucide-react";
import { Logo } from "@/components/layout/Logo";
import { DuskSky, Mountains } from "@/components/Mountains";
import { Button, Card, Field, Input, Notice } from "@/components/ui";
import { useAuth } from "@/lib/auth/AuthContext";
import { auth } from "@/lib/services";

function LoginForm() {
  const { user, login, logout, enterDemo } = useAuth();
  const router = useRouter(); const sp = useSearchParams();
    const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [name, setName] = useState("");
  const [show, setShow] = useState(false); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const next = sp.get("next") ?? "/dashboard";
  const submitting = useRef(false);

  useEffect(() => { if (user && !submitting.current) router.replace(next); }, [user, next, router]);

  const emailErr = email && !/^\S+@\S+\.\S+$/.test(email) ? "Enter a valid email address" : undefined;
  const pwErr = mode === "register" && password && password.length < 8 ? "At least 8 characters" : undefined;

  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (emailErr || pwErr) return;
    setBusy(true); setErr(null); submitting.current = true;
    try {
      if (mode === "register") await auth.register(email, password, name || undefined);
      const me = await login(email, password);
      if (me.role === "admin") { logout(); submitting.current = false; setErr("Incorrect email or password."); return; } // staff use their own private sign-in
      router.replace(next);
    } catch (e) { submitting.current = false; setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden px-4 py-10">
      <DuskSky />
      <Mountains className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%] w-full" />
      <div className="relative w-full max-w-md animate-fadeUp">
        <div className="mb-6 flex justify-center"><Logo /></div>
        <Card className="p-7">
          <h1 className="text-xl font-bold text-white">{mode === "login" ? "Welcome back 👋" : "Join your community"}</h1>
          <p className="mt-1 text-sm text-slate-400">{mode === "login" ? "Sign in to stay informed and report problems in your area." : "Free account: explore the map, get safety info and report a crisis."}</p>
          <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
            {mode === "register" && <Field label="Full name"><Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>}
            <Field label="Email" error={emailErr}><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" /></Field>
            <Field label="Password" error={pwErr}>
              <div className="relative"><Input type={show ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} className="pr-10" />
                <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div>
            </Field>
            {err && <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{err}</div>}
            <Button type="submit" loading={busy} className="w-full" disabled={!email || !password}>{mode === "login" ? "Sign in" : "Create account"}</Button>
          </form>
          <button className="mt-4 w-full text-center text-sm text-slate-400 hover:text-cyan-300" onClick={() => { setMode(mode === "login" ? "register" : "login"); setErr(null); }}>
            {mode === "login" ? "No account? Register" : "Have an account? Sign in"}
          </button>
          <div className="my-5 flex items-center gap-3 text-xs text-slate-500"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
          <Button variant="outline" className="w-full" onClick={() => { enterDemo(); router.replace(next); }}><PlayCircle className="h-4 w-4" />Continue in demo mode</Button>
          <div className="mt-4"><Notice tone="cyan">Demo mode works without the backend. Real district boundaries are shown; risk and simulation results are computed in your browser and clearly labelled.</Notice></div>
        </Card>
        <p className="mt-5 text-center text-xs text-slate-500"><Link href="/" className="hover:text-cyan-300">← Back to home</Link></p>
      </div>
    </div>
  );
}
export default function LoginPage() { return <Suspense><LoginForm /></Suspense>; }
