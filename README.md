# LifeOS

A personal life-management web app. Next.js 16 (App Router, Cache Components) + TypeScript + Tailwind v4, Supabase (Postgres, Auth, RLS), installable as a PWA.

- Design plan: [docs/DESIGN.md](docs/DESIGN.md)
- Database: [supabase/migrations](supabase/migrations)

## Setup (your steps)

These need your accounts. Nothing here costs money.

1. **Create a Supabase project** at supabase.com (free plan, region *West EU (London)*). Save the database password somewhere safe.
2. **Run the migrations** (and again whenever a new file appears in `supabase/migrations/`, *before* deploying the code that needs it). In the Supabase dashboard open *SQL Editor*, paste the contents of each file in `supabase/migrations/` in filename order, and run each one.
3. **Create your login.** Go to *Authentication → Users → Add user → Create new user*, enter your email and a strong password, and tick *Auto Confirm User*.
4. **Turn off public sign-ups.** Go to *Authentication → Sign In / Providers* and disable *Allow new users to sign up*. LifeOS has no sign-up page, and this stops anyone else creating an account on your project.
5. **Local env.** Copy `.env.example` to `.env.local` and fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Project Settings → API keys). Never use the secret / service-role key.
6. **Run it:** `npm install`, then `npm run dev`, then open http://localhost:3000 and sign in.
7. **Deploy (Vercel).** Push the repo to GitHub, import it in Vercel (Hobby plan), add the same two env vars, and deploy. Then in Supabase go to *Authentication → URL Configuration* and set *Site URL* to your Vercel URL.
8. **Install on the Pixel 7.** Open the Vercel URL in Chrome, then *⋮ → Add to Home screen / Install app*.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run typecheck` | Route type generation + `tsc` |
| `npm run lint` | ESLint |
| `npm run test:logic` | Unit tests: capture parsing, recurrence, timetable expansion, load checks, habit streaks, .ics import, wake plan, timezones |
| `npm run test:db` | Applies all migrations to an in-memory Postgres 17 (PGlite) and checks RLS isolation and constraints |
| `npm run check` | All of the above except build |

Dev only: `/design` (component gallery), `/design/today` and `/design/planner` (rendered from labelled fixtures for layout review). All 404 in production.

## Security model

- Every table has Row Level Security: owner-only select/insert/update/delete. Signed-out (anon) requests have no table access.
- Cross-table links use composite foreign keys `(id, user_id)`, so a row can never point at another user's row.
- The browser only ever holds the publishable key. AI keys are server-only env vars, read in `src/lib/ai/provider.ts`.
- `src/proxy.ts` refreshes the session and redirects signed-out visitors. Every data read also re-verifies the JWT (`getClaims`), and RLS enforces access regardless.

## Free-tier facts checked (Nov 2026)

- **Supabase Free** pauses a project after about 7 days of low activity. Phase 7 reminders will run inside the database (pg_cron), which should also keep it active. That will be verified, not assumed.
- **Vercel Hobby** cron jobs run at most **once a day**, with ±59 minutes timing precision. They're unusable for timed reminders, so Phase 7 will use Supabase `pg_cron` + `pg_net` to call a push endpoint instead.

## AI assistant (optional, off by default)

1. Create an API key at console.anthropic.com. API usage is billed separately from a Claude Pro plan.
2. In the Console, set a **monthly spend limit** (e.g. £5 / $6) under Billing → Limits. This is the hard backstop.
3. In Vercel → Settings → Environment Variables (Sensitive, server-only; never `NEXT_PUBLIC_`), add `AI_PROVIDER=anthropic` and `ANTHROPIC_API_KEY=…`. Optional: `AI_MODEL` (default `claude-opus-5-5`), `AI_MONTHLY_BUDGET_USD` (default 6), `AI_DAILY_REQUEST_LIMIT` (default 60). Redeploy.
4. In LifeOS → Settings → Assistant, switch it on.

The app keeps its own ledger (`ai_usage`) and stops calling the API once the monthly estimate reaches `AI_MONTHLY_BUDGET_USD`. Conversations aren't stored. Each request sends a snapshot of your LifeOS data to Anthropic; nothing is sent while the assistant is off. `npm run test:ai` checks the request shape against a fake transport (no network, no cost).

## Reminders (Web Push)

How it works: Supabase `pg_cron` calls `/api/cron/reminders` every 15 minutes (Vercel Hobby cron only allows once a day, so it is only a daily backup at 07:00 UTC). The job works out what's due for each subscribed user, records it in `notification_log` (one per thing per day, so nothing sends twice) and sends Web Push. Tapping a reminder records that it was opened.

1. Run the migrations in `supabase/migrations/` (including `20261120000100_phase7_reminders.sql`).
2. `npm run gen:secrets` → copy the printed lines into Vercel (Production). Set `VAPID_SUBJECT` to your site URL. Add `SUPABASE_SECRET_KEY` (Supabase → Project Settings → API Keys → Secret key). Redeploy.
3. Supabase → Database → Extensions: enable **pg_cron** and **pg_net**.
4. Supabase SQL editor: run `supabase/setup/reminders-cron.sql` with your URL and the **same** `CRON_SECRET`.
5. On the Pixel, open the installed LifeOS app → Settings → Notifications → **Turn on notifications here** → **Send a test notification** → tap **It arrived** when it shows. Until then, LifeOS says delivery is unconfirmed.
6. Pixel: Settings → Apps → Chrome → App battery usage → **Unrestricted**, or Android may delay reminders.

Security: `CRON_SECRET` is compared in constant time; `SUPABASE_SECRET_KEY` bypasses row-level security, lives only in Vercel's server env, and is used only by the reminder job, where every query filters by user.
