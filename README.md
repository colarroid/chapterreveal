# ReedArk

Listens to a live sermon and puts the Bible verse the preacher cites on the church screen in about two seconds. Built from the "Live Scripture Detection" PRD (Oct 13, 2026). This is the MVP phase.

## Setup

1. Create a Supabase project. In the SQL editor, run `supabase/migrations/0001_init.sql`.
2. In Supabase, go to Authentication > URL Configuration. Set the Site URL to where the app runs (`http://localhost:3020` locally) and add `http://localhost:3020/auth/callback` to the redirect URLs.
3. Create a Deepgram account ($200 of free credit) and an API key with the Member role.
4. Fill in `.env.local` (copy of `.env.example`).
5. `npm install`, then `npm run dev` and open http://localhost:3020.

## Auth email (Resend)

Supabase sends signup and reset emails through Resend over SMTP (Authentication > Emails > SMTP Settings: host `smtp.resend.com`, port `465`, user `resend`, password = Resend API key). The templates are in `supabase/templates/` and are pasted into Authentication > Emails > Templates. They link to `/auth/callback` with a `token_hash`, so the link works in any browser, not only the one that signed up. They build on `{{ .RedirectTo }}`, so the redirect URL allow list must include `<site>/auth/callback**`.

## How it fits together

- **Console** (`/dashboard`): picks the audio input, streams 16 kHz PCM to Deepgram over a WebSocket opened with a 60-second token from `/api/transcription/session`. The API key stays on the server.
- **Detection** (`src/lib/scripture/parser.ts`): rule-based parser that runs in the browser on every partial transcript against the preloaded KJV. Tests: `npm test`.
- **Output page** (`/screen/<token>`): no login. It gets updates over a Supabase Realtime broadcast channel, and re-reads the saved state when it reconnects. Add `?layout=lower` for a transparent lower third in vMix.
- **Saved data**: transcript segments, verses shown (marked in the transcript), and audio seconds per service for usage tracking. Raw audio is never stored.

## Bible data

`public/bibles/kjv.json` is the public-domain KJV, built by `npm run bible:kjv`.
