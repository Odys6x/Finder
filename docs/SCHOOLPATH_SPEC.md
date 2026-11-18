# SchoolPath Finder — Build Spec for Claude Code

> Read this whole file before writing code. Build the **MVP** first, then stop and check in before the "Later" features.

## 1. What we're building

An AI web app that helps Singapore parents choose **secondary schools** for their P6 child during **S1 Posting**.

MOE SchoolFinder only has filters. SchoolPath adds:
- Personal recommendations based on PSLE score, home location, interests and priorities
- An AI chat that answers questions about schools (CCAs, programmes, culture, admissions)
- Safe / Borderline / Reach sorting against last year's cut-off points (COPs)

**Main use window:** the 7 days after PSLE results release (late Nov), when parents must submit 6 school choices. The app must be fast, mobile-first and simple during that week.

## 2. Key domain rules (get these right)

- **COPs are from the previous year.** PSLE 2026 parents choose using the "PSLE score range of 2025" (from the Dec 2025 posting). New COPs come out with S1 posting results (~mid/late Dec) and are for the *next* cohort.
- Lower PSLE score = better. Scores range from 4 (best) to 30.
- COPs are per **Posting Group**: PG3, PG2, PG1. Some schools also have **IP** COPs and **affiliated vs non-affiliated** COPs.
- Some SAP schools include Higher Chinese grades in their COP. Store this as a note field.
- If a school had leftover places, its PG1 COP shows `30*`. Store a flag for this.
- Meeting a COP does **not** guarantee a place (tie-breakers apply). Always say so in the UI.
- Choice-strategy tip (from MOE): include 2–3 schools whose previous year's COPs are less stringent.

### Banding logic
For the user's PSLE score `s`, the school's COP `c` for their posting group:
- 🟢 **Safe:** `s <= c - 3`
- 🟡 **Borderline:** `c - 2 <= s <= c + 2`
- 🔴 **Reach:** `s > c + 2`

Make the thresholds config values, not hard-coded.

## 3. Data sources and legal rules (must follow)

| Source | What | Can be used publicly / commercially? |
|---|---|---|
| **data.gov.sg** (MOE "School Directory and Information" collection, ID 457) | General info, subjects, CCAs, MOE programmes, School Distinctive Programmes | ✅ Yes, under the Singapore Open Data Licence |
| **MOE SchoolFinder** (moe.gov.sg/schoolfinder) | COPs, DSA talent areas, latest CCAs | ⚠️ Research / personal use only until MOE gives written permission. Commercial reuse is not allowed without it. |
| **OneMap API** | Postal code → lat/long, distance | ✅ (check OneMap terms) |

**Build rules:**
1. **Attribution (required by the Open Data Licence):** show a visible notice crediting the data source with a link to the licence, e.g. "Contains information from [dataset] accessed on [date] from data.gov.sg, made available under the Singapore Open Data Licence."
2. **No official look:** footer says "Not affiliated with or endorsed by MOE." No MOE logos or crests.
3. **Data freshness:** every school page shows a "Data as of [date]" label.
4. **COP data feature flag:** `COP_SOURCE_PERMITTED=false` by default. When false, don't show stored SchoolFinder COPs. Instead show a **"Check COP on SchoolFinder"** link to that school's SchoolFinder page. Banding is disabled unless the flag is true or the user enters a COP themselves.
5. Store facts only (numbers, lists, names). Don't copy MOE's descriptive text. Write blurbs in our own words.
6. **No scraper in the MVP.** COPs are entered manually through an admin CSV import. If a crawler is added later, it must respect robots.txt, wait 1–2s between requests, use the sitemap, and run at most once a year.

## 4. Data model (per school)

**From data.gov.sg:**
- `school_code` (PK), `name`, `address`, `postal_code`, `zone`, `nearest_mrt`, `bus_services`
- `type` (Government / Aided / Autonomous / Independent), `nature` (Co-ed / Boys / Girls), `session`
- `is_sap`, `is_ip`, `is_gifted`, `mother_tongues[]`
- `website`, `phone`, `email`
- `subjects[]`, `ccas[]` (grouping + name), `moe_programmes[]`, `alp`, `llp`

**From SchoolFinder (manual, admin only):**
- `cops`: `{ year, pg3, pg2, pg1, ip, affiliated_pg3/pg2/pg1, pg1_has_vacancy_flag, hcl_note }`
- `affiliated_primary_schools[]`, `dsa_talent_areas[]`, `electives[]` (MEP, AEP, LEP, etc.), `sen_support`
- `schoolfinder_url`, `source_last_updated`

