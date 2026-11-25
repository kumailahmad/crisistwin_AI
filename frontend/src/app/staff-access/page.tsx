"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Lock, ShieldCheck } from "lucide-react";
import { DuskSky, Mountains } from "@/components/Mountains";
import { Button, Card, Field, Input, Notice } from "@/components/ui";
import { useAuth } from "@/lib/auth/AuthContext";
import { auth } from "@/lib/services";

/** Private administrator sign-in & first-run administrator initialization. */
export default function StaffAccess() {
  const { user, login, logout, bootstrapAdmin } = useAuth();
  const router = useRouter();
  const [initialized, setInitialized] = useState<boolean | null>(null);
  const [setupMode, setSetupMode] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submitting = useRef(false);

  useEffect(() => {
    if (user?.role === "admin" && !submitting.current) router.replace("/admin");
  }, [user, router]);

  useEffect(() => {
    let active = true;
    auth
      .bootstrapStatus()
      .then((s) => {
        if (!active) return;
        setInitialized(s.initialized);
        setSetupMode(!s.initialized);
      })
      .catch(() => {
        if (!active) return;
        setInitialized(true);
        setSetupMode(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    submitting.current = true;
    try {
      if (setupMode) {
        await bootstrapAdmin(email, password, fullName.trim() || undefined);
        router.replace("/admin");
        return;
      }
      const me = await login(email, password);
      if (me.role !== "admin") {
        await logout();
        submitting.current = false;
        setErr("Incorrect email or password.");
        return;
      }
      router.replace("/admin");
    } catch (e) {
      submitting.current = false;
      const m = (e as Error).message;
      setErr(setupMode ? m : /too many|429/i.test(m) ? m : /reach/i.test(m) ? m : "Incorrect email or password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden px-4 py-10">
      <DuskSky />
      <Mountains className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%] w-full" />
      <Card className="relative w-full max-w-sm p-7 animate-fadeUp">
        {initialized === null ? (
          <div className="py-10 text-center text-sm text-slate-400">Checking administrator setup status…</div>
        ) : (
          <>
            <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-sand-400/15 text-sand-300 ring-1 ring-sand-400/40">
              {setupMode ? <ShieldCheck className="h-6 w-6" /> : <Lock className="h-6 w-6" />}
            </div>
            <h1 className="text-center text-xl font-bold text-white">
              {setupMode ? "Initialize Admin Account" : "Staff sign-in"}
            </h1>
            <p className="mt-1 text-center text-xs text-slate-400">
              {setupMode
                ? "No administrator exists yet. Create the initial Command Center administrator."
                : "Authorised administrators only. Activity is logged."}
            </p>

            {setupMode && initialized === false && (
              <div className="mt-4">
                <Notice tone="cyan">
                  One-time setup locks permanently as soon as the first administrator account is created.
                </Notice>
              </div>
            )}

            <form onSubmit={submit} className="mt-5 space-y-4">
              {setupMode && (
                <Field label="Full name">
                  <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Command Coordinator" />
                </Field>
              )}
              <Field label="Email">
                <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
              </Field>
              <Field label={setupMode ? "Password (min 10 chars)" : "Password"}>
                <div className="relative">
                  <Input
                    type={show ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={setupMode ? "new-password" : "current-password"}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    aria-label={show ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                  >
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </Field>
              {err && (
                <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  {err}
                </div>
              )}
              <Button
                type="submit"
                loading={busy}
                className="w-full"
                disabled={!email || !password || (setupMode && password.length < 10)}
              >
                {setupMode ? "Create admin & open portal" : "Sign in"}
              </Button>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}
