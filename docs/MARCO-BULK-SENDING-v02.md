# MARCO Bulk Sending v2 — Build specification

Date: 2026-11-20 · Owner: Josh Gibson · Status: proposed implementation; documentation only.

## Outcome

Send an authorized campaign promptly from a durable cloud worker, independent of Josh’s laptop, Wi-Fi or hotspot. Show honest progress and delivery estimates. Preserve suppression, campaign cutoff, duplicate protection and an immediate submission stop.

“Faster” means both measuring submission rate and improving carrier handoff where the account permits it. An accepted API request is not a delivered message. Do not promise all recipients receive a campaign within a fixed number of minutes without measuring account and carrier behavior.

## Existing baseline and constraints

The Angus sender is a local script with durable JSON state, sequential work, staged checkpoints, and delivery polling. Observed interruptions included network changes, provider account denials, invalid recipients and delivery-check failures. The record does not establish a fixed one-message-per-two-minutes rate or prove every delay was caused by throttling.

At owner stop: 1,566 provider-accepted, 45 rejected, 1,707 not sent. Preserve the source journal and PAUSE-BULK marker. Import accepted SIDs as already sent, rejected attempts with their reasons, and unsent recipients as paused. Uncertain submissions must remain held. Import is not authorization to send or to reset accepted recipients.

The deployed once-only fixed reply remains a separate mode. Bulk pause and conversational reply pause must be independent, visible controls.

## Architecture

- Existing Express web service: admin API, signed inbound and delivery callbacks, operator dashboard.
- Dedicated always-on cloud worker: database-backed scheduling and dispatch, separate from web-request lifecycle.
- Supabase Postgres: campaign state, recipient jobs, durable leases, provider events, suppressions and audit records.
- Twilio: outbound SMS/MMS and status callbacks. Use verified effective number/account/channel limits; account suspension is a hard stop, not a condition to bypass.
- Existing media and branded per-recipient links remain reusable. Register links before sending; mark sent after provider acceptance through a retryable local bookkeeping job. A bookkeeping failure must never cause the message itself to be resent.

## Rate and speed design

Measure current Twilio account/number throughput, API concurrency, SMS segment rates and MMS limits separately. Store the confirmed limits with source/date. Start worker concurrency conservatively, then tune using measured acceptance latency and provider feedback. Use a shared account/sender token bucket across all workers, with headroom for replies.

Do not wait for every recipient’s final delivery receipt before submitting the next job. Delivery callbacks update state asynchronously. A small launch canary remains useful; after it passes, dispatch continuously within configured bounds. Periodic reconciliation is a fallback, not the main loop.

Bound the provider backlog to a configurable time horizon (initial proposal: 2 minutes of confirmed throughput). Avoid dumping the entire audience into an hours-long provider queue: it weakens late opt-out and cutoff control. Priority order: requested conversational replies, then bulk campaign jobs. Never rotate numbers to evade provider limits.

Planning arithmetic, not account promises: 3,318 messages at an effective handoff rate of 1 message/second takes about 55 minutes; at 3/second, about 18 minutes. Carrier delivery can take longer. These are message rates for the example, not an assertion that this number has those MMS limits.

## Durable job state and dispatch

Campaign fields: ID, property, content/media version, audience snapshot, sender, approved launch, status, budget ceiling, timezone, earliest send, hard cutoff, rate configuration, and stop reason.

Recipient jobs: campaign + normalized phone unique key; content version; status; attempt ID; lease owner/expiry; next-attempt time; provider SID; error; timestamps; link token; suppression evidence. Encrypt or access-restrict phone data, keep it out of ordinary logs.

States: draft → eligible → ready → leased → submitting → accepted → sent → delivered / undelivered. Separate suppressed, expired, rejected, retry_wait and uncertain states. A provider failure and a local bookkeeping failure must remain distinguishable.

Workers claim ready jobs atomically using a database function/transaction with row locks and skip-locked behavior. Immediately before POST, recheck campaign running state, cutoff, budget, suppression and dispatch lease. Persist submitting intent before contacting Twilio. Database uniqueness prevents duplicate jobs; leases prevent concurrent workers claiming the same job.

Exactly-once external sending is not assumed. If a worker dies or times out after submitting but before recording the SID, mark uncertain and reconcile provider records/callbacks before any retry. Use a job-correlated signed callback URL to recover SID association where possible. A submitting lease must never simply expire back into ready. Read retries may use bounded exponential backoff/jitter; send retries require evidence of definite rejection. Auth/account errors stop dispatch; invalid-number errors suppress or reject that recipient without stalling the whole list.

## Delivery events, stop and opt-outs

Configure per-message StatusCallback or a verified service callback. Verify Twilio signatures against the externally visible URL; durably ingest quickly, then process asynchronously. Deduplicate callbacks and retain an event ledger. Handle out-of-order events without downgrading delivered to sent. Store provider error codes and periodically reconcile missing outcomes with paginated reads.

Global suppression is a shared source of truth for bulk and replies. Recheck at dispatch; STOP immediately removes ready/retry jobs from eligibility. Never reactivate on reimport. Confirm any future resubscription through an explicit approved flow.

Pause is authoritative in the database, observed by all workers. Target: no new POSTs more than 2 seconds after pause, except already in-flight requests. Show accepted/in-flight counts separately. Attempt cancellation only for provider statuses whose cancellation is supported; report what cannot be recalled. Do not claim a pause retracts delivered or accepted messages.

At cutoff, expire all unsubmitted jobs. Bound queueing and use provider validity controls where supported to reduce late delivery; no guarantee can recall messages already handed to carriers. Never auto-resume a campaign after owner pause, account suspension or an expired send window.