**Derived:**
- `lat`, `lng` (OneMap from postal code)
- `culture_blurb` (our own words, from the school website)

Keep COPs in their own table keyed by `(school_code, cop_year)` so each year's data is kept.

## 5. MVP features

1. **Parent profile (no login needed to start)**
   - Inputs: PSLE score, posting group, home postal code, max travel time or distance, interests (CCAs, programmes), preferences (co-ed/single-sex, SAP, mother tongue), affiliated primary school (optional)
   - PDPA: don't collect the child's name, NRIC or school. Keep the profile in the browser until the user signs up. If stored server-side, encrypt it and let users delete it.

2. **School search and filters**
   - Filter by zone, distance, type, nature, CCA, programme, subject, mother tongue
   - Map view plus list view

3. **School detail page**
   - Key info, CCAs, subjects, ALP/LLP, programmes, distance from home
   - COP block (or SchoolFinder link, depending on the flag) with the "COPs are last year's; not a guarantee" note
   - "Data as of" label and source links

4. **Smart matching and banding** ⭐
   - Ranks schools by fit (distance, interests, preferences) and sorts them into Safe / Borderline / Reach
   - Suggests a balanced 6-choice list, e.g. 2 reach, 2 borderline, 2 safe
   - Shows the reasons for each match ("8 min from home, has Robotics CCA, Music Elective Programme")

5. **Shortlist builder**
   - Save up to ~10 schools, reorder them, compare side by side
   - Export or share as PDF or image (for the family chat)

6. **AI chat assistant (RAG)**
   - Answers only from our school database plus a small FAQ on S1 Posting rules
   - Always cites which school or data it used. Says "I don't know, check SchoolFinder" when unsure. No made-up COPs.
   - Can act on the profile: "Show me co-ed schools near Tampines with basketball"
   - Guardrails: no promises of admission, no ranking schools as "good" or "bad", neutral tone

7. **Paywall: free tier, then a one-time Season Pass** (no subscriptions)

   | Tier | Includes |
   |---|---|
   | Free | Search, school pages, map, ~5 AI chat messages, banding preview (e.g. first 3 matches) |
   | Season Pass (one-time, ~S$15–30) | Unlimited AI chat, full banding, balanced 6-choice suggestions, compare, export |
   | Family Pass (optional, ~S$40) | Season Pass valid until the next stage / for siblings |

   - Show the paywall only after the user has seen value ("You have 3 safe matches. Unlock the full list.")
   - Early-bird price setting (Sep–Nov)
   - Payments via Stripe (PayNow supported) or similar
   - ⚠️ Paid launch = commercial use. Keep `COP_SOURCE_PERMITTED=false` until MOE approves.

8. **Admin tools**
   - CSV import for COPs and SchoolFinder fields, with validation (scores 4–30, PG ordering sanity checks)
   - "Refresh data.gov.sg" job (pulls from the API)
   - Yearly checklist: late Dec, import the new COPs and bump `cop_year`

## 6. Later (after MVP, check in first)

- More stages: **P1 registration** and **JC/poly (JAE)** for the same family
- Referral codes ("share with a friend, both get $5 off")
- B2B: bulk passes for tuition centres and primary schools
- Commute time via public transport (not just straight-line distance)
- Open house date tracker and reminders
- Polite yearly crawler (only if MOE allows)

## 7. Tech suggestions (flexible)

- Frontend: Next.js (or React + Vite), Tailwind, mobile-first
- DB: Postgres (Supabase is fine) with pgvector for RAG
- LLM: AWS Bedrock (Claude) or the Anthropic API. Keep the provider swappable.
- Maps: OneMap
- Payments: Stripe
- Hosting: Vercel or AWS

## 8. Quality bar

- Unit tests for the banding logic, including edge cases (`30*`, IP, affiliated)
- Eval set of ~30 parent questions for the AI chat. It must not make up COPs.
- Lighthouse mobile score of at least 90. It needs to work well when traffic spikes in PSLE week.
- Every screen shows the disclaimer: "For reference only. COPs change yearly and don't guarantee admission. Not affiliated with MOE."

## 9. Open items (don't block on these)

- MOE permission email for using SchoolFinder COPs (Owen is handling this)
- Final pricing
- App name: SchoolPath Finder / PathFinders
