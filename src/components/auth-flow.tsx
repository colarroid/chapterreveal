"use client";

import { LoaderCircle, Pencil } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { AuthButton, AuthField, AuthShell, GoogleMark, googleAuthEnabled } from "./auth";
import { Notice } from "./ui";

// Email first, then password, as on terms.so. The password field is in the
// page from the start (collapsed), so a password manager fills both at once;
// when it has, Continue signs in straight away and skips the second step.

type Mode = "signin" | "signup";

/** Past this, the email check gives way and the flow carries on. */
const CHECK_TIMEOUT_MS = 3000;

const COPY = {
  signin: {
    title: "Sign in",
    subtitle: "Welcome back. Sign in to open your church's console.",
    switchText: "Don't have an account?",
    switchLabel: "Sign up",
    switchHref: "/signup",
  },
  signup: {
    title: "Create your account",
    subtitle: "Set up your church in a few minutes. You'll name it next.",
    switchText: "Already have an account?",
    switchLabel: "Sign in",
    switchHref: "/login",
  },
};

export function AuthFlow({
  mode,
  invite = "",
  notice,
  initialEmail = "",
}: {
  mode: Mode;
  invite?: string;
  notice?: string;
  initialEmail?: string;
}) {
  const router = useRouter();
  const copy = COPY[mode];
  // Sign in is one screen (email and password together). Sign up goes email
  // first, then the rest.
  const oneStep = mode === "signin";
  const [step, setStep] = useState<"email" | "password">("email");
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [resent, setResent] = useState(false);
  const [sent, setSent] = useState(false);
  const [exists, setExists] = useState(false);
  const [checking, setChecking] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (mode === "signin" && initialEmail) passwordRef.current?.focus();
  }, [mode, initialEmail]);

  const next = mode === "signup" ? (invite ? `/onboarding?invite=${encodeURIComponent(invite)}` : "/onboarding") : "/dashboard";
  const callback = () => `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function finish() {
    setBusy(true);
    setError("");
    setUnconfirmed(false);
    const supabase = supabaseBrowser();
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setBusy(false);
        if (error.code === "email_not_confirmed") setUnconfirmed(true);
        else setError(error.message === "Invalid login credentials" ? "That email and password don't match." : error.message);
        return;
      }
      router.replace("/dashboard");
      router.refresh();
      return;
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: callback(),
        // Copied into the profiles table by a database trigger.
        data: { first_name: firstName.trim(), last_name: lastName.trim(), phone: phone.trim() },
      },
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    // A confirmed account already has this email. Supabase sends nothing and
    // returns a user with no identities rather than an error.
    if (data.user && data.user.identities?.length === 0) {
      setExists(true);
      return;
    }
    setSent(true);
  }

  /**
   * Whether the email has an account: true, false, or null when the check
   * couldn't run (offline, slow, or the database function missing). Null
   * lets the flow carry on; the sign in or sign up itself still reports a
   * wrong email, so nobody is ever stuck on this step.
   */
  async function hasAccount(address: string): Promise<boolean | null> {
    const check = supabaseBrowser()
      .rpc("email_has_account", { p_email: address })
      .then(({ data, error }) => (error || typeof data !== "boolean" ? null : data));
    const timeout = new Promise<null>((r) => setTimeout(() => r(null), CHECK_TIMEOUT_MS));
    return Promise.race([check, timeout]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // Sign in: one request. A wrong email and a wrong password get the same
    // answer, so sign in never reveals which emails have accounts.
    if (oneStep || step !== "email") {
      void finish();
      return;
    }
    // Sign up: confirm the email is free before asking for anything else.
    setChecking(true);
    setExists(false);
    setError("");
    const found = await hasAccount(email);
    setChecking(false);
    if (found === true) {
      setExists(true);
      return;
    }
    // The name field is first on the next step and focuses itself.
    setStep("password");
  }

  async function google() {
    setError("");
    const { error } = await supabaseBrowser().auth.signInWithOAuth({ provider: "google", options: { redirectTo: callback() } });
    if (error) setError(error.message);
  }

  async function resend() {
    await supabaseBrowser().auth.resend({ type: "signup", email, options: { emailRedirectTo: `${location.origin}/auth/callback?next=/onboarding` } });
    setResent(true);
  }

  if (sent) {
    return (
      <AuthShell
        title="Check your email"
        subtitle={
          <>
            Click the link we sent to <span className="font-medium text-ink">{email}</span> to verify your account.
          </>
        }
        footer={
          <button type="button" onClick={() => setSent(false)} className="font-medium text-accent hover:underline">
            Use a different email
          </button>
        }
      >
        <ResendLink email={email} redirectTo={callback()} />
      </AuthShell>
    );
  }

  const onPassword = step === "password";
  const showPassword = oneStep || onPassword;

  return (
    <AuthShell
      title={invite && mode === "signup" ? "Join your church's media team" : copy.title}
      subtitle={invite && mode === "signup" ? "Create an account, then we'll add you with your invite code." : copy.subtitle}
      head={mode === "signin" ? <link rel="prefetch" href="/bibles/kjv.json" as="fetch" crossOrigin="anonymous" /> : undefined}
      footer={
        <>
          {copy.switchText}{" "}
          <Link href={invite ? `${copy.switchHref}?invite=${encodeURIComponent(invite)}` : copy.switchHref} className="font-medium text-accent hover:underline">
            {copy.switchLabel}
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5" noValidate={false}>
        {notice && <Notice>{notice}</Notice>}

        {onPassword && !oneStep ? (
          <div className="flex h-12 items-center justify-between rounded-full bg-surface-2 pr-2 pl-5 text-[15px]">
            <span className="truncate">{email}</span>
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setError("");
                setExists(false);
              }}
              className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-muted hover:bg-surface-3 hover:text-ink"
            >
              <Pencil size={13} /> Edit
            </button>
          </div>
        ) : (
          <AuthField
            label="Email address"
            type="email"
            name="email"
            autoComplete={mode === "signin" ? "username" : "email"}
            placeholder="Enter your email address"
            required
            autoFocus={!(oneStep && initialEmail)}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setExists(false);
            }}
          />
        )}

        {mode === "signup" && onPassword && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <AuthField
                label="First name"
                name="given-name"
                autoComplete="given-name"
                required
                maxLength={80}
                autoFocus
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
              <AuthField
                label="Last name"
                name="family-name"
                autoComplete="family-name"
                required
                maxLength={80}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
            <AuthField
              label="Phone number"
              type="tel"
              name="tel"
              autoComplete="tel"
              inputMode="tel"
              placeholder="+234 803 000 0000"
              required
              pattern="\+?[\d \(\)\-]{7,20}"
              title="Digits, with an optional + and country code"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </>
        )}

        {/* Always in the page so password managers can fill it; on sign up it
            appears on step two. */}
        <div className={showPassword ? "" : "pointer-events-none -mt-5 h-0 overflow-hidden opacity-0"} aria-hidden={!showPassword}>
          <AuthField
            ref={passwordRef}
            label="Password"
            type="password"
            name="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            placeholder={mode === "signin" ? "Enter your password" : "At least 8 characters"}
            required={showPassword}
            minLength={mode === "signup" ? 8 : undefined}
            tabIndex={showPassword ? 0 : -1}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            action={
              oneStep ? (
                <Link href="/forgot-password" className="text-sm text-muted hover:text-ink">
                  Forgot password?
                </Link>
              ) : undefined
            }
          />
        </div>

        {exists && (
          <Notice tone="error">
            An account with this email already exists.{" "}
            <Link
              href={`/login?email=${encodeURIComponent(email)}${invite ? `&invite=${encodeURIComponent(invite)}` : ""}`}
              className="font-medium text-accent hover:underline"
            >
              Sign in instead
            </Link>
          </Notice>
        )}
        {error && <Notice tone="error">{error}</Notice>}
        {unconfirmed && (
          <Notice>
            Confirm your email first.{" "}
            {resent ? (
              "We sent a new link."
            ) : (
              <button type="button" onClick={resend} className="font-medium text-accent hover:underline">
                Send the link again
              </button>
            )}
          </Notice>
        )}

        <AuthButton type="submit" disabled={busy || checking} aria-busy={busy || checking}>
          {busy || checking ? (
            <LoaderCircle size={20} className="animate-spin" aria-label={checking ? "Checking email" : mode === "signin" ? "Signing in" : "Creating account"} />
          ) : oneStep ? (
            "Sign in"
          ) : onPassword ? (
            "Create account"
          ) : (
            "Continue"
          )}
        </AuthButton>

        {googleAuthEnabled && (
          <AuthButton type="button" variant="secondary" onClick={google}>
            <GoogleMark /> Continue with Google
          </AuthButton>
        )}

        {mode === "signup" && (
          // New tabs, so nothing typed here is lost.
          <p className="text-center text-xs leading-relaxed text-muted">
            By creating an account you agree to the{" "}
            <Link href="/terms" target="_blank" className="font-medium text-ink underline underline-offset-2 hover:text-accent">
              Terms of Use
            </Link>{" "}
            and{" "}
            <Link href="/privacy" target="_blank" className="font-medium text-ink underline underline-offset-2 hover:text-accent">
              Privacy Policy
            </Link>
            .
          </p>
        )}
      </form>
    </AuthShell>
  );
}

// Supabase refuses a second email to the same address within 60 seconds, so
// the button counts down instead of failing.
const RESEND_WAIT_S = 60;

function ResendLink({ email, redirectTo }: { email: string; redirectTo: string }) {
  const [wait, setWait] = useState(RESEND_WAIT_S);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function resend() {
    setState("sending");
    const { error } = await supabaseBrowser().auth.resend({ type: "signup", email, options: { emailRedirectTo: redirectTo } });
    if (error) {
      setState("error");
      setMessage(error.message);
      // "you can only request this after 42 seconds": wait that long.
      const seconds = Number(error.message.match(/(\d+) seconds?/)?.[1]);
      setWait(Number.isFinite(seconds) && seconds > 0 ? seconds : RESEND_WAIT_S);
      return;
    }
    setState("sent");
    setWait(RESEND_WAIT_S);
  }

  return (
    <div className="space-y-4">
      {state === "sent" && <Notice tone="ok">Sent again. Check your inbox and spam folder.</Notice>}
      {state === "error" && <Notice tone="error">{message}</Notice>}
      <AuthButton type="button" variant="secondary" onClick={resend} disabled={wait > 0 || state === "sending"}>
        {state === "sending" ? "Sending…" : wait > 0 ? `Resend email in ${wait}s` : "Resend email"}
      </AuthButton>
    </div>
  );
}
