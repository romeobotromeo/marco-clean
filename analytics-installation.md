# Marco Runner Analytics Installation Playbook

Use this playbook to wire tracking for the runner waitlist (Cloudflare Pages) and the Worker/API surfaces. It assumes you have access to Cloudflare Pages, Formspree, Plausible, PostHog, and Meta Business Manager. Keep all secrets out of Git; inject them via provider dashboards.

---

## 1. Event Reference

The landing page pushes the following events via `window.runnerAnalytics.track(event, payload)`:

| Event | Fired when | Payload keys |
| --- | --- | --- |
| `runner_waitlist_view` | Form detected on page load | `label` |
| `runner_waitlist_attribution_ready` | UTM/referrer fields captured | `label`, `utm_*`, `gclid`, `fbclid`, `referrer`, `landing_url` |
| `runner_cta_click` | Any CTA (header, hero button) clicked | `label` |
| `runner_waitlist_submit` | Form submit initiated | `label` |
| `runner_waitlist_success` | Formspree success | `label`, `email`, `phone_last4`, `response_ms` |
| `runner_waitlist_error` | Formspree error | `label`, `error` |
| `runner_calendly_revealed` | Calendly container shown | `label`, `url` |
| `runner_calendly_initialized` | Calendly widget initialised | `label`, `url` |
| `runner_calendly_script_*` | Calendly script load status | `label` |

Any new destination can call `window.runnerAnalytics.register(handler)` to receive historical + future events.

---

## 2. Meta Pixel

1. **Create/locate Pixel** in Meta Business Manager.
2. **Add environment variable** in Cloudflare Pages: `window.__META_PIXEL_ID`. In Pages UI, go to *Settings → Environment Variables* and create `META_PIXEL_ID` (value is the numeric pixel ID). Add a small injection script before the analytics block:
   ```html
   <script>window.__META_PIXEL_ID = META_PIXEL_ID;</script>
   ```
   Or, if you prefer `_worker.js`, set `event.waitUntil` to inject `window.__META_PIXEL_ID`.
3. **Verify**: After deployment, visit the page with the Meta Pixel Helper Chrome extension. Ensure `PageView` and `runner_waitlist_*` custom events appear.
4. **Custom conversions**: In Events Manager → Custom Conversions, map `runner_waitlist_success` to “Waitlist submission,” `runner_calendly_initialized` to “Calendly Viewed,” etc. Use the payload to filter by label or UTM.

---

## 3. Plausible Analytics

1. **Create site** `runner.textmarco.com` in Plausible.
2. **Script injection**: Already handled via `<script defer data-domain="runner.textmarco.com" src="https://plausible.io/js/script.js"></script>`.
3. **Forward events**: The landing script auto-registers Plausible when `window.plausible` exists. Custom events appear under *Events*.
4. **Goal setup**: In Plausible → *Goals*, add:
   - `runner_waitlist_success`
   - `runner_calendly_initialized`
   - `runner_waitlist_error`
   Each as “Custom event.”
5. **Dash filters**: Use Plausible’s filters to segment by `utm_*` props (available in event props since we forward them).

---

## 4. PostHog

1. **Create project** or reuse existing PostHog instance.
2. **Load script** via Cloudflare Pages `_headers` or inline script. Example snippet:
   ```html
   <script>
     !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(o=t.createElement("script")),(n=t.getElementsByTagName("script")[0]).parentNode.insertBefore(o,n),o.async=1,o.src=s.api_host+"/static/array.js",r=e;var l=["capture","identify","alias","people.set","people.set_once","people.unset","people.increment","people.append","people.union","people.track_charge","people.clear_charges","people.delete_user","group","groupIdentify"];for(p=0;p<l.length;p++)g(r,l[p]);e._i.push([i,s,a])};e.__SV=1)}(document,window.posthog||[]);
     posthog.init('YOUR_POSTHOG_KEY',{api_host:'https://app.posthog.com'});
   </script>
   ```
3. **Auto-forward**: The landing script registers PostHog automatically once `posthog.capture` exists.
4. **Event taxonomy**: Mirror the table in section 1. For funnels, create a `runner_waitlist_success` funnel → `runner_calendly_initialized` to measure drop-off.

---

## 5. Conversion Tracking & UTMs

### Formspree Payload
- Hidden inputs now capture:
  - `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`
  - `gclid`, `fbclid`
  - `referrer`
  - `landing_url`
- These fields are included in the POST to Formspree. Export submissions from Formspree for attribution analysis.
- Create Formspree rules/webhooks to forward leads to your CRM or Supabase ingestion Lambda if desired.

### Supabase Routing (optional)
- If you later switch back to the Worker intake (`/runner/apply`), add equivalent columns to `runner_applicants` (e.g., `utm_source`, `utm_medium`, etc.).
- Update `handleRunnerApplication` to read `req.body.utm_source` etc. and persist them.

### Review Process
1. **Daily**: Check Plausible custom events dashboard for total submissions and success/error ratios. Export CSV weekly.
2. **Weekly**: Pull Formspree export → load into a shared Google Sheet (`analytics/runner-waitlist-attribution.xlsx`). Pivot by `utm_source`, compile conversion rate.
3. **Monthly**: Compare Plausible totals vs. Formspree totals vs. Meta conversions to ensure parity (<5% variance). Investigate gaps (ad blockers, script errors).

---

## 6. QA Checklist (run after every deployment)
- [ ] `window.runnerAnalytics.flush()` shows real-time events.
- [ ] Hidden inputs populate with UTM/referrer values when query params provided.
- [ ] Meta Pixel Helper logs `runner_waitlist_success`.
- [ ] Plausible events appear with correct props (check in devtools network tab: `/api/event`).
- [ ] PostHog events visible within 2 minutes.
- [ ] Formspree email received + dashboard shows payload with attribution fields.
- [ ] Calendly widget loads with `window.__RUNNER_CALENDLY_URL`.

---

## 7. Troubleshooting
- **Events missing:** Open console, run `window.runnerAnalytics` to ensure object exists. Use `window.runnerAnalytics.register((e)=>console.log(e))` for debug.
- **Meta Pixel blocked:** Confirm `window.__META_PIXEL_ID` set before analytics script; ensure ad blockers disabled when testing.
- **UTM fields empty:** Verify query params present. For internal links, append UTMs manually or implement campaign builder.
- **Plausible duplicates:** Avoid calling `plausible` manually; rely on auto forwarding to prevent double counts.
- **Calendly not loading:** Check browser console for network errors; the script emits `runner_calendly_script_error` if CDN blocked.

---

Document any changes in this playbook and update `STATE/current_state.md` under “Deployed assets”/“Workflows” to keep operators aligned.
