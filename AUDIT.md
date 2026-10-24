# Audit, 24 October 2026

A read of both repositories (this app and Scripture-Admin): every API route,
the auth flow, the middleware, the Supabase policies and functions in
`supabase/migrations`, the three consoles and the hook behind them, the output
page and its realtime channel, the offline queue, the service worker, and the
admin site's pages and routes. Then the fixes below, each checked with
`vitest` (245 tests), `tsc`, `eslint` and `next build`.

## Fixed

### Security

- **Open redirect in `/auth/callback`** (`src/app/auth/callback/route.ts`).
  `?next=` was accepted when it started with `/` but not `//`. Browsers read a
  backslash as a slash, so `?next=/\evil.com` redirected a signed-in user to
  `https://evil.com/` after clicking an email link. Now one leading slash
  followed by anything but `/` or `\`.
- **Cron secret compared in constant time**
  (`src/app/api/cron/weekly-summary/route.ts`): `timingSafeEqual` instead of
  `!==`, so the secret can't be guessed a byte at a time.

### Correctness

- **One refused row no longer loses a whole batch** (`src/lib/live/outbox.ts`).
  The offline queue sent each table's rows in one upsert. If the database
  refused one row (its service deleted, say), every row in the batch counted a
  failed try, and after 30 tries they were all dropped, good ones included: a
  live service's transcript lines could be lost behind one bad row. A refused
  batch is now retried row by row, and only the refused row counts a try.
  Covered by `src/lib/live/outbox.test.ts`.
- **Church settings no longer overwrite a newer look**
  (`src/app/(app)/settings/settings.tsx`). Saving the Church form wrote
  `settings` from the copy the page loaded, so a Design change made from the
  console since then was reverted. The newest settings are read and merged
  first, as the console's Design panel already did.
- **Transcriber keep-alive timer leak** (`src/lib/live/transcriber.ts`). Each
  reconnect started a new 4-second interval and left the old one running until
  the service ended. Cleared when its socket closes.
- **Slide position must be finite** (`src/app/api/slides/route.ts`):
  `Infinity` passed `typeof === "number"` and reached the database as an error.

### Housekeeping

- The keyboard effects in the Scriptures and Song Lyrics consoles listed
  `goLive` as a dependency without using it.

## Checked and left as is

- **Row-level security and `security definer` functions.** Every table a
  church writes to is scoped by `my_church_id()`; every admin RPC calls
  `assert_platform_admin()`; `repoint_song`, `flag_duplicates` and
  `contribute_song` are revoked from `authenticated`. `close_stale_services`
  checks the church or platform admin. Nothing found.
- **API routes.** Each checks the session, then membership or church-admin role,
  then (for uploads) that the Cloudinary id is in the church's own folder.
  Plan limits are checked in the route and again by the database.
- **The output page** accepts only hex colours, clamped numbers and this
  account's own Cloudinary URLs from a broadcast (`cleanTheme`, `isOwnMedia`).
  The realtime channel lets anyone with the link listen (the link is the key)
  and only the church's members send (migration 0019).
- **Service worker** caches the console pages (which carry church details)
  and clears them on sign out. Licensed Bibles are cached only encrypted.
- **No secrets in either repository.** `.env*`, `font.zip` and `VIDEOPSALM*`
  are ignored; only `.env.example` is tracked. The Deepgram, Cloudinary and
  Anthropic keys are read on the server only.

## Skipped, and why

- **`email_has_account()` is callable without signing in**
  (`supabase/migrations/0003`). It tells the sign-up form whether an address
  already has an account, which also lets anyone check whether an email is
  registered. Supabase's own `signUp` reveals the same (a user with no
  identities), so closing this alone wouldn't help, and the sign-up flow
  depends on it. **Needs confirmation**: accept it, or drop the pre-check and
  rely on `signUp`'s answer (one more step for people who already have an
  account).
- **`npm audit`: `next` depends on a `postcss` with build-time advisories**
  (`sourceMappingURL` file reads, `</style>` escaping). They apply to
  processing untrusted CSS at build time, which this project never does. The
  fix is Next 16, a breaking upgrade: not done on a live product without a
  deliberate upgrade pass.
- **Output addresses can be 3 characters** (`set_screen_address`). A short
  custom address is guessable, and anyone who guesses it sees what's on the
  church's screen (the same words projected to the room). **Needs
  confirmation** whether to raise the minimum to 6.
- **The whole song library downloads on each console open** when the copy in
  memory is older than two minutes (`src/lib/songs/store.ts`). Fine at a few
  thousand songs, and it's served from the browser's stored copy first. A
  delta sync by `updated_at` is the next step if the library grows past ~10k.
- **History caps a transcript at 5,000 lines** (`src/app/(app)/history/[id]`).
  A service produces one line per stretch of speech, so a long service is
  well under this; noted in case services run longer.
