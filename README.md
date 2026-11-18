# SchoolPath Finder

Mobile-first web app that helps Singapore P6 parents choose secondary schools for S1 Posting:
personal matches with Safe / Borderline / Reach bands, school search with a map, school pages, a
shortlist with compare and export, and an AI assistant grounded in our school database.

Built from [`docs/SCHOOLPATH_SPEC.md`](docs/SCHOOLPATH_SPEC.md) (MVP scope, §1–§8).

## Quick start

```bash
npm install
cp .env.example .env.local   # set COOKIE_SECRET and ADMIN_PASSWORD at minimum
npm run dev                  # http://localhost:3000
```

No other setup is needed for local development:

- **Database:** embedded Postgres (PGlite) in `./.data/pglite`. Migrations run automatically, and the first
  request seeds 147 schools from `data/snapshot/schools.json`.
- **AI chat:** without an API key the chat runs in an *offline demo mode* (simple rule-based search). For the
  real assistant, set one of:
  - `ANTHROPIC_API_KEY`: Claude, default `claude-opus-5-5`
  - `GROQ_API_KEY`: Groq, default `openai/gpt-oss-120b`. Any Groq model with tool use works via `LLM_MODEL`.
  - `LLM_PROVIDER=bedrock` plus AWS credentials: Claude on Bedrock

  If both API keys are set, Claude wins unless `LLM_PROVIDER` says otherwise. All providers share the same tools,
  prompt, FAQ and guardrails (`src/lib/chat/run.ts`, with Groq's loop in `run-groq.ts`). Run
  `npm run eval:chat -- --yes` after switching models.
- **Travel:** with a free OneMap account (`ONEMAP_EMAIL` / `ONEMAP_PASSWORD`), matches use real door-to-door
  MRT/bus times for a 6:45am school-day trip. This powers ranking, the "max travel time" filter and the route
  breakdown on school pages. Times are cached for 30 days per (home rounded to ~100 m, school), and only the nearest
  40 schools within 15 km are routed per search. Any times that take longer appear a few seconds later. Without the
  account, straight-line distance is used.
  School pages also have an "Open in Google Maps" directions button. Set `NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY` (Maps
  Embed API) to show the Google route on the page.
- **Local database on OneDrive:** the embedded dev database lives in `./.data/pglite`. Cloud sync and hard-killing the
  dev server can damage it. The app then recovers by itself: it clears the stale lock or moves the damaged copy
  aside and reseeds. To avoid this, set `PGLITE_DIR` to a folder outside OneDrive. Production uses `DATABASE_URL`.
- **Payments:** without `STRIPE_SECRET_KEY` (and outside production), "Unlock" issues a free test pass so
  the paid features can be tried.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm test` | Unit tests: banding (incl. `30*`, IP, affiliated), CSV import validation, matching, chat guardrails |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm run data:snapshot` | Re-pull data.gov.sg into `data/snapshot/schools.json` (rate-limited, ~2 min) |
| `npm run eval:chat -- --yes [case-id…]` | Runs the 30-question AI eval in `evals/chat-eval.json` against the live model (billed, hence `--yes`) |
| `npm run db:generate` | Generate a Drizzle migration after changing `src/lib/db/schema.ts` |

## Legal and data rules (spec §3)

| Rule | Where it is enforced |
|---|---|
| Open Data Licence attribution | `src/components/Attribution.tsx` (footer on every page) and `/about-data` |
| No official look, "Not affiliated with MOE" | Footer and top disclaimer bar (`src/app/layout.tsx`) |
| "Data as of" on school pages | `src/app/schools/[code]/page.tsx` |
| **`COP_SOURCE_PERMITTED=false` by default** | `getPermittedCops()` in `src/lib/repo.ts` is the only read path for stored COPs, and returns nothing while the flag is off. Pages show a SchoolFinder link instead; the AI tool gets a link instead of numbers; and a post-check (`src/lib/chat/guard.ts`) replaces any answer that contains COP figures. |
| Banding without permission | Only from COPs the parent types in themselves (kept in their browser) |
| Facts only, no copied MOE text | Data import stores codes, names and lists. FAQ and blurbs are written by us. |
| No scraper | COPs and SchoolFinder fields come in through the admin CSV import only |

**Keep `COP_SOURCE_PERMITTED=false` for any paid launch until MOE gives written permission.**

## How the app works (UI)

The home page is a single chat-style thread (`src/components/thread/ChatApp.tsx`):

1. **Guided questions with tap-to-answer chips:** score, posting group (only if ambiguous), postal code,
   boy/girl, interests and travel time. These run locally (`src/lib/guided.ts`), so they're instant, free and
   don't count against the free AI questions.
2. **Results in the thread:** swipeable school cards (band or fit, ★ save, 2–3 short facts), band counts, the
   balanced 6 (paid), a map sheet, "See all", and quick refinements (co-ed only, SAP, IP, widen travel).
3. **Free text goes to the AI** (same tools and guardrails as before). Profile suggestions from the AI can be
   saved with one tap, and the matches re-run.

The thread is saved on the device. The ★ and ☰ in the header open the shortlist and the menu. Full pages
(`/match`, `/schools`, `/schools/[code]`, `/shortlist`, `/profile`, `/pricing`, `/about-data`) live in the
`src/app/(site)` route group with a slim header. `/chat` redirects to `/`.

## Architecture

```
src/
  app/                    pages + API routes (Next.js 16 App Router)
    api/match             smart matching; free/paid gating is enforced here, server-side
    api/chat              AI chat (NDJSON stream), free-message counter
    api/checkout, unlock, stripe/webhook, pass/restore   Season Pass (one-time Stripe Checkout)
    api/admin/*           CSV import, data.gov.sg refresh, COP year (Basic auth via src/proxy.ts)
  lib/
    banding.ts            Safe/Borderline/Reach (thresholds from config)
    matching.ts           fit score + reasons + balanced 6-choice suggestion
    csv-import.ts         COP / SchoolFinder CSV parsing and validation
    datagov.ts            data.gov.sg pull (5 datasets) + OneMap geocoding
    repo.ts               DB access with an in-memory cache (for PSLE-week read spikes)
    session.ts            pass + anonymous usage cookies (signed, no personal data)
    chat/                 provider (Anthropic / Bedrock / mock), tools, prompt, FAQ, guardrails
    client/               browser-only state: profile + shortlist in localStorage (PDPA)
```

- **Profile and PDPA:** the profile lives in `localStorage`. It is sent with each match/chat request and is
  never stored on the server. We don't collect the child's name, NRIC or school. "Delete my data" is on the
  Profile page.
- **AI chat:** Claude (`claude-opus-5-5` by default) with three tools: `search_schools`, `get_school` and
  `suggest_profile_update` (the parent must tap to apply it). Answers cite `[[school-code]]` / `[[faq:id]]`,
  which render as links, and a source list is attached. Server-side refusal fallback is enabled on the Claude
  API. Retrieval uses structured tool calls over the database rather than vector search: with about 150 schools
  this is exact and can't invent numbers. pgvector can be added later for free-text content (blurbs).
- **Paywall:** free users get search, school pages, the map, 5 AI questions and a preview of their top 3 matches
  with band counts. The Season Pass (one-time; early-bird pricing by date in config) unlocks everything else.
  A pass is a signed cookie plus a DB row, and a pass code restores it on another device.

## Admin

Set `ADMIN_PASSWORD`, then open `/admin` (any username). From there you can:

- **Refresh data.gov.sg**: pulls the datasets and keeps SchoolFinder fields and blurbs.
- **Import a CSV**: COPs or SchoolFinder fields. Download a template, validate (errors block the import;
  warnings flag PG-ordering problems such as PG3 being less stringent than PG2), then commit.
  - COP cells accept `12`, `8-12` (the upper value is the COP), `30*` (PG1 vacancy), or blank.
- **Set the COP year**, and follow the **yearly checklist** for late December.

## Deploying to Vercel

The project is set up for Vercel (`vercel.json` pins the Singapore region `sin1`).

1. **Database.** Create a Postgres database in Singapore or close by (Supabase `ap-southeast-1`, or Neon via
   the Vercel Marketplace). In Vercel → Settings → Environment Variables:
   - `DATABASE_URL`: the **pooled** connection string (Supabase transaction pooler on port 6543, or Neon's
     `-pooler` host). Serverless instances each open a small pool (max 3), so a pooler is essential during
     PSLE-week spikes.
   - `DATABASE_URL_UNPOOLED` (recommended): the direct connection, used only to run migrations.
2. **Migrations** run once per deploy: Vercel uses the `vercel-build` script (`scripts/migrate.ts`, then
   `next build`). They don't run on cold starts. The first request after the first deploy seeds the 147 schools
   from the bundled snapshot.
3. **Required env:** `COOKIE_SECRET` (long random string), `ADMIN_PASSWORD`, `APP_URL`
   (e.g. `https://your-domain`), and one AI provider (`ANTHROPIC_API_KEY` or `GROQ_API_KEY`).
4. **Payments:** `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`, with a Stripe webhook pointed at
   `https://your-domain/api/stripe/webhook` for `checkout.session.completed` and
   `checkout.session.async_payment_succeeded`. Enable PayNow in the Stripe Dashboard. In production without a
   Stripe key, checkout is disabled; the free test pass only exists in development.
5. **Optional:** `ONEMAP_EMAIL` / `ONEMAP_PASSWORD` (travel times), `NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY` (route
   on the page; restrict the key to your domain), `DATA_GOV_SG_API_KEY`.

Serverless-specific behaviour:

- The embedded PGlite database is never used on Vercel. A missing `DATABASE_URL` fails loudly.
- Travel-time lookups still loading after the response continue via `after()`, so they finish and get cached.
- In-memory caches (school data for 5 minutes, geocoding) are per instance, which is fine. Shared state
  (passes, chat counts, travel-time cache, refresh lock) lives in Postgres.
- `/api/schools/index` sends CDN cache headers, so the school list is served from Vercel's edge.
- **Admin "Refresh data.gov.sg"** runs inside `after()` with `maxDuration = 300` and takes 1–3 minutes. If your
  Vercel plan's function limit is lower, run `npm run data:snapshot` locally and redeploy instead.
- Function time limits: chat and match use up to 60 s.

Tested locally in Vercel mode (`VERCEL=1`, `DATABASE_URL` pointing at a Postgres-protocol server):
- migrations via `scripts/migrate.ts`
- concurrent cold-start requests while seeding
- matching, the free chat limit, checkout refusal, admin import and status

Not yet tried on Vercel itself.

## Quality checks done

- 88 unit tests pass (`npm test`).
- Lighthouse (mobile, production build): every audited page scores at least 93 for performance, and 100 on
  most pages.
- At 390 px width there is no horizontal scroll, and there are no console errors across all pages.
- The AI eval set (30 cases) is ready. It needs a live API key to run.

## Not built yet (spec §6, "Later")

P1 / JAE stages, referral codes, B2B passes, open-house tracker, and a crawler (only if MOE allows).
