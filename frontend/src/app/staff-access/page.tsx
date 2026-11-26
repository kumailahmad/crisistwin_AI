"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, EyeOff, KeyRound, Lock, RefreshCw, ShieldCheck } from "lucide-react";
import { DuskSky, Mountains } from "@/components/Mountains";
import { Button, Card, Field, Input, Notice } from "@/components/ui";
import { useAuth } from "@/lib/auth/AuthContext";
import { auth } from "@/lib/services";

const TYPO_DOMAINS: Record<string, string> = {
  "gamil.com": "gmail.com",
  "gmial.com": "gmail.com",
  "gmal.com": "gmail.com",
  "gnail.com": "gmail.com",
  "yaho.com": "yahoo.com",
  "hotmal.com": "hotmail.com",
  "outlok.com": "outlook.com",
};

function suggestEmailFix(value: string): string | null {
  const trimmed = value.trim();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0) return null;
  const domain = trimmed.slice(at + 1).toLowerCase();
  const fixed = TYPO_DOMAINS[domain];
  if (!fixed) return null;
  return `${trimmed.slice(0, at + 1)}${fixed}`;
}

/** Private administrator sign-in & first-run administrator initialization. */
export default function StaffAccess() {
  const { user, login, logout, bootstrapAdmin } = useAuth();
  const router = useRouter();
  const [initialized, setInitialized] = useState<boolean | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [setupMode, setSetupMode] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const submitting = useRef(false);

  useEffect(() => {
    if (user?.role === "admin" && !submitting.current) router.replace("/admin");
  }, [user, router]);

  const checkStatus = useCallback(async () => {
    setStatusError(null);
    setInitialized(null);
    try {
      const s = await auth.bootstrapStatus();
      setInitialized(s.initialized);
      setSetupMode(!s.initialized);
    } catch (e) {
      setStatusError((e as Error).message || "Unable to verify administrator setup status.");
      setInitialized(false);
      setSetupMode(false);
    }
  }, []);

  useEffect(() => {
    void checkStatus();
  }, [checkStatus]);

  const emailSuggestion = suggestEmailFix(email);
  const effectivePwMin = setupMode ? 10 : resetMode ? 8 : 1;
  const pwHint =
    setupMode && password && password.length < 10
      ? "Administrator password must be at least 10 characters."
      : resetMode && password && password.length < 8
        ? "New password must be at least 8 characters."
        : undefined;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pwHint) return;
    setBusy(true);
    setErr(null);
    setInfo(null);
    submitting.current = true;
    try {
      if (resetMode) {
        await auth.resetPassword({
          email: email.trim(),
          code: resetCode.trim(),
          new_password: password,
        });
        setResetMode(false);
        setPassword("");
        setResetCode("");
        submitting.current = false;
        setInfo("Password updated. Sign in with your new administrator password.");
        return;
      }

      if (setupMode) {
        await bootstrapAdmin(email.trim(), password, fullName.trim() || undefined);
        router.replace("/admin");
        return;
      }

      const me = await login(email.trim(), password);
      if (me.role !== "admin") {
        await logout();
        submitting.current = false;
        setErr(
          "This account is registered as a Citizen, not an Administrator. Use Citizen Sign-In on the home page or sign in with your Administrator account."
        );
        return;
      }
      router.replace("/admin");
    } catch (e) {
      submitting.current = false;
      const m = (e as Error).message;
      if (setupMode || resetMode) {
        setErr(m);
      } else if (/too many|429/i.test(m)) {
        setErr(m);
      } else if (/reach/i.test(m)) {
        setErr(m);
      } else {
        setErr("Incorrect email or password. Double-check your email spelling and password.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dark ct-command-surface relative grid min-h-screen place-items-center overflow-hidden bg-[#0B1424] px-4 py-10 text-[#EDF5FA]">
      <DuskSky />
      <Mountains className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%] w-full" />
      <div className="relative w-full max-w-sm animate-fadeUp">
        <Card className="p-7">
          {initialized === null ? (
            <div className="py-10 text-center text-sm text-slate-400">Checking administrator setup status…</div>
          ) : statusError ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-red-200">{statusError}</p>
              <Button type="button" onClick={checkStatus} className="w-full">
                <RefreshCw className="h-4 w-4" /> Retry connection
              </Button>
            </div>
          ) : (
            <>
              <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-sand-400/15 text-sand-300 ring-1 ring-sand-400/40">
                {setupMode ? <ShieldCheck className="h-6 w-6" /> : <Lock className="h-6 w-6" />}
              </div>
              <h1 className="text-center text-xl font-bold text-white">
                {resetMode
                  ? "Reset admin password"
                  : setupMode
                    ? "Initialize Admin Account"
                    : "Staff sign-in"}
              </h1>
              <p className="mt-1 text-center text-xs text-slate-400">
                {resetMode
                  ? "Enter your administrator email and one-time reset code."
                  : setupMode
                    ? "No administrator exists yet. Create the first Command Center administrator."
                    : "Authorised administrators only. Activity is logged."}
              </p>

              {setupMode && !resetMode && (
                <div className="mt-4">
                  <Notice tone="cyan">
                    First-time setup locks permanently as soon as the initial administrator account is created.
                  </Notice>
                </div>
              )}

              {info && (
                <div className="mt-4">
                  <Notice tone="cyan">{info}</Notice>
                </div>
              )}

              <form onSubmit={submit} className="mt-5 space-y-4">
                {setupMode && !resetMode && (
                  <Field label="Full name">
                    <Input
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Command Coordinator"
                    />
                  </Field>
                )}

                <Field label="Email">
                  <Input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="username"
                    placeholder="admin@example.com"
                  />
                  {emailSuggestion && (
                    <div className="mt-1.5 flex items-center justify-between gap-2 rounded-lg border border-amber-400/35 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-200">
                      <span>Did you mean {emailSuggestion}?</span>
                      <button
                        type="button"
                        onClick={() => setEmail(emailSuggestion)}
                        className="font-semibold text-[#21C7D9] hover:underline"
                      >
                        Fix email
                      </button>
                    </div>
                  )}
                </Field>

                {resetMode && (
                  <Field label="One-time reset code">
                    <Input
                      required
                      value={resetCode}
                      onChange={(e) => setResetCode(e.target.value)}
                      placeholder="Paste reset code"
                    />
                  </Field>
                )}

                <Field
                  label={
                    resetMode
                      ? "New password (min 8 chars)"
                      : setupMode
                        ? "Password (min 10 chars)"
                        : "Password"
                  }
                  error={pwHint}
                >
                  <div className="relative">
                    <Input
                      type={show ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete={setupMode || resetMode ? "new-password" : "current-password"}
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
                  <div
                    role="alert"
                    className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200"
                  >
                    {err}
                  </div>
                )}

                <Button
                  type="submit"
                  loading={busy}
                  className="w-full"
                  disabled={!email.trim() || password.length < effectivePwMin || (resetMode && !resetCode.trim())}
                >
                  {resetMode
                    ? "Update admin password"
                    : setupMode
                      ? "Create admin & open portal"
                      : "Sign in"}
                </Button>
              </form>

              {!setupMode && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                  <button
                    type="button"
                    onClick={() => {
                      setResetMode((v) => !v);
                      setErr(null);
                      setInfo(null);
                    }}
                    className="inline-flex items-center gap-1 hover:text-[#21C7D9]"
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                    {resetMode ? "Back to Staff sign-in" : "Have a reset code?"}
                  </button>
                  <Link href="/login" className="hover:text-[#21C7D9]">
                    Citizen Sign-In →
                  </Link>
                </div>
              )}

              {!setupMode && (
                <details className="mt-4 rounded-xl border border-[#203957] bg-[#0B1424]/70 px-3 py-2.5 text-xs text-slate-400">
                  <summary className="cursor-pointer font-medium text-slate-300">
                    Trouble signing in as Admin?
                  </summary>
                  <ul className="mt-2 space-y-1.5 leading-relaxed">
                    <li>• Verify exact email spelling (for example, gmail.com vs gamil.com).</li>
                    <li>• Citizen accounts registered on the public portal cannot sign in here.</li>
                    <li>
                      • Administrators can configure{" "}
                      <code className="text-[#21C7D9]">ADMIN_EMAIL</code> &amp;{" "}
                      <code className="text-[#21C7D9]">ADMIN_PASSWORD</code> in environment Secrets and restart to set or rotate credentials.
                    </li>
                  </ul>
                </details>
              )}
            </>
          )}
        </Card>

        <p className="mt-4 text-center text-xs text-slate-400">
          <Link href="/" className="inline-flex items-center gap-1 hover:text-[#21C7D9]">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Citizen Home
          </Link>
        </p>
      </div>
    </div>
  );
}
