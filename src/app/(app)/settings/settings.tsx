"use client";

import { Check, ChevronRight, Copy, Link2, LoaderCircle, Mail, MonitorPlay, Palette, RefreshCw, ShieldCheck, Trash2, UserPlus, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthField } from "@/components/auth";
import { ChurchAddressFields, type ChurchAddress } from "@/components/church-address";
import { Button, Chip, Field, IconButton, Notice } from "@/components/ui";
import { confirmDialog } from "@/components/confirm";
import { Dropdown } from "@/components/dropdown";
import { DEFAULT_COUNTRY } from "@/lib/geo";
import { DEFAULT_TRANSLATION, type TranslationInfo } from "@/lib/scripture/translations";
import { CONSOLE_CHANNEL, type ConsoleMessage } from "@/lib/live/screen";
import { supabaseBrowser } from "@/lib/supabase/client";

export interface Member {
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  role: string;
  joined_at: string;
}

interface Props {
  churchId: string;
  churchName: string;
  userId: string;
  isAdmin: boolean;
  screenToken: string;
  members: Member[];
  profile: { firstName: string; lastName: string; phone: string };
  address: ChurchAddress;
  invites: { id: string; code: string; role: string; expires_at: string }[];
  silenceEndMinutes: number;
  settings: Record<string, unknown>;
  translations: TranslationInfo[];
  /** The signed-in user's address, where a sample summary goes. */
  email: string;
  /** Whether the email includes AI sermon summaries (ANTHROPIC_API_KEY set). */
  sermonSummaries: boolean;
}

function Section({ icon: Icon, title, description, children }: { icon: typeof Users; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg bg-surface p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-2 text-ink">
          <Icon size={18} />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg leading-tight font-bold">{title}</h2>
          {description && <p className="text-sm leading-snug text-muted">{description}</p>}
        </div>
      </div>
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(value);
    setTimeout(() => setCopied(null), 1500);
  };
  return { copied, copy };
}

