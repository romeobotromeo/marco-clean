# Text Marco — Home Operations Concierge

Text Marco is now a 24/7 home-operations desk. Anyone can text **(645) 206-3407** and Marco will coordinate what needs to happen around a property — from seller prep and vendor meetups to permits, inspections, and on-demand runner support. This repo powers the public SMS experience, request triage, and persistence layer.

---

## System Overview

| Layer | Purpose |
| --- | --- |
| Node.js / Express (`server.js`) | Receives inbound SMS (Sendblue + Twilio fallback), routes ops requests, handles runner applications, persists every interaction |
| Supabase | Source of truth for users, properties, requests, messages, runner applicants, notes, and live roster bindings |
| Anthropic Claude (`claude-sonnet-4-5`) | Generates short operational replies + metadata for categorisation |
| Sendblue | Primary SMS provider for the (645) number + outbound qualification pings |
| Twilio | Backup/toll-free SMS provider for the (888) number |
| Cloudflare Worker (`apps/live/marco-clean/textmarco-worker/worker.js`) | Serves marketing + `/runner` recruiting landing page |
| Admin Reset Endpoint | `POST /admin/reset/:phone` with `Authorization: Bearer <ADMIN_API_TOKEN>` resets a conversation, optionally clearing history |

The legacy website-builder workflow and Render PostgreSQL tables have been removed. Every inbound message now enters the home-ops concierge flow.

---

## Data Model (Supabase)

All tables live in `apps/live/marco-clean/supabase-schema.sql`. Apply it inside the Supabase SQL editor or via `psql`.

| Table | Description |
| --- | --- |
| `users` | One row per phone number. Tracks first/last touch, last known category, and role (agent, homeowner, runner prospect, etc.). |
| `properties` | Known properties associated with a phone number. De-duped by phone + address fingerprint. |
| `requests` | Structured summary of each inbound ask (category, urgency, notes, runner interest). |
| `messages` | Full message history (inbound and outbound) with raw payload snapshots. |
| `runners` | People interested in becoming Marco Runners, including last contact timestamp, status, and linked applicant id. |
| `runner_applicants` | Structured intake for Marco Runner applications (profile, status, tags, Calendly metadata). |
| `runner_applicant_notes` | Internal notes threaded to each runner applicant (qualification, follow-up, scoring). |
| `offer_room_waitlist` | Agents who joined the Offer Room waitlist from the landing page CTA. |

Run the migrations:

```sql
-- Supabase SQL Editor
\i apps/live/marco-clean/supabase-schema.sql
```

---

## Environment Variables

```bash
# AI
ANTHROPIC_API_KEY=...

# Supabase persistence
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...

# SMS providers
SENDBLUE_API_KEY=...
SENDBLUE_API_SECRET=...
SENDBLUE_FROM_NUMBER=+16452063407
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_NUMBER=+18889007501

# Optional
PORT=3000
ADMIN_API_TOKEN=super-secure-reset-key
DEFAULT_RESET_MESSAGE="On it. Reset. Reply with what you need."
```

> **Why service role?** The server runs headless and needs to insert system records. Restrict this key at the network level (Render/Cloudflare environment variables only).

---

## Local Development

```bash
cd apps/live/marco-clean
npm install

# Apply supabase-schema.sql using the Supabase SQL editor or psql

export ANTHROPIC_API_KEY=...
export SUPABASE_URL=...
export SUPABASE_SERVICE_ROLE_KEY=...
export SENDBLUE_API_KEY=...
export SENDBLUE_API_SECRET=...
export SENDBLUE_FROM_NUMBER=+16452063407

# Optional Twilio credentials if you want to test the toll-free number locally

npm start
# server listens on http://localhost:3000
```

To test webhooks, run ngrok (or Cloudflared) and point Sendblue’s inbound webhook to `https://<tunnel>/sms`. The Twilio fallback listens at `/sms-twilio`.

---

## SMS Flow

1. **Incoming text** hits `/sms` (Sendblue) or `/sms-twilio` (backup).
2. `server.js`:
   - Normalises the phone number
   - Upserts the `users` row and logs the raw payload into `messages`
   - Pulls the last ~12 messages for context
   - Calls Anthropic with a strict JSON contract to get the reply, category, urgency, and required follow-ups
   - Persists the structured request + property info
   - Flags runner interest when applicable and upserts into `runners`
   - Sends the reply via the originating provider

**Default greeting** for new numbers:

> “Hey, this is Marco. Tell me what you need help with around the home — repairs, prep, vendors, access, permits, inspections, or real estate support.”

Runner questions trigger the Marco Runner explanation: $30/hr, on-demand property visits, vendor coordination, photo/documentation work, and the optional launch bonus after vetting.

Emergency or safety language prompts a reminder to contact licensed professionals or emergency services immediately.

---

## Runner Recruiting Funnel

### Public experience

| Path | Description |
| --- | --- |
| `/runner` | Cloudflare Worker route with the recruiting landing page, application form, and Calendly embed |
| `/` → CTA | Primary landing now links to `/runner` via desktop header + mobile sticky CTA |

The form POSTs to the Render API (`/runner/apply`). On success the page:

1. Shows confirmation copy
2. Reveals the Calendly inline widget (defaults to `https://calendly.com/marco-runner/intro-call` or override via `RUNNER_CALENDLY_URL`)
3. Keeps the visitor in the DOM (no redirect) so we can iterate without pushing them off-site.

### API endpoint

