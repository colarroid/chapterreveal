"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthButton, AuthField, AuthShell } from "@/components/auth";
import { Notice } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabaseBrowser().auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <AuthShell title="Choose a new password">
      <form onSubmit={submit} className="space-y-4">
        <AuthField label="New password" type="password" autoComplete="new-password" required minLength={8} hint="At least 8 characters." value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <Notice tone="error">{error}</Notice>}
        <AuthButton type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save password"}
        </AuthButton>
      </form>
    </AuthShell>
  );
}
