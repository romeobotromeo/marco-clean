# Marco — SMS Website Builder

Marco lets people build a website by text message. Text a number, answer 5 questions, get a live site at `*.textmarco.com`. $9.99/mo.

Live server: **https://marco-clean.onrender.com**
Marketing page: **https://textmarco.com** (served by Cloudflare Worker)

---

## How It Works

1. User texts one of the Marco numbers
2. Claude (via Anthropic API) guides them through 5 questions: business or personal, name, type, description, contact info
3. Server generates HTML via `template-engine.js`, deploys to Cloudflare Pages as `{slug}.textmarco.com`
4. User gets a payment link ($9.99/mo via Stripe)
5. On payment, site goes live and user gets a confirmation text
6. User can keep texting Marco to make changes

---

## Stack

| Layer | Tech |
|---|---|
| Server | Node.js / Express on Render |
| Database | PostgreSQL on Render (marco-db) |
| AI | Claude Sonnet (`claude-sonnet-4-5`) via Anthropic SDK |
| SMS (primary) | SendBlue — 645 number: `+16452063407` |
| SMS (toll-free) | Twilio — 888 number: `+18889007501` |
| Site hosting | Cloudflare Pages (`*.textmarco.com`) |
| Subdomain proxies | Cloudflare Workers (one per property site) |
| Payments | Stripe (checkout session, $9.99/mo) |

---

## Environment Variables

```
DATABASE_URL              Render PostgreSQL connection string
ANTHROPIC_API_KEY         Claude API key
SENDBLUE_API_KEY          SendBlue API key
SENDBLUE_API_SECRET       SendBlue API secret
TWILIO_ACCOUNT_SID        Twilio account SID
TWILIO_AUTH_TOKEN         Twilio auth token
STRIPE_SECRET_KEY         Stripe secret key
STRIPE_WEBHOOK_SECRET     Stripe webhook signing secret
STRIPE_PAYMENT_LINK       Stripe checkout URL ($9.99/mo)
CLOUDFLARE_ACCOUNT_ID     Cloudflare account ID
CLOUDFLARE_API_TOKEN      Cloudflare API token (Pages + Workers)
ADMIN_SECRET              Password for admin routes (optional, open if unset)
ADMIN_PIN                 PIN for mobile /activate page (default: 1234)
ADMIN_PHONE               Phone number to receive special request SMS alerts
```

---

## Conversation State Machine

```
waitlist → greeting → onboarding (Claude-driven) → building → awaiting_payment → active
```

- **waitlist**: User texted in but hasn't been activated yet
- **greeting**: Marco's opening message sent, waiting for response
- **onboarding**: Claude is asking the 5 questions (handled entirely by Claude)
- **building**: Site is being generated and deployed
- **awaiting_payment**: Site built, payment link sent
- **active**: Paid. User can text changes anytime.

**Opening message**: `"hey it's Marco. are you ready to take the internet by storm? let's build you a site. business or personal?"`

**Secret password**: Text `"chowder"` to skip payment and get 30 days free (Josh referral easter egg).

---

## SMS Routing

Two SMS providers run in parallel. `sendReply()` in `server.js` routes to the correct provider based on which number the conversation came in on.

- **SendBlue webhook**: `POST /sms` — handles inbound from 645 number
- **Twilio webhook**: `POST /sms-twilio` — handles inbound from 888 number

> **SendBlue sandbox note**: New contacts must be manually added in the SendBlue dashboard before they can receive texts. This is a SendBlue sandbox limitation until the account is fully verified.

---

## Key Files

```
server.js               Main Express app — all routes and SMS handlers
template-engine.js      Generates site HTML from collected user info
cloudflare-deployer.js  Deploys sites to Cloudflare Pages, creates DNS records
palmero/                4175palmero.textmarco.com — property listing site
  routes.js             Express router (virtual host + /palmero/* mount)
  templates.js          All HTML/CSS for the site
  config.js             Property data (price, beds, baths, photos, etc.)
  article-generator.js  Daily SEO articles (cron: 2am UTC)
  public/               Photos served at /public/*
dahlia/                 5142dahlia.textmarco.com — property listing site
  routes.js             Same structure as palmero
  templates.js
  config.js
  article-generator.js  Daily SEO articles (cron: 3am UTC)
  public/
index.html              textmarco.com placeholder (NOT what serves the domain — see below)
landing-page.html       Served at /dellvale
```

---

## textmarco.com

