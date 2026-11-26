"use client";
import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, KeyRound, PlayCircle } from "lucide-react";
import { Logo } from "@/components/layout/Logo";
import { DuskSky, Mountains } from "@/components/Mountains";
import { Button, Card, Field, Input, Notice } from "@/components/ui";
import { useAuth } from "@/lib/auth/AuthContext";
import { auth } from "@/lib/services";

function LoginForm() {
  const { user, login, register, logout, continueAsGuest } = useAuth();
  const router = useRouter();
  const sp = useSearchParams();
  const [mode, setMode] = useState<"login" | "register" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [resetNotice, setResetNotice] = useState<string | null>(null);
  const [verifyBanner, setVerifyBanner] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const next = sp.get("next") ?? "/";
  const submitting = useRef(false);

  useEffect(() => {
    if (user && !submitting.current && !verifyBanner) router.replace(next);
  }, [user, next, router, verifyBanner]);

  const emailErr = email && !/^\S+@\S+\.\S+$/.test(email) ? "Enter a valid email address" : undefined;
  const pwErr = (mode === "register" || mode === "reset") && password && password.length < 8 ? "At least 8 characters" : undefined;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (emailErr || pwErr) return;
    setBusy(true);
    setErr(null);
    submitting.current = true;
    try {
      if (mode === "register") {
        const reg = await register(email, password, name || undefined);
        if (reg.verification_notice) {
          setVerifyBanner(reg.verification_notice);
          submitting.current = false;
          return;
        }
        router.replace(next);
        return;
      }
      if (mode === "reset") {
        await auth.resetPassword({ email, code: resetCode, new_password: password });
        setResetNotice("Password updated. You can now sign in with your new password.");
        setMode("login");
        setPassword("");
        setResetCode("");
        submitting.current = false;
        return;
      }
      const me = await login(email, password);
      if (me.role === "admin") {
        await logout();
        submitting.current = false;
        setErr("Administrators sign in through the private staff portal.");
        return;
      }
      router.replace(next);
    } catch (e) {
      submitting.current = false;
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function askReset() {
    if (!email || emailErr) {
      setErr("Enter your account email address first.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await auth.requestPasswordReset(email);
      setResetNotice(res.message);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dark ct-command-surface relative grid min-h-screen place-items-center overflow-hidden bg-[#0B1424] px-4 py-10 text-[#EDF5FA]">
      <DuskSky />
      <Mountains className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%] w-full" />
      <div className="relative w-full max-w-md animate-fadeUp">
        <div className="mb-6 flex justify-center">
          <Logo inverse />
        </div>
        <Card className="p-7">
          {verifyBanner ? (
            <div className="space-y-4">
              <h1 className="text-xl font-bold text-white">Account created</h1>
              <Notice tone="cyan">{verifyBanner}</Notice>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => router.replace("/profile")}>
                  Go to Profile &amp; verify
                </Button>
                <Button variant="outline" onClick={() => router.replace(next)}>
                  Continue
                </Button>
              </div>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-bold text-white">
                {mode === "login" ? "Citizen sign-in" : mode === "register" ? "Create citizen account" : "Reset password"}
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                {mode === "login"
                  ? "Sign in to view district alerts, track reports, and locate emergency help."
                  : mode === "register"
                    ? "Free account for Balochistan residents and volunteers."
                    : "Enter the one-time reset code issued for your account."}
              </p>

              <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
                {mode === "register" && (
                  <Field label="Full name">
                    <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                  </Field>
                )}
                <Field label="Email" error={emailErr}>
                  <Input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    placeholder="you@example.com"
                  />
                </Field>
                {mode === "reset" && (
                  <Field label="One-time reset code">
                    <div className="flex gap-2">
                      <Input value={resetCode} onChange={(e) => setResetCode(e.target.value)} placeholder="Paste code" />
                      <Button type="button" variant="outline" size="sm" onClick={askReset} loading={busy}>
                        Request
                      </Button>
                    </div>
                  </Field>
                )}
                <Field label={mode === "reset" ? "New password" : "Password"} error={pwErr}>
                  <div className="relative">
                    <Input
                      type={show ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete={mode === "login" ? "current-password" : "new-password"}
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
                {resetNotice && <Notice tone="cyan">{resetNotice}</Notice>}
                {err && (
                  <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                    {err}
                  </div>
                )}
                <Button
                  type="submit"
                  loading={busy}
                  className="w-full"
                  disabled={!email || !password || (mode === "reset" && !resetCode)}
                >
                  {mode === "login" ? "Sign in" : mode === "register" ? "Create account" : "Reset password"}
                </Button>
              </form>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                <button
                  type="button"
                  className="hover:text-cyan-300"
                  onClick={() => {
                    setMode(mode === "login" ? "register" : "login");
                    setErr(null);
                    setResetNotice(null);
                  }}
                >
                  {mode === "login" ? "No account? Register" : "Back to sign-in"}
                </button>
                {mode !== "reset" && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-cyan-300"
                    onClick={() => {
                      setMode("reset");
                      setErr(null);
                      setResetNotice(null);
                    }}
                  >
                    <KeyRound className="h-3 w-3" /> Forgot password?
                  </button>
                )}
              </div>

              <div className="my-5 flex items-center gap-3 text-xs text-slate-500">
                <span className="h-px flex-1 bg-line" />
                or
                <span className="h-px flex-1 bg-line" />
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  continueAsGuest();
                  router.replace(next);
                }}
              >
                <PlayCircle className="h-4 w-4" />
                Continue as Guest
              </Button>
              <div className="mt-4">
                <Notice tone="cyan">
                  Guest access lets you submit emergency reports, view verified alerts, find hospitals, and use the AI safety assistant without an account.
                </Notice>
              </div>
            </>
          )}
        </Card>
        <p className="mt-5 text-center text-xs text-slate-500">
          <Link href="/" className="hover:text-cyan-300">
            ← Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