/** "Grace Assembly, Lekki" -> "grace-assembly-lekki", for a first suggestion. */
function slugFrom(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const { copied, copy } = useCopy();
  return (
    <div>
      <p className="text-sm font-bold">{label}</p>
      <div className="mt-1.5 flex items-center gap-2">
        <input
          readOnly
          value={value}
          onFocus={(e) => e.target.select()}
          className="inset-field h-11 min-w-0 flex-1 rounded-full bg-bg px-4 font-mono text-xs text-muted"
        />
        <Button variant="secondary" onClick={() => copy(value)}>
          {copied === value ? <Check size={15} /> : <Copy size={15} />}
          {copied === value ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

export function Settings(p: Props) {
  const router = useRouter();
  const supabase = supabaseBrowser();
  const { copied, copy } = useCopy();
  const [origin, setOrigin] = useState("");
  const [name, setName] = useState(p.churchName);
  const [silence, setSilence] = useState(String(p.silenceEndMinutes));
  const [translation, setTranslation] = useState(String(p.settings.translation ?? DEFAULT_TRANSLATION));
  const [address, setAddress] = useState<ChurchAddress>(p.address.country ? p.address : { ...p.address, country: DEFAULT_COUNTRY });
  const [me, setMe] = useState(p.profile);
  const [weekly, setWeekly] = useState(p.settings.weekly_summary === true);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  // Which action is running, so only its button shows a spinner.
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => setOrigin(location.origin), []);
  const out = p.screenToken && origin ? `${origin}/screen/${p.screenToken}` : "";
  // The output address: a random code until an admin picks a name for it.
  const customAddress = !/^[0-9a-f]{36}$/.test(p.screenToken);
  const [screenAddress, setScreenAddress] = useState(customAddress ? p.screenToken : slugFrom(p.churchName));

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string, key: string) {
    setBusy(key);
    setMsg(null);
    const { error } = await fn();
    setBusy(null);
    setMsg(error ? { tone: "error", text: error.message } : { tone: "ok", text: ok });
    if (!error) router.refresh();
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold">Settings</h1>
      {msg && (
        <div className="mt-4">
          <Notice tone={msg.tone}>{msg.text}</Notice>
        </div>
      )}

      <div className="mt-6 space-y-2">
        {p.isAdmin && (
          <Link
            href="/settings/display"
            className="flex items-center gap-3 rounded-lg bg-surface p-5 transition hover:bg-surface-2 sm:p-6"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-2 text-ink">
              <Palette size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-lg leading-tight font-bold">Display</span>
              <span className="block text-sm leading-snug text-muted">Backgrounds, fonts and colours for the projector, for scripture and songs.</span>
            </span>
            <ChevronRight size={18} className="shrink-0 text-muted" />
          </Link>
        )}
        <Section icon={MonitorPlay} title="Output page" description="The projector link shows everything. For the livestream, add the scripture and lyrics links as separate Web Browser inputs in vMix or OBS; key the Lower Third ones on green.">
          {out ? (
            <>
              <CopyRow label="Projector: scripture and lyrics (what Present opens)" value={out} />
              <CopyRow label="Scripture Projection Full Screen" value={`${out}/scripture`} />
              <CopyRow label="Scripture Projection Lower Third (Green background)" value={`${out}/scripture/lower`} />
              <CopyRow label="Lyrics Projection Full Screen" value={`${out}/lyrics`} />
              <CopyRow label="Lyrics Projection Lower Third (Green background)" value={`${out}/lyrics/lower`} />
              <CopyRow label="Scripture Frame (Green background, any size)" value={`${out}/scripture/frame`} />
              <CopyRow label="Lyrics Frame (Green background, any size)" value={`${out}/lyrics/frame`} />
              <p className="text-xs text-muted">
                Set browser inputs to 1920 × 1080, except the Frames: set those to the size of the text area in your own lower-third design, then place them
                on it. The words fill the frame, on green to key out (add ?bg=clear to the link for a see-through background instead). Each scripture or lyrics
                output goes blank while the other kind is on screen. Anyone with these links
                can see what is on screen, but only signed-in members of your church can put anything on it.
              </p>
              {p.isAdmin && (
                <form
                  className="rounded-lg bg-surface-2 px-4 py-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(
                      async () => {
                        const res = await supabase.rpc("set_screen_address", { p_address: screenAddress });
                        if (!res.error && typeof res.data === "string") {
                          // Consoles open in this browser switch to it at once.
                          if (typeof BroadcastChannel !== "undefined") {
                            const bc = new BroadcastChannel(CONSOLE_CHANNEL);
                            bc.postMessage({ type: "screen-token", token: res.data } satisfies ConsoleMessage);
                            bc.close();
                          }
                          router.refresh();
                        }
                        return res;
                      },
                      "Output address saved. Load the new link in vMix and on the projector once; it won't change again unless you change it.",
                      "address",
                    );
                  }}
                >
                  <p className="text-sm font-bold">Your own address</p>
                  <p className="mt-0.5 text-xs text-muted">A name that stays the same, easy to type into vMix: letters, numbers and hyphens.</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="flex h-11 min-w-0 flex-1 items-center rounded-full bg-bg pl-4 font-mono text-xs text-muted inset-field">
                      <span className="shrink-0">{origin}/screen/</span>
                      <input
                        value={screenAddress}
                        onChange={(e) => setScreenAddress(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                        maxLength={40}
                        aria-label="Output address"
                        className="h-full min-w-0 flex-1 bg-transparent pr-4 text-ink outline-none"
                      />
                    </span>
                    <Button type="submit" variant="secondary" loading={busy === "address"} disabled={busy !== null || screenAddress.length < 3 || screenAddress === p.screenToken}>
                      Save address
                    </Button>
                  </div>
                </form>
              )}
              <details className="rounded-lg bg-surface-2 px-4 py-3 text-sm">
                <summary className="cursor-pointer font-semibold">Projector shortcut (always opens full screen)</summary>
                <div className="mt-3 space-y-3 text-muted">
                  <p>
                    The <span className="font-semibold text-ink">Present</span> button on the console is the fastest way to show verses, and keeps working if
                    the internet drops. If Chrome won&apos;t open it full screen on your PC, this desktop shortcut always will:
                  </p>
                  <CopyRow
                    label="Shortcut target (Windows)"
                    value={`"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --kiosk --window-position=1920,0 --user-data-dir="%LOCALAPPDATA%\\ScriptureProjector" "${out}"`}
                  />
                  <ol className="list-decimal space-y-1 pl-5">
                    <li>Right-click the desktop, choose New &gt; Shortcut, paste the target above, and name it Projector.</li>
                    <li>
                      <span className="font-mono text-xs">1920</span> is the width of the main monitor. If yours is different, change it so the window lands on
                      the projector.
                    </li>
                    <li>Double-click it before the service. Close it with Alt + F4.</li>
                  </ol>
                  <p className="text-xs">
                    The shortcut runs as its own copy of Chrome, so verses reach it through the internet (about a quarter of a second) rather than
                    instantly, and it pauses if the connection drops.
                  </p>
                </div>
              </details>
              {p.isAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy !== null} loading={busy === "rotate"}
                  onClick={async () => {
                    if (
                      await confirmDialog({
                        title: "Make a new output link?",
                        body: "The old link goes blank straight away. Load the new link in vMix and on the projector, and reload the console on any other computer.",
                        confirmLabel: "Replace link",
                        danger: true,
                      })
                    ) {
                      void run(
                        async () => {
                          const res = await supabase.rpc("rotate_screen_token");
                          // Consoles open in this browser switch to the new link at once.
                          if (!res.error && typeof res.data === "string" && typeof BroadcastChannel !== "undefined") {
                            const bc = new BroadcastChannel(CONSOLE_CHANNEL);
                            bc.postMessage({ type: "screen-token", token: res.data } satisfies ConsoleMessage);
                            bc.close();
                          }
                          return res;
                        },
                        "New output link created. Copy it into vMix and the projector.",
                        "rotate",
                      );
                    }
                  }}
                >
                  <RefreshCw size={14} /> Replace link
                </Button>
              )}
            </>
          ) : (
            <p className="text-muted">Loading</p>
          )}
        </Section>

        {p.isAdmin && (
          <Section icon={ShieldCheck} title="Church" description="Your church's name and address, and when a forgotten service should end on its own.">
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                const minutes = Math.min(120, Math.max(5, Number(silence) || 20));
                void run(
                  () =>
                    supabase
                      .from("churches")
                      .update({
                        name: name.trim(),
                        country_code: address.country,
                        region: address.region.trim(),
                        street_address: address.street.trim() || null,
                        settings: { ...p.settings, silence_end_minutes: minutes, translation },
                      })
                      .eq("id", p.churchId),
                  "Saved.",
                  "church",
                );
              }}
            >
              <Field label="Church name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={120} />
              <ChurchAddressFields value={address} onChange={setAddress} />
              <Field
                label="End the service after this many minutes of silence"
                type="number"
                min={5}
                max={120}
                value={silence}
                onChange={(e) => setSilence(e.target.value)}
                hint="Stops transcription (and its cost) if someone forgets to press End service."
              />
              <div>
                <span className="text-sm font-bold">Default translation</span>
                <Dropdown
                  ariaLabel="Default translation"
                  value={translation}
                  onChange={setTranslation}
                  options={p.translations.map((t) => ({ value: t.id, label: t.short, hint: t.name }))}
                  className="mt-1.5 h-11 w-full text-[15px]"
                />
                <span className="mt-1.5 block text-xs text-muted">
                  What the console opens with. Operators can switch during a service.
                </span>
              </div>
              <Button type="submit" disabled={busy !== null} loading={busy === "church"}>
                Save changes
              </Button>
            </form>
          </Section>
        )}

        {p.isAdmin && (
          <Section
            icon={Mail}
            title="Weekly summary"
            description={`Every Monday morning, church admins get an email of the past week's services: ${p.sermonSummaries ? "a short summary of each sermon, " : ""}the scriptures shown and the songs sung.`}
          >
            <button
              type="button"
              role="switch"
              aria-checked={weekly}
              disabled={busy !== null}
              onClick={() => {
                const on = !weekly;
                setWeekly(on);
                void run(
                  () => supabase.from("churches").update({ settings: { ...p.settings, weekly_summary: on } }).eq("id", p.churchId),
                  on ? "The weekly summary is on. The first one arrives next Monday." : "The weekly summary is off.",
                  "weekly",
                );
              }}
              className="flex w-full items-center gap-3 rounded-lg bg-surface-2 px-4 py-3 text-left transition hover:bg-surface-3 disabled:opacity-60"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-bold">Email the weekly summary</span>
                <span className="block text-sm text-muted">To every admin of {p.churchName}. Off by default.</span>
              </span>
              <span className={`relative h-5 w-9 shrink-0 rounded-full transition ${weekly ? "bg-accent-fill" : "bg-surface-3 ring-1 ring-line-strong"}`}>
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${weekly ? "left-[18px]" : "left-0.5"}`} />
              </span>
            </button>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                disabled={busy !== null}
                loading={busy === "sample"}
                onClick={async () => {
                  setBusy("sample");
                  setMsg(null);
                  try {
                    const res = await fetch("/api/summary/sample", { method: "POST" });
                    const body = await res.json().catch(() => ({}));
                    setMsg(res.ok ? { tone: "ok", text: `Sample sent to ${body.sentTo}. It can take a minute to arrive.` } : { tone: "error", text: body.error ?? "The sample couldn't be sent." });
                  } catch {
                    setMsg({ tone: "error", text: "The sample couldn't be sent. Check your connection." });
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                Send me a sample
              </Button>
              <span className="text-sm text-muted">Last week&apos;s summary, to {p.email}.</span>
            </div>
            {p.sermonSummaries && (
              <p className="text-xs text-faint">
                Sermon summaries are written by AI from the live transcript and leave out personal details like prayer requests and names. The full transcript stays in History.
              </p>
            )}
          </Section>
        )}

        <Section icon={UserRound} title="Your details" description="Your church admin sees these in the media team list.">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void run(
                () =>
                  supabase
                    .from("profiles")
                    .update({ first_name: me.firstName.trim(), last_name: me.lastName.trim(), phone: me.phone.trim() || null, updated_at: new Date().toISOString() })
                    .eq("id", p.userId),
                "Your details are saved.",
                "me",
              );
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <AuthField label="First name" autoComplete="given-name" required maxLength={80} value={me.firstName} onChange={(e) => setMe({ ...me, firstName: e.target.value })} />
              <AuthField label="Last name" autoComplete="family-name" required maxLength={80} value={me.lastName} onChange={(e) => setMe({ ...me, lastName: e.target.value })} />
            </div>
            <AuthField
              label="Phone number"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              required
              pattern="\+?[\d \(\)\-]{7,20}"
              title="Digits, with an optional + and country code"
              value={me.phone}
              onChange={(e) => setMe({ ...me, phone: e.target.value })}
            />
            <Button type="submit" disabled={busy !== null} loading={busy === "me"}>
              Save details
            </Button>
          </form>
        </Section>

        <Section icon={Users} title="Media team" description={p.isAdmin ? "Invite operators with a single-use code. Codes expire after 14 days." : undefined}>
          <ul className="space-y-1">
            {p.members.map((m) => (
              <li key={m.user_id} className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-surface-2">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-3 text-sm font-bold uppercase">{(m.first_name || m.email)[0]}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {[m.first_name, m.last_name].filter(Boolean).join(" ") || m.email}
                    {m.user_id === p.userId && <span className="ml-1.5 font-normal text-faint">(you)</span>}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {m.email}
                    {m.phone && <> · {m.phone}</>}
                  </span>
                </span>
                <Chip tone={m.role === "admin" ? "ok" : "neutral"}>{m.role === "admin" ? "Admin" : "Operator"}</Chip>
                {p.isAdmin && m.user_id !== p.userId && (
                  <IconButton
                    label={`Remove ${m.email}`}
                    className="hover:text-negative"
                    onClick={async () => {
                      if (await confirmDialog({ title: `Remove ${m.email}?`, body: "They lose access to this church straight away.", confirmLabel: "Remove", danger: true })) {
                        void run(() => supabase.from("church_members").delete().eq("church_id", p.churchId).eq("user_id", m.user_id), "Removed.", `remove-${m.user_id}`);
                      }
                    }}
                  >
                    {busy === `remove-${m.user_id}` ? <LoaderCircle size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  </IconButton>
                )}
              </li>
            ))}
          </ul>

          {p.isAdmin && (
            <>
              {p.invites.length > 0 && (
                <div>
                  <p className="text-sm font-bold">Open invites</p>
                  <ul className="mt-2 space-y-1">
                    {p.invites.map((i) => {
                      const link = `${origin}/signup?invite=${i.code}`;
                      return (
                        <li key={i.id} className="flex flex-wrap items-center gap-3 rounded-md bg-surface-2 px-3 py-2">
                          <span className="font-mono text-sm font-bold tracking-widest">{i.code}</span>
                          <Chip>{i.role === "admin" ? "Admin" : "Operator"}</Chip>
                          <span className="text-xs text-faint">expires {new Date(i.expires_at).toLocaleDateString()}</span>
                          <span className="ml-auto flex items-center gap-1">
                            <Button variant="ghost" size="sm" onClick={() => copy(link)}>
                              {copied === link ? <Check size={14} /> : <Link2 size={14} />}
                              {copied === link ? "Copied" : "Signup link"}
                            </Button>
                            <IconButton
                              label="Cancel invite"
                              className="hover:text-negative"
                              onClick={() => void run(() => supabase.from("church_invites").delete().eq("id", i.id), "Invite cancelled.", `cancel-${i.id}`)}
                            >
                              {busy === `cancel-${i.id}` ? <LoaderCircle size={16} className="animate-spin" /> : <Trash2 size={16} />}
                            </IconButton>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={busy !== null} loading={busy === "invite-operator"}
                  onClick={() =>
                    void run(
                      () => supabase.from("church_invites").insert({ church_id: p.churchId, created_by: p.userId, role: "operator" }),
                      "Invite created. Share the code or the signup link.",
                      "invite-operator",
                    )
                  }
                >
                  <UserPlus size={16} /> Invite operator
                </Button>
                <Button
                  variant="outline"
                  disabled={busy !== null} loading={busy === "invite-admin"}
                  onClick={() =>
                    void run(() => supabase.from("church_invites").insert({ church_id: p.churchId, created_by: p.userId, role: "admin" }), "Admin invite created.", "invite-admin")
                  }
                >
                  Invite admin
                </Button>
              </div>
            </>
          )}
        </Section>
      </div>
    </main>
  );
}
