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
| Telegram Bot (`telegram.js`) | Relays Telegram messages between Romeo and the Chief of Staff once the bot webhook is configured |
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

# Telegram relay
TELEGRAM_BOT_TOKEN=...
TELEGRAM_PRIMARY_CHAT_ID=...            # Romeo's Telegram user ID (numeric)
TELEGRAM_CHIEF_OF_STAFF_CHAT_ID=...     # Chief of Staff Telegram user ID (numeric)
TELEGRAM_ALLOWED_CHAT_IDS=...           # optional comma-delimited whitelist (auto-populated with IDs above)
TELEGRAM_WEBHOOK_SECRET=...             # optional secret token to validate Telegram webhook requests
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
   - (Optional) Relays Telegram updates between Romeo and the Chief of Staff via `/telegram/webhook`

### Telegram Relay Flow

1. Create a Telegram Bot via [@BotFather](https://t.me/botfather) and grab the `TELEGRAM_BOT_TOKEN`.
2. Locate the numeric chat IDs for Romeo and the Chief of Staff (use https://core.telegram.org/bots/api#obtaining-chat-ids or a helper bot like [@myidbot](https://t.me/myidbot)).
3. Configure the environment variables above on Render (or your hosting platform).
4. Point the Telegram webhook to your deployment:

   ```bash
   curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
     -d "url=https://<your-host>/telegram/webhook" \
     -d "secret_token=${TELEGRAM_WEBHOOK_SECRET}"   # optional but recommended
   ```

5. DM the bot `/start` from both Romeo and the Chief of Staff chats; it will confirm connection and thereafter relay messages.

> **Note:** Only chats listed in `TELEGRAM_ALLOWED_CHAT_IDS` (plus the primary + chief IDs) are permitted to use the relay. Messages include metadata about the sender and support text, photos, voice notes, and other attachment types as labelled summaries.

**Default greeting** for new numbers:

> “Hey, this is Marco. Tell me what you need help with around the home — repairs, prep, vendors, access, permits, inspections, or real estate support.”

Runner questions trigger the Marco Runner explanation: $30/hr, on-demand property visits, vendor coordination, photo/documentation work, and the optional launch bonus after vetting.

Emergency or safety language prompts a reminder to contact licensed professionals or emergency services immediately.

---

## Runner Recruiting Funnel

### Public experience

| Path | Description |
| --- | --- |
| `https://runner.textmarco.com` | Cloudflare Pages deployment of `runner-landing.html`. Collects a lightweight waitlist via Formspree, streams analytics events into `window.runnerAnalytics`, and reveals Calendly after confirmation. |
| `/runner` | Cloudflare Worker route with the full application form wired to `/runner/apply` (Supabase + Sendblue required). Use when you want structured intake instead of the waitlist. |
| `/` → CTA | Primary marketing site CTA. Point this to whichever recruiting surface is active (Pages waitlist or Worker intake). |

#### Cloudflare Pages variant (Formspree waitlist)

- Form action: `https://formspree.io/f/xbldevoy`. Provide form name/phone/email; responses land in Formspree with metadata for manual follow-up.
- Inline script normalises phone numbers, surfaces success/error copy, and pushes events via `window.runnerAnalytics.track(event, payload)`.
- On success, the Calendly inline widget appears. The URL falls back to `window.__RUNNER_CALENDLY_URL` (set via Pages environment variable) but can be overridden by returning `{ "calendly": "https://calendly.com/..." }` in the Formspree JSON response.
- Analytics fan-out: events queue locally and automatically forward to Plausible, PostHog, and Meta Pixel once those libraries are detected. Call `window.runnerAnalytics.register(handler)` to plug in additional destinations.
- Attribution: hidden inputs capture UTM params (`utm_*` + `gclid`/`fbclid`), referrer, and landing URL, and emit a `runner_waitlist_attribution_ready` event for downstream pipelines.

#### Worker `/runner` variant (Supabase-backed)

When Supabase + Sendblue are live, the Worker route can still accept full applications. The details below apply to that flow.

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

**Cloudflare Pages waitlist (`runner-landing.html`):**

- [ ] Load `https://runner.textmarco.com` (or preview) and submit the waitlist form with a test contact.
- [ ] Confirm Formspree records the submission and notification email fires to the ops inbox.
- [ ] Verify success copy renders, the submit button resets, and the Calendly widget appears with the expected URL.
- [ ] Open browser devtools → console and confirm `window.runnerAnalytics.flush()` contains `runner_waitlist_submit`, `runner_waitlist_success`, and `runner_calendly_revealed` events.
- [ ] If Plausible/PostHog/Meta Pixel are configured, confirm events arrive in their dashboards.
- [ ] Run the analytics QA checklist in `apps/live/marco-clean/analytics-installation.md#6-qa-checklist` and log results in `STATE/current_state.md`.

**Worker `/runner` intake (if enabled):**

- [ ] Submit the Worker form and verify `runner_applicants`, `runner_applicant_notes`, and `runners` rows populate via Supabase UI.
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

1. **Configure environment variables**
   - Set `window.__META_PIXEL_ID = '<pixel_id>'` in the Cloudflare Pages project (or inject it via a pre-script).
   - Set `window.__RUNNER_CALENDLY_URL = '<calendly_url>'` so the inline widget points at the right calendar.
   - If you need extra analytics sinks, call `window.runnerAnalytics.register(handler)` in a follow-up script.
2. **Verify Formspree wiring**
   - Submit a test entry and confirm Formspree returns `{ "ok": true }` and the notification email fires to ops.
   - Rotate the Formspree action URL if you change projects (`action="https://formspree.io/f/xbldevoy"`).
   - In devtools console run `window.runnerAnalytics.flush()` and confirm success/error events are recorded.
3. **Smoke-test UX + Calendly**
   - Desktop and mobile (≤480px) renderings should show the CTA and status messaging without horizontal scroll.
   - Toggle offline mode in devtools to confirm error messaging renders.
   - After a successful submission, ensure the Calendly widget loads with the configured URL and can be booked end-to-end.

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

## Meta Lead Gen Import

Use `scripts/import-leadgen.js` to load Meta lead form exports into Supabase and optionally send first-touch SMS from the customer number.

```bash
cd apps/live/marco-clean
npm run leadgen:import -- --csv ./leadgen-import-template.csv
```

The default run imports into `users`, `requests`, and `messages` without sending texts. This is the safe review mode for checking how many rows will load and whether the CSV columns map correctly.

To send outreach after explicit approval:

```bash
npm run leadgen:import -- --csv ./meta-leads.csv --source meta-lead-gen --send
```

Required env for import: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Required env for `--send`: `SENDBLUE_API_KEY`, `SENDBLUE_API_SECRET`, and optionally `SENDBLUE_FROM_NUMBER` (defaults to `+16452063407`).

Accepted CSV headers include `name`, `first_name`, `last_name`, `phone`, `phone_number`, `email`, `city`, `neighborhood`, `address`, `issue`, `project`, `message`, `notes`, `campaign_name`, `ad_name`, and `form_name`.

Default outreach copy:

> Hi {{first_name}}, this is Marco. Thanks for reaching out about property help. What city/neighborhood is the property in, and what do you need handled first? You can reply here with a short note or photos.

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