The root domain is **not** served from this Express app. It's a Cloudflare Worker named `jolly-water-6728` that serves a "coming soon" page with a waitlist phone capture form. Form submissions POST to `https://marco-clean.onrender.com/marco-waitlist`.

To update textmarco.com, edit `/tmp/textmarco-worker/worker.js` and deploy:
```bash
unset CLOUDFLARE_API_TOKEN   # must unset — wrangler uses OAuth, not API token
cd /tmp/textmarco-worker
npx wrangler deploy
```

---

## Property Sites

Both `4175palmero.textmarco.com` and `5142dahlia.textmarco.com` are virtual-hosted on this Express server via Cloudflare Worker proxies.

**How routing works:**
1. User hits `5142dahlia.textmarco.com`
2. Cloudflare Worker intercepts, proxies to `https://marco-clean.onrender.com/dahlia{pathname}`
3. Express serves the route via `dahliaRouter`
4. Static files (photos) at `/public/*` resolve to `dahlia/public/*` via `express.static(__dirname)`

**To update a property site**: Edit `palmero/` or `dahlia/`, commit, push to `main`. Render auto-redeploys.

**Daily articles**: Both sites have a cron job that generates one SEO article per day using Claude, rotating through 30 keywords defined in `config.js`. Articles appear at `/area-guide`.

---

## Admin Endpoints

All require `?secret=ADMIN_SECRET` or `x-admin-secret` header (unless `ADMIN_SECRET` is unset).

### Conversation Management
| Method | Route | Description |
|---|---|---|
| POST | `/admin/reset/:phone` | Clear all data, set state to greeting |
| POST | `/admin/activate/:phone` | Move from waitlist → greeting, send opening message |
| POST | `/admin/bypass/:phone` | Skip payment, instant active |
| POST | `/admin/delete/:phone` | Delete conversation record |
| GET | `/admin/debug/:phone` | Inspect state + last 10 messages |

### Dashboard & Waitlists
| Method | Route | Description |
|---|---|---|
| GET | `/dashboard` | Admin dashboard — all customers and conversations |
| GET | `/activate` | Mobile activation page (PIN-protected, tap to activate waitlist users) |
| POST | `/activate-user` | Activate a specific waitlist user |
| GET | `/admin/marco-waitlist` | textmarco.com waitlist signups (add `?format=csv` for CSV) |
| GET | `/admin/giveaways` | Giveaway entries for Palmero and Dahlia |
| POST | `/admin/toggle-waitlist` | Toggle waitlist mode on/off |

### Property Sites
| Method | Route | Description |
|---|---|---|
| GET | `/admin/palmero-worker` | Deploy/redeploy Palmero Cloudflare Worker proxy |
| POST | `/admin/palmero-article` | Manually trigger Palmero article generation |
| GET | `/admin/dahlia-worker` | Deploy/redeploy Dahlia Cloudflare Worker proxy |
| POST | `/admin/dahlia-article` | Manually trigger Dahlia article generation |
| POST | `/admin/fix-domains` | Retroactively add Cloudflare DNS to all projects |

---

## Deployment

Hosted on **Render** (free tier — spins down after inactivity, ~30s cold start).

- Push to `main` → Render auto-redeploys
- Start command: `node server.js`
- Database: Render PostgreSQL, tables auto-created on first boot

---

## Database Tables (auto-created on startup)

| Table | Purpose |
|---|---|
| `conversations` | One row per user — state, messages, site data |
| `customers` | Customer status and metadata |
| `waitlist` | SMS waitlist entries |
| `marco_waitlist` | Web waitlist (textmarco.com form) |
| `palmero_giveaway` | Palmero giveaway entries |
| `dahlia_giveaway` | Dahlia giveaway entries |
| `palmero_articles` | Daily SEO articles for Palmero site |
| `dahlia_articles` | Daily SEO articles for Dahlia site |
| `special_requests` | Flagged upgrade/custom requests from active users |
| `app_settings` | Key/value store for runtime toggles (e.g. waitlist mode) |

---

## Local Development

```bash
npm install
DATABASE_URL=... ANTHROPIC_API_KEY=... node server.js
```

Property sites accessible locally at:
- `localhost:3000/palmero/`
- `localhost:3000/dahlia/`

SMS webhooks require a tunnel (ngrok) pointed at `/sms` and `/sms-twilio`.

---

## Planned / In Progress

- **Upgrade queue**: When active users ask about features beyond basic editing (bookings, payments, custom domain), Marco flags them in DB and surfaces them in the dashboard
- SendBlue full account verification (removes sandbox contact restriction)
