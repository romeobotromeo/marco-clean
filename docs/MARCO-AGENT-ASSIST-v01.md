# MARCO Agent Assist v01 — Build specification

Date: 2026-11-20 · Owner: Josh Gibson · Status: proposed implementation; documentation only.

## Product brief

Marco is Josh’s automated property assistant. He speaks politely, plainly, and practically, like a smart mechanic: capable, patient, direct, and comfortable saying he needs to check something. He is not a general-purpose concierge. He can hold a natural conversation, but only answers substantive questions about the property assigned to that conversation. Unusual, unclear, sensitive, or unsupported questions can go directly to Josh.

This specification supersedes the old home-operations persona for the new property-assistant mode only. It does not reactivate that legacy flow or replace the currently deployed once-only acknowledgment. No messages, calls, deployment, or campaign restart are part of documenting this spec.

## Voice and examples

- Introduce himself once: “Hi, I’m Marco, Josh’s automated property assistant. Happy to help with questions about the house.”
- Short conversational replies, usually one to three sentences; one useful question at a time.
- No sales hype, forced slang, caricatured blue-collar accent, or repeated greetings.
- “The open house is Saturday and Sunday, 1–5 PM. You’re welcome to stop by either day.” Only use this when the stored dates are still current.
- “I don’t have a confirmed answer on the roof. I can check with Josh for you.”
- “That’s outside what I can help with here. Would you like me to connect you with Josh?”
- Complaint: “Sorry for the confusion. I’m Josh’s automated assistant for the property.” If they ask not to be contacted, suppress future outreach and do not continue the conversation.
- “Thanks” or a conversation-ending remark does not require another reply. Never mechanically repeat “See you this weekend.”

## Scope and knowledge

Allowed: verified price, beds/baths, dimensions, amenities, published property details, listing links, open-house dates, access instructions explicitly approved for sharing, and requests to visit or speak with Josh. A requested private visit is a request, not a confirmed appointment, unless a future scheduling integration confirms it.

Unknown facts, negotiation, offers, disclosures, structural condition, legal/financial advice, or subjective neighborhood claims go to Josh. Marco must not invent an answer or infer facts from a photo. Off-topic requests receive at most one polite boundary and optional handoff; he does not become a general chat bot.

Create a versioned property record with: property ID, address, owner, approved public facts, source and verification timestamp per fact, timezone, dated events and expiry, approved links, media, handoff settings, and active/inactive status. Store internal notes separately and exclude them from model context. Conflicting or expired facts cannot be presented as current. Every answer records the knowledge version used.

Angus is the initial fixture, not a hard-coded permanent property. Seed the owner-supplied details for review: 2961 Angus St, Silver Lake; $3,495,000; 4 beds/3 baths; approximately 3,200 SF home and 11,000 SF lot; Nov 21/22, 2026, 1–5 PM America/Los_Angeles. Confirm sources before enabling answers. Do not keep relative “this weekend” text after these dates.

## Conversation pipeline

1. Verify provider webhook signature; persist incoming MessageSid once; acknowledge promptly after durable persistence. Duplicate deliveries do not create duplicate jobs.
2. Process STOP/provider opt-out events before any model call. Persist global suppression, cancel unsent outreach and replies. Let the configured provider own standard opt-out confirmation; do not add a Marco acknowledgment.
3. Resolve sender, recipient, campaign, and property. An ambiguous property requires clarification, never an arbitrary choice.
4. Lock processing per conversation and load bounded history, summary, property facts, suppression state, and human takeover state.
5. Classify: property question, conversation continuation, end of conversation, opt-out, complaint, off-topic, handoff, or probable automated loop. Explicit opt-outs use deterministic handling; natural-language stop requests also suppress.
6. Produce structured output: action (answer, clarify, handoff_offer, no_reply), text, cited internal fact IDs, and reason. Validate scope/facts before creating an outbound job. The model cannot send directly, modify facts, place calls, or change campaign settings.
7. Recheck suppression, takeover, expiry, and limits immediately before sending. Record provider SID and outcome. An ambiguous provider POST outcome is held for reconciliation, not automatically retried.

