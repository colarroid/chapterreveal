"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthButton, AuthField, AuthShell } from "@/components/auth";
import { ChurchAddressFields, type ChurchAddress } from "@/components/church-address";
import { Notice } from "@/components/ui";
import { DEFAULT_COUNTRY } from "@/lib/geo";
import { supabaseBrowser } from "@/lib/supabase/client";

export function OnboardingForm({ invite }: { invite: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"create" | "join">(invite ? "join" : "create");
  const [name, setName] = useState("");
  const [address, setAddress] = useState<ChurchAddress>({ country: DEFAULT_COUNTRY, region: "", street: "" });
  const [code, setCode] = useState(invite);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const supabase = supabaseBrowser();
    const { error } =
      mode === "create"
        ? await supabase.rpc("create_church", { p_name: name, p_country: address.country, p_region: address.region, p_street: address.street })
        : await supabase.rpc("accept_invite", { p_code: code });
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <AuthShell
      title={mode === "create" ? "Name your church" : "Join your church"}
      subtitle={mode === "create" ? "You'll be its admin. You can invite your media team afterwards." : "Enter the invite code your church admin gave you."}
      footer={
        <button type="button" onClick={() => setMode(mode === "create" ? "join" : "create")} className="font-medium text-accent hover:underline">
          {mode === "create" ? "I have an invite code" : "Set up a new church instead"}
        </button>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {mode === "create" ? (
          <>
            <AuthField
              label="Church name"
              required
              minLength={2}
              maxLength={120}
              autoFocus
              placeholder="e.g. Grace Assembly, Lekki"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <ChurchAddressFields value={address} onChange={setAddress} />
          </>
        ) : (
          <AuthField label="Invite code" required placeholder="A1B2C3D4E5" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="font-mono tracking-widest" />
        )}
        {error && <Notice tone="error">{error}</Notice>}
        <AuthButton type="submit" disabled={busy}>
          {busy ? "Saving…" : mode === "create" ? "Create church" : "Join church"}
        </AuthButton>
      </form>
    </AuthShell>
  );
}
