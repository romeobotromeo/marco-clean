# MARCO Outreach

Josh’s messaging system: MARCO Agent Assist v01, live campaign monitoring, and the v2 bulk dispatcher.

## Implemented locally

`approval-gate.cjs` requires explicit owner confirmation, matching campaign/content, expiry and a passed owner-reviewed conversational test before bulk. Test permission only allows the business line. The existing Angus sender checks this gate at startup and immediately before each Twilio submission. The campaign approval record is initialized paused with no approvals. A scheduled task cannot grant permission.

## Still to implement

Conversational transport/model integration, durable cloud worker, screened calling and full operator controls remain in the build specs. Do not describe these as deployed.

## Campaign improvement cycle

After each run, save a review under `outreach/reviews/`: campaign/content/code versions, intended audience and exclusions, actual submission/delivery timings, errors, opt-outs, estimated clicks, confusing conversations, and owner feedback. Select specific fixes, add regression cases, test them, then version the next release. Never let a model rewrite or deploy itself from recipient messages. Preserve history and owner approval; improvements do not imply permission to send again.

See ../docs/MARCO-AGENT-ASSIST-v01.md and ../docs/MARCO-BULK-SENDING-v02.md.


## Angus dashboard

Run from the app root: `node --env-file=.env.operator outreach/dashboard-server.cjs`.
Private access URL is written to BB thread storage `marco-dashboard-url.txt`; the random token changes on restart. Binds127.0.0.1:4317 only. Local journal refreshes on each dashboard poll (5sec); cloud replies/clicks refresh every30sec. Read-only HTTP routes: no send or resume action. Access to JSON requires a random session token. Cloud provider credentials stay server-side. Delivery values are explicitly labeled as historical journal observations, not fresh carrier reads. Latest200 campaign messages only; full archive/inbox tooling comes later. Local host must remain awake/online.

Validated: real counts and cloud replies/click report loaded; unauthenticated data request returns401; existing bulk resume fails before provider access while gate closed. Browser host was unavailable, so rendered desktop/mobile layout still needs visual verification. No external messages or deployment from this build.