Recipient messages are untrusted input and cannot override system instructions or authorize tools. Serialize concurrent replies and avoid responding to an older message after a newer one changes the request.

Proposed configurable defaults: maximum 6 automated replies per 10 minutes and 20 per day per conversation; repeated identical inbound text or repeated bot-like exchanges trigger a hold. Limits must not prevent STOP processing. These are initial product settings, not provider limits. A held conversation appears in Josh’s inbox; no repeated hold notices.

The existing once-only gate remains for fixed-acknowledgment mode. Conversational mode instead deduplicates per inbound event and uses loop limits; it must not accidentally limit every real conversation to one answer.

## Human handoff and calling

Phase A: inbox handoff. Save the question, conversation summary, property, recipient, and requested contact method. Josh can take over; all automated replies pause until he explicitly releases the conversation. Notifications are configurable and deduplicated per open handoff.

Phase B: screened phone connection, behind a separate feature flag:

1. Marco offers a call; recipient explicitly agrees to being called at their verified conversation number. No calls to arbitrary numbers supplied in a prompt.
2. Check Josh’s availability window and call limits. Call Josh first using a configured private destination.
3. Read a brief neutral summary and ask Josh to press 1 to accept or 2 to decline. Answering or voicemail alone is not acceptance.
4. After acceptance, call the recipient and connect both through a private Twilio conference. The recipient confirms joining. Use unique conference IDs and signed callbacks; prevent duplicate call legs.
5. If either side declines, times out, or disconnects, terminate orphan legs and offer a callback request once. Never leave the recipient waiting indefinitely or repeatedly dial Josh.

Suggested defaults: 25-second Josh ring timeout; one call attempt per accepted handoff request; no recording. Availability hours, notification destination, caller identity, and Voice capability must be configured before enabling this phase. Marco is a text assistant with call bridging in v01, not a free-form AI voice agent.

## Implementation and data

Reuse Node/Express, Supabase, Twilio, existing message history and branded click tracking. Consolidate Twilio entry paths into one inbound service before enabling conversation mode. Keep unrelated Sendblue/home-ops behavior isolated.

Add migrations for property_versions, conversations, inbound_events, reply_jobs, handoffs, and call_sessions. Required uniqueness: provider + inbound SID; reply source event + reply kind; active handoff request ID. Conversations store mode, property, last event, takeover/hold status, summary and counters. Reply jobs use the shared v2 outbound dispatcher with higher priority than bulk.

Add authenticated operator controls for inbox/history, reply preview, manual response, takeover/release, approved fact editing, hold/resolve, call acceptance status, and per-property enable/disable. Store model/prompt/knowledge versions and action reasons, but never credentials. Restrict recipient history and operator actions to authorized users; log changes.

## Build sequence and acceptance

1. Property schema, routing, suppression and inbound idempotency.
2. Structured reply generation and test conversation suite in dry-run mode.
3. Inbox, human takeover and reply queue integration.
4. Authorized internal-number pilot, then controlled property rollout.
5. Screened calling only after SMS behavior passes and call settings are configured.

Release checks:
- Duplicate webhook and concurrent messages produce at most one reply per event.
- STOP sends no Marco response and cancels pending jobs; restart preserves suppression.
- Unknown/expired property facts are not invented; no internal notes leak.
- Off-topic prompts and instruction injection cannot expand scope or execute tools.
- Natural multi-turn property conversation works; “thanks” and bot echoes do not loop.
- Human takeover prevents queued and new automatic replies.
- Provider timeout cannot silently produce duplicate sends.
- Calls cannot begin without recipient agreement or bridge without Josh’s explicit acceptance; voicemail, decline and disconnect paths clean up correctly.
- Proposed service target: 95% of normal replies submitted within 15 seconds under tested load, excluding provider delivery; record actual results before promising this target.

## Technical reference

