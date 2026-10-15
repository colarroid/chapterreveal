"use client";

import Link from "next/link";
import { useState } from "react";
import { AuthButton, AuthField, AuthShell } from "@/components/auth";
import { Notice } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabaseBrowser().auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/auth/callback?next=/reset-password`,
    });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="We'll email you a link to choose a new one."
      footer={<Link href="/login" className="font-medium text-accent hover:underline">Back to sign in</Link>}
    >
      {sent ? (
        <Notice tone="ok">If an account exists for {email}, the link is on its way. It works on any device.</Notice>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <AuthField label="Email address" type="email" autoComplete="email" placeholder="Enter your email address" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} />
          {error && <Notice tone="error">{error}</Notice>}
          <AuthButton type="submit" disabled={busy}>
            {busy ? "Sending…" : "Send reset link"}
          </AuthButton>
        </form>
      )}
    </AuthShell>
  );
}
