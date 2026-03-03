# Marco SMS Website Builder

## What this is
- SMS service that builds websites via text
- Users text, Marco (AI) responds, collects info, builds site

## Current state
- Sendblue 623 number: WORKING
- Twilio 888 number: Approved, needs setup
- Database: Render PostgreSQL (marco-db)
- Server: Render (marco-clean)

## Key files
- server.js — main webhook handlers
- template-engine.js — generates site HTML from business info
- cloudflare-deployer.js — deploys sites to Cloudflare Pages
- landing-page.html — marketing landing page (served at /dellvale)
- migrations/001_add_site_columns.sql — adds site_subdomain + site_html columns

## Architecture
- Two SMS providers: SendBlue (623) + Twilio (888 toll-free)
- sendReply() routes to correct provider based on which number the convo came in on
- Conversation state machine: waitlist → greeting → ask_name → ask_type → awaiting_payment → active
- Sites saved to DB (site_html), disk (sites/*.html), and Cloudflare Pages

## Active Render services
- marco-clean.onrender.com — THE active server (this codebase). All webhooks should point here.
- marco-sms.onrender.com — OLD server. Do not use. Ignore it.

## What we're building
- Add Twilio 888 as second channel alongside Sendblue
- /sms-twilio webhook already coded in server.js
- Needs: TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN env vars on Render (verify these are set)
- Twilio dashboard webhook confirmed pointed at https://marco-clean.onrender.com/sms-twilio

## Current to-dos (left off here)
1. Deploy marco-clean — CORS fix + waitlist phone normalization fix are undeployed
2. Verify TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN set in marco-clean Render env vars
3. Have textmarco.com agent switch waitlist form from marco-sms → marco-clean (blocked on CORS deploy)
4. Test 888 Twilio number end-to-end after env vars confirmed
5. Verify SendBlue 623 webhook → https://marco-clean.onrender.com/sms
6. Verify Stripe webhook → https://marco-clean.onrender.com/stripe-webhook

## Known issues fixed (deployed or pending deploy)
- Waitlist SMS: phone not normalized, missing fromNumber, errors swallowed silently — FIXED in server.js (needs deploy)
- CORS: marco-clean was blocking requests from textmarco.com — FIXED in server.js (needs deploy)

## Environment variables required
- DATABASE_URL — Render PostgreSQL connection string
- ANTHROPIC_API_KEY — Claude API
- SENDBLUE_API_KEY + SENDBLUE_API_SECRET — SendBlue SMS (623 number)
- TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN — Twilio SMS (888 number)
- STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET — Stripe payments
- STRIPE_PAYMENT_LINK — Stripe checkout URL ($9.99/mo)
- CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN — Cloudflare Pages deployment (optional)

## Other routes
- POST /waitlist — web signup form, adds to DB + sends confirmation SMS
- POST /stripe-webhook — handles checkout.session.completed, activates user
- POST /cleanup-expired — cron job, expires unpaid sites after 48hrs (see CRON-SETUP.md)
- GET  /sites/:slug — serves locally generated site HTML
- GET  /dellvale — serves landing-page.html
- GET  /dashboard — admin dashboard (customers + conversations)

## Notes
- "chowder" is the secret password (Josh referral Easter egg) — skips payment, gives 30 days free
- Sites stored 3 ways: DB (site_html), disk (sites/*.html), Cloudflare Pages
- Claude model in use: claude-sonnet-4-20250514

## Admin endpoints
- POST /admin/activate/:phone — move from waitlist to greeting, sends opening message
- POST /admin/bypass/:phone — instant activation (skip payment)
- POST /admin/reset/:phone — reset to greeting for testing
- POST /admin/deploy/:phone — manually deploy site to Cloudflare and text user
- GET  /admin/cloudflare-test — test Cloudflare connection
