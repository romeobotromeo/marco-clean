# MARCO Outreach cloud deployment

Uses the existing paid Render Starter web service and a private Supabase Storage bucket (`marco-outreach`). Queue configuration and manifest are durable; per-job atomic create-only claims prevent replay across restarts. Provider intents/results and signed delivery callbacks are separate records. Any ambiguous POST or bookkeeping failure creates a durable hold. This first release uses a storage-backed queue rather than the future Postgres transactional job schema because the old DATABASE_URL no longer resolves. Do not claim full automatic uncertain-send recovery: operator reconciliation is required.

## Controls

All mutation endpoints require the existing admin bearer credential. Never put it in frontend code. `/outreach/admin/access` returns a separate dashboard-only token. Dashboard has read-only access; it cannot grant send approval.

- GET `/outreach/admin/readiness`: confirms configuration, worker heartbeat and closed gates.
- POST `/outreach/admin/preview` with message/history: AI reply preview only, never an SMS.
- POST `/outreach/admin/confirm-test`: requires exact confirmation `SEND TEST TO 310-295-1136` and evidence of Josh’s explicit permission. First verifies AI availability; then enables business-number-only replies for one hour and submits one test. Do not call before permission.
- POST `/outreach/admin/review-test`: exact `TEST PASSED` plus owner review evidence, only after an accepted test.
- POST `/outreach/admin/approve-bulk`: exact `START REMAINING ANGUS RECIPIENTS` plus separate explicit owner permission, only after passed review. Existing start/cutoff bounds apply.
- POST `/outreach/admin/pause`: pauses bulk; `all:true` also pauses Marco replies.
- POST `/outreach/admin/conversation/:hashedPhone/takeover`: holds automated replies for that conversation.

Approval records are versioned against the imported content. Changing approved content requires a new test/review. Test requests have a durable test marker and cannot be repeated casually. Holds cannot be cleared by a timer or a restart. This release intentionally requires operator reconciliation for an unsuccessful test/reply rather than automatic re-sends.

## Dispatch behavior

Shared atomic time slots cap cloud submissions at2/second, below the published toll-free MMS default3/second. Actual throughput remains unmeasured until an owner-approved pilot. Up to4 pending tasks overlap storage/network waits. Signed callbacks update delivery history. Queue monitoring holds on10% failure (minimum5),5% opt-out (minimum3), or20 messages still queued after2minutes. Carrier-accepted `sent` is distinct from delivered. Per-message validity120seconds bounds Twilio-side backlog; downstream carrier delay can still occur. Remaining current campaign1707 is a maximum, reduced by current suppressions/prior-send checks.

STOP/wrong-number requests suppress before model calls. Per-conversation reply limits6/10min and20/day; repeated identical incoming text holds the conversation. Unsupported questions offer Josh’s business contact and hand off. Property facts and context are separate from the preserved runner/home-ops application.

## Current external prerequisite

Nov20: owner requested migration to GPT. Both Outreach and the older home-ops assistant now use OpenAI Responses, default `gpt-5.4-mini` (override `OPENAI_MODEL`). `OPENAI_API_KEY` is private server configuration. No Anthropic fallback. Replies use strict JSON structure with local fact/contact validation; incomplete responses, refusals and API failures are rejected. Live local GPT previews passed identity, open-house/price, unknown-roof handoff and STOP cases. Owner approved storing the OpenAI key on Render. The authorized API update still returns HTTP403 forbidden; dashboard browser access is unavailable. Commit a062db8 is verified live. BLOCKED-ON-JOSH: add OPENAI_API_KEY in Render environment settings and save/redeploy. Owner authorized one SMS test to the business number; it has not been sent. Bulk remains unapproved.

## Known first-release limits

Private read-only dashboard; manual replies/release controls and full history UI remain later work. Professional-role web enrichment is specified but not enabled. Call bridging and multi-campaign views remain next phases. Two overlapping deployments deduplicate each message with permanent claims; in-flight model work is conservatively held if its processing claim becomes orphaned. Storage claims with no result require manual reconciliation and are surfaced, never auto-retried. The queue has no automatic uncertain-send recovery or self-changing behavior.

## Live GPT test status

Nov20 9:39PM Pacific: GPT live preview passed. Owner-approved single photo test sent to310-295-1136; Twilio MMd0c9938f4654c68f894995d89eb63f4d status sent (not confirmed delivered). Initial MMS-prefix validation caused uncertain result; matched Twilio GET and reconciled result, message log and tracking without resend; related hold cleared. Fix13d915b pushed. One-hour business-number-only conversational test enabled; no bulk grant, no test review. Next owner conversational test and separate approval before bulk.

Nov20 owner explicitly authorized personal number ending1451 for a test only, superseding the earlier test-destination restriction. One MMS MM831c5b11eb77bbb1580e084c3ac91714 accepted/logged. Owner reported canned reply: alternate number had not been included in GPT test route. Fix769577f routes only explicitly selected test.to through GPT; business default preserved. Cloud test.to now1451 for one hour; bulk grant remains absent. Intro changed to Josh’s assistant, with truthful AI disclosure if directly asked. Public contact remains310-295-1136; never include personal number in public copy.

Nov20 10:30PM Pacific: Josh confirmed GPT conversation works and explicitly ordered no further messages to anyone. Cloud pause(all:true) returned200; readiness confirms paused:true, repliesPaused:true, bulkConfirmed:false. Commit232f668 blocks legacy canned replies during full pause while retaining inbound logs and STOP suppression. No automatic restart authorized; new explicit owner permission required.