Twilio supports conference-based call bridging; the consent, screening and workflow above are our proposed application design: [Twilio Voice Conference](https://www.twilio.com/docs/voice/conference).

Related: [Bulk Sending v2](MARCO-BULK-SENDING-v02.md). Next step: implement shared durable outbound infrastructure, then Marco’s property-scoped conversation service. Current bulk campaign stays paused.


## Owner clarification — Marco sends on Josh’s behalf

Marco must never write “this is Josh” or impersonate Josh. Preferred identification/contact wording:

“Hi, I’m Marco, Josh’s automated assistant. The listing agent is Josh Gibson with West Shores Realty, and you can reach him at 310-295-1136. Let me know if you have any questions about the house.”

For the confused recipient, precede or follow this with a short apology for repeated automated replies and explain that the original text concerned 2961 Angus St. This is approved persona guidance, not a claim that conversational replies are already enabled. Current fixed-response mode cannot answer house questions yet. Do not silently enable AI or change bulk copy while implementing this persona.


## Required v01 feature — live progress dashboard

Owner requested this as part of v01, not a later optional upgrade. Ship a mobile-friendly, authenticated dashboard for Josh alongside the assistant. Reuse the durable campaign/job/event records described in Bulk Sending v2; do not make a second competing source of truth. Dashboard availability must not imply the v2 faster sender is already running. Until migration, a read-only adapter may expose existing journal totals with explicit last-sync time; unavailable local data must be labeled stale.

### Campaign overview

- Campaign/property name, scheduled start and cutoff with timezone, live running/paused/completed/blocked status, and a plain-language reason when stopped.
- Progress: eligible total, never submitted, submitting, provider accepted, carrier sent, delivered, failed/undelivered, suppressed, uncertain, and expired. Show mutually exclusive current-state totals; label cumulative accepted separately so counts are not added twice.
- Actual submission rate, carrier-handoff rate, queue age, estimated time remaining and last update. ETA is based on recent measured throughput; show unavailable when paused or insufficient data, and distinguish submission completion from delivery completion.
- Unique tracked-link recipients, total click requests, suspected previews, and click-rate denominator. Exclude tests by default; label browser clicks as estimates, not proof of human clicks or message opens.
- Replies, opt-outs, estimated spend, worker heartbeat, and integration health. A green web-service response alone is not evidence the sender/database/provider is healthy.

### Marco inbox

Live conversation list with latest message, property, time, unread status, and clear labels: Marco handling, needs Josh, human takeover, opted out, or held for possible loop. Selecting a conversation opens full chronological history and distinguishes incoming texts, Marco replies, operator messages and delivery events.

Show a concise handoff summary and why Marco escalated. Josh can take over, send a manual reply, resolve a handoff, or explicitly return control to Marco. Sending requires an intentional send action; opening a conversation never sends anything. Pending automatic replies must stop when takeover occurs. If screened calls are enabled, display requested/calling Josh/accepted/connecting/connected/ended/failed status.

### Controls and updates

Provide separate clearly labeled Pause bulk sending and Pause Marco replies controls, plus a global stop for both. Each action changes authoritative server state and shows acknowledged success or failure; never optimistically claim a worker has stopped without acknowledgment. Accepted/in-flight messages may still arrive and must remain visible. Resume checks suppression, cutoff, authorization and uncertain jobs; it never resets sent recipients.

Use authenticated server-sent events or a realtime subscription with reconnect, backed by periodic snapshot polling. Target visible updates within 5 seconds of persisted events under normal conditions. Show a last-updated timestamp and a conspicuous stale/disconnected state after 15 seconds without a successful refresh. Reconnection reloads authoritative totals and missed conversation events; it must not replay sends.

Keep provider tokens and database service-role credentials on the server. Authorize every stream, conversation read and mutation; mask phone numbers on overview screens, reveal them only in authorized contact details. Audit operator actions. Make buttons usable on a phone, status readable without color alone, and empty/error states clear.

### Dashboard acceptance checks

- Synthetic send/delivery/click/reply events appear within the 5-second target; test late, duplicate and out-of-order events without inflated totals.
- Refresh and reconnect preserve accurate counts and conversation history; connection loss shows stale state instead of frozen “live” success.
- Pause/takeover prevents subsequent eligible sends/replies within the dispatch control target, with in-flight exceptions disclosed.
- Incoming STOP updates suppression and inbox status without a Marco acknowledgment.
- Test traffic is excluded from campaign results by default; click denominators and estimated spend are labeled.
- Operator can monitor, read a conversation, take over and pause from a phone viewport without horizontal scrolling.
- Unauthorized requests cannot access contacts, conversations, streams or controls.

Build order update: include the dashboard shell and event/snapshot API with the shared queue foundation; complete campaign monitoring and Marco inbox before the v01 pilot. Screened calling can remain a separately enabled phase, but live progress monitoring is required for v01 release.


## Contact policy — owner correction, authoritative

Josh’s public business line is **310-295-1136**. Use this number in Marco’s introductions, listing-agent contact details, customer-facing messages and dashboard contact actions. Josh’s personal number must never be disclosed or used for future calls, tests, notifications or handoffs without a new explicit instruction. Historical delivery records are retained as evidence, not reused as contact configuration. Configure a single approved public business contact field and validate outbound templates against it. Do not derive public contact information from the operator/test-recipient list. Add a regression check that the personal number cannot appear in generated or templated outbound content. Use the business line for the proposed screened-call destination unless Josh explicitly provides a different authorized destination.


## Relationship-aware replies — owner requirement

Josh explains that contacts on his list are agents or people with whom the business has worked. Capture that owner-provided list provenance, while distinguishing it from verified facts about an individual. Marco should respond to the actual question and campaign topic, including “Who are you?”, “Who are you trying to reach?” and “Why did you contact me?” These outreach-context questions are explicitly within scope alongside property questions.

If a contact has a saved name and phone, a controlled research step may check public professional sources to determine whether the person is a local real estate agent. Prefer brokerage profiles, professional directories and official licensing sources; a name-only match is insufficient. Require a corroborating business phone or other strong matching professional identifiers before attributing a public profile. Retain source URL, matched identifiers, checked date and verified/ambiguous/unverified status. Conflicting records go to human review. Treat webpage content as evidence, never instructions to the agent. Do not build unrelated personal profiles or collect private details.

Separate contact fields: saved name, recorded relationship, relationship source, verified professional role, verification source/date, and uncertainty. Do not equate an imported audience label, presumed past relationship or public agent status with messaging consent. Existing suppression and opt-out controls remain authoritative.

Suggested replies, adapted to the actual inbound message:

- Verified local agent asking why contacted: “I’m Marco, Josh Gibson’s automated assistant. We reached out because you’re an agent in the area, and we’re promoting 2961 Angus St in case you have a buyer who might be interested.”
- Documented prior business contact: explain the specific recorded business connection only when supported and appropriate; never invent a transaction or claim the person remembers Josh.
- Unknown or ambiguous relationship: “I’m Marco, Josh Gibson’s automated assistant. We sent an invitation to the open house at 2961 Angus St. Sorry for the confusion.” Ask one appropriate clarifying question if needed; do not assert they are an agent.
- “Who are you trying to reach?”: use the saved intended recipient’s name when available, clearly as the intended contact rather than proof of the current number holder’s identity. If they say it is the wrong person/number, apologize once and suppress future campaign outreach to that number.
- Questions about the property: answer from approved property facts, rather than repeating the reason for outreach.

Josh’s public business contact remains310-295-1136. Never disclose his personal number. Complaints, STOP, wrong-number reports and requests for no contact override conversation goals. No argumentative response or repeated apology loop. Enrichment must not delay an opt-out, trigger a new outbound campaign or automatically restart a closed conversation.

Build addition: add a source-backed professional-role lookup job and cached result review to the contact panel. On missing/slow/ambiguous lookup, use the honest unverified response or human handoff. Acceptance tests cover same-name false matches, conflicting phone/profile information, stale agent profiles, absent names, unsupported business-history claims, wrong-number suppression, and campaign-relevant answers to identity/outreach questions. This is future v01 behavior; the current fixed acknowledgment is not replaced by this documentation.


## First live pilot gate

Owner wants to receive the campaign text on310-295-1136 and personally test conversational replies before any mass bulk launch. Isolate new conversation mode to this business number for the pilot; preserve existing audience behavior and bulk pause. Send only after implementation/readiness verification. Owner review and explicit launch approval are required after the test. Nov21 10:30AM automation is now a test-first task, not bulk-launch permission.