## Dashboard and monitoring

Show ready, submitting, accepted, sent, delivered, undelivered, suppressed, uncertain and expired counts. Display actual submission and carrier-handoff rates, oldest queued age, estimated completion with confidence/assumptions, spend estimate, provider restrictions and last worker heartbeat.

Track replies, opt-outs, and unique tracked-link browser recipients separately. Label click metrics as estimates, distinguish previews, exclude tests, and state whether the denominator is accepted or delivered. SMS/MMS open receipts are not promised.

Controls: preview approved content/audience, launch, pause, resume after review, terminate remainder, inspect failures, and export results. Authenticated actions have an audit trail. Alerts: dead worker, stalled queue, account/auth denial, abnormal failure or opt-out rates, budget/cutoff risk. Initial failure/opt-out thresholds retain existing settings until explicitly reviewed; avoid treating carrier “sent” as either confirmed delivered or stuck queued.

## Implementation sequence

1. Instrument baseline timings; verify actual provider limits and define measurable launch target.
2. Create migrations, unique jobs, suppression adapter, dispatch leases and migration dry run. Reconcile imported counts exactly against the retained journal.
3. Build callbacks and state transitions; integrate tracked-link bookkeeping.
4. Build worker, shared limiter, uncertainty reconciliation, cutoff and pause controls.
5. Add operator progress screen and alerts; reserve capacity for Marco replies.
6. Run synthetic load/failure tests, then an explicitly authorized small live pilot. Compare accepted/hour, delivered/hour, latency, errors and cost before expanding.

## Acceptance checks

- A 3,318-job synthetic campaign drains at at least 90% of a configured test-provider rate when healthy; this measures our worker, not real carrier delivery.
- Closing the laptop/network switching has no effect on the cloud worker.
- Two workers, duplicate jobs, restart and lease expiry cannot resubmit accepted jobs.
- Crash after POST produces an uncertain job, not an automatic duplicate.
- Duplicate/out-of-order callbacks produce accurate stable totals.
- STOP racing dispatch blocks unsent work; any already-in-flight message is disclosed.
- Pause, cutoff and budget limits are enforced across workers; owner pause survives deployment.
- Provider account denial stops promptly; invalid recipient does not halt unrelated eligible jobs.
- No bookkeeping or tracking retry resends the underlying MMS.
- Imported Angus totals reconcile; 1,566 accepted messages are not resent. No live campaign starts during migration.
- Pilot report separates internal queue delay, provider acceptance, carrier handoff and final delivery; no unsupported speed claim.

## Decisions before rollout

Confirm effective MMS/SMS limits, worker hosting cost, campaign spend ceiling, permitted sending window, queue horizon, and alert destination. Reuse the current sender unless a legitimate provider-approved change is needed. A throughput increase is a provider request, not something concurrency alone guarantees.

## Primary technical references

Checked 2026-11-20. Provider limits must still be verified for this account.

- [Twilio MMS account rate limits](https://help.twilio.com/articles/360034954613): API submission concurrency and MMS throughput are distinct constraints.
- [Twilio message resource](https://www.twilio.com/docs/messaging/api/message-resource): message states, status callbacks and message lifecycle controls.
- [Twilio scaling practices](https://www.twilio.com/docs/messaging/guides/best-practices-at-scale): do not multiply sending numbers to evade throughput limits.
- [Twilio queue monitoring](https://help.twilio.com/hc/en-us/articles/55716624158875-How-do-I-monitor-message-queue-depth-and-throughput): inspect queue depth and throughput when diagnosing delivery backlog.

Related: [MARCO Agent Assist v01](MARCO-AGENT-ASSIST-v01.md). Build the shared delivery foundation first; enable conversation mode separately. Documentation does not authorize restarting the paused campaign.


## Researched speed target — Nov 20 evening

Measured local journal: last 500 accepted submissions took 23.3 minutes (approximately 21.4/minute). Remaining 1,707 jobs imply approximately 80 minutes at that observed rate, excluding new interruptions and final carrier delivery. Live suppression check found no additional exclusions among those 1,707; recheck at dispatch.

Twilio’s [toll-free MMS throughput documentation](https://help.twilio.com/articles/4411046744987-Toll-Free-SMS-and-MMS-messaging-throughput-MPS) states a default 3 MMS/second per toll-free number, with a separate shared account limit of 25 MMS/second. This is a published default, not a verified entitlement for this account. At 3 MMS/second, 1,707 messages require about 9.5 minutes of carrier handoff; 2,000 require about 11.1 minutes. Delivery to handsets may lag.

Proposed engineering target after bounded concurrency, precomputed campaign data, durable queue and asynchronous callbacks: 1,707 submissions/carrier handoffs in roughly 12–20 minutes under healthy conditions and confirmed default throughput (about 4–7x the current measured pace). For 2,000 messages plan roughly 15–25 minutes. These are untested estimates, not delivery guarantees or capabilities of the existing runner. A measured pilot must establish actual performance. No additional paid throughput upgrade is assumed. Requesting an increase is a later option if the confirmed sender limit proves insufficient.

The scheduled Nov21 10:30AM restart does not mean v2 has been implemented. Before that run, distinguish tested improvements from the existing approximately80-minute baseline.


## Dashboard release alignment

Owner requires the shared live progress dashboard in MARCO Agent Assist v01. Its detailed requirements and acceptance checks are in that spec. V2 supplies durable delivery events, rates, queue estimates and authoritative controls to the same dashboard; do not create a separate monitoring product or defer all visibility until the faster sender is complete.


Public contact policy: use Josh’s business line310-295-1136 only. Never populate campaign contact details from historical test recipients or the personal number. Validate content against the approved business contact configuration before launch.