`POST /runner/apply`

Payload (all fields string, trimmed server-side):

```json
{
  "name": "...",
  "phone": "...",
  "email": "...",
  "city": "...",
  "neighborhood": "...",
  "car_access": "yes|sometimes|no",
  "phone_os": "iphone|android|other",
  "availability": "...",
  "intro": "...",
  "source": "runner-landing" // default
}
```

Behaviour:

1. `runner_applicants` upsert by phone (normalised). Tags are merged and include neighborhoods + source.
2. `runners` table is linked (via `applicant_id`) and status set to `applicant`.
3. Note is appended in `runner_applicant_notes` with the intro + source.
4. Sendblue contact is updated with tag lists (city, availability, etc.) if credentials present.
5. Automated SMS is sent from Sendblue prompting availability details.
6. Response body:

```json
{ "success": true, "applicant_id": "...", "calendly": "<RUNNER_CALENDLY_URL>" }
```

### Environment variables

| Key | Default | Purpose |
| --- | --- | --- |
| `RUNNER_CALENDLY_URL` | `https://calendly.com/marco-runner/intro-call` | Inline Calendly booking shown after application |
| `RUNNER_SOURCE_TAG` | `runner-landing` | Default `source` tag stored with applicants |
| `RUNNER_LIST_TAG` | `runner-prospect` | Baseline tag pushed to Sendblue contact |

The endpoint gracefully no-ops if Supabase or Sendblue creds are missing, returning `503`/`500` accordingly.

### Testing checklist

- [ ] Load `https://textmarco.com/runner` and submit the form with a test number.
- [ ] Verify `runner_applicants`, `runner_applicant_notes`, and `runners` rows populate via Supabase UI.
- [ ] Confirm automated SMS arrives from Sendblue and the contact picked up tags.
- [ ] Ensure Calendly widget displays with the configured URL.
- [ ] Run `/health` endpoint and confirm `updated: 'home-ops concierge + runner recruiting'`.

> Need to change markets, tags, or scoring logic? Update `upsertRunnerApplicant` & `buildListTags` inside `server.js`.

---

## Landing Page Deployment

### TextMarco worker (primary domain)

The public landing page lives at `apps/live/marco-clean/textmarco-worker/worker.js`. Deploy with Wrangler:

```bash
cd apps/live/marco-clean/textmarco-worker
wrangler login        # once per machine, opens browser OAuth
npx wrangler deploy
```

Ensure the Worker routes (`wrangler.toml`) still target `textmarco.com/*`.

### Runner landing (runner.textmarco.com)

The single-page runner funnel now lives at `apps/live/marco-clean/runner-landing.html`.

**Pre-launch checklist**

1. **Configure analytics placeholders**
   - Set `window.__META_PIXEL_ID = '<your_pixel_id>'` via an inline script before the Meta Pixel block or inject it server-side.
   - Connect Plausible/Segment to `window.runnerAnalyticsQueue` if you need additional destinations.
2. **Verify Formspree target**
   - Submit a test entry and confirm the JSON response returns `{ "ok": true }` and the notification email fires.
   - Update the Formspree form if you rotate API keys (`action="https://formspree.io/f/xbldevoy"`).
3. **Smoke-test UX**
   - Desktop and mobile (≤480px) renderings should show the CTA and status messaging without horizontal scroll.
   - Confirm the inline status banner flips between success/error when you simulate failures (disable network in devtools).

**Cloudflare Pages fast deploy**

```bash
cd apps/live/marco-clean
mkdir -p tmp/runner-landing
cp runner-landing.html tmp/runner-landing/index.html
wrangler pages deploy tmp/runner-landing \
  --project-name runner-landing \
  --branch production \
  --commit-dirty \
  --env production
```

- Point `runner.textmarco.com` (or the desired hostname) at the Cloudflare Pages project.
- Add `window.__META_PIXEL_ID` as a Pages Environment Variable or inject it via `_headers`/`_worker.js` if you need per-environment pixels.
- After deployment, submit one live waitlist form and verify receipt, then clear the test row from Formspree.

> **Note:** If you prefer to serve from the existing Worker instead of Pages, copy the HTML into `textmarco-worker/worker.js` under the `/runner` route and redeploy with Wrangler.

---

## Deployment Notes

* **Render**: Start command remains `node server.js`. Set all environment variables above. No Render PostgreSQL is required anymore.
* **Supabase**: Lock this project to your internal network. The service role key should never ship to clients.
* **Sendblue**: Sandbox accounts require manually approving destination numbers. Production keys remove that restriction.
* **Twilio** (optional): Provide SID/auth token only if you plan to keep the toll-free number active.

---

## Operational Checklist

- [ ] Apply `supabase-schema.sql` to Supabase
- [ ] Configure environment variables in Render + Wrangler secrets
- [ ] Deploy Cloudflare Worker (`wrangler deploy`)
- [ ] Push to `main` to trigger Render deployment (or redeploy manually)
- [ ] Smoke test by texting (645) 206-3407 and confirming:
  - greeting response
  - request persists in Supabase `requests`
  - message history logs in `messages`
  - runner inquiries populate `runners`
  - Offer Room waitlist submissions land in `offer_room_waitlist`
- [ ] Reset workflow: `curl -H "Authorization: Bearer $ADMIN_API_TOKEN" -X POST https://<host>/admin/reset/+16452063407` returns success and sends reset SMS

---

Questions or issues? Update this README and the Supabase schema as the product evolves.