"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Lock } from "lucide-react";
import { DuskSky, Mountains } from "@/components/Mountains";
import { Button, Card, Field, Input } from "@/components/ui";
import { useAuth } from "@/lib/auth/AuthContext";

/** Private administrator sign-in. Not linked from anywhere and excluded from search engines.
 *  Hiding the URL is only a convenience: real protection is the server-side role check, password hashing and login throttling. */
export default function StaffAccess() {
  const { user, login, logout } = useAuth(); const router = useRouter();
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const submitting = useRef(false);
  useEffect(() => { if (user?.role === "admin" && !submitting.current) router.replace("/admin"); }, [user, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null); submitting.current = true;
    try {
      const me = await login(email, password);
      if (me.role !== "admin") { logout(); submitting.current = false; setErr("Incorrect email or password."); return; }
      router.replace("/admin");
    } catch (e) { submitting.current = false; const m = (e as Error).message; setErr(/too many|429/i.test(m) ? m : /reach/i.test(m) ? m : "Incorrect email or password."); } finally { setBusy(false); }
  }
  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden px-4 py-10">
      <DuskSky /><Mountains className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%] w-full" />
      <Card className="relative w-full max-w-sm p-7 animate-fadeUp">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-sand-400/15 text-sand-300 ring-1 ring-sand-400/40"><Lock className="h-6 w-6" /></div>
        <h1 className="text-center text-xl font-bold text-white">Staff sign-in</h1>
        <p className="mt-1 text-center text-xs text-slate-400">Authorised administrators only. Activity is logged.</p>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <Field label="Email"><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" /></Field>
          <Field label="Password"><div className="relative"><Input type={show ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="pr-10" />
            <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></Field>
          {err && <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{err}</div>}
          <Button type="submit" loading={busy} className="w-full" disabled={!email || !password}>Sign in</Button>
        </form>
      </Card>
    </div>
  );
}
