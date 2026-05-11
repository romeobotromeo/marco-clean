const CACHE_HEADERS = {
  'content-type': 'text/html; charset=UTF-8',
  'cache-control': 'public, max-age=30',
};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (path === '/runner') {
      return new Response(renderRunnerLanding(), { headers: CACHE_HEADERS });
    }

    return new Response(renderHome(), { headers: CACHE_HEADERS });
  },
};

function renderHome() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Text Marco — Home operations handled by text message</title>
  <meta name="description" content="Text Marco 24/7 for anything around a home. Repairs, access, permits, inspections, cleanups, and vendor coordination handled by SMS.">
  <meta property="og:title" content="Text Marco — Home operations handled by text message">
  <meta property="og:description" content="Text Marco is the 24/7 home operations service. Text (645) 206-3407 for urgent support around a home.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@500;600&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    :root {
      --bg: #F8F6F2;
      --bg-light: #FDFCFA;
      --ink: #0E0E0E;
      --muted: #4F4F4F;
      --soft: #838383;
      --border: #E7E3DB;
      --border-strong: #D7D1C5;
      --accent: #111111;
      --accent-soft: #222222;
      --pulse: #F2F0EA;
      --white: #FFFFFF;
      --font-body: 'Inter', sans-serif;
      --font-head: 'Playfair Display', serif;
    }
    html { font-size: 16px; scroll-behavior: smooth; background: var(--bg); }
    body {
      margin: 0;
      font-family: var(--font-body);
      color: var(--ink);
      background: var(--bg-light);
      -webkit-font-smoothing: antialiased;
    }
    body.modal-open {
      overflow: hidden;
      height: 100%;
    }
    a { color: inherit; }
    .container {
      width: min(1120px, 100%);
      margin: 0 auto;
      padding: 0 24px;
    }
    header {
      position: sticky;
      top: 0;
      backdrop-filter: blur(14px);
      background: rgba(248, 246, 242, 0.92);
      border-bottom: 1px solid var(--border);
      z-index: 50;
    }
    .top-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 64px;
    }
    .brand {
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      font-size: 0.95rem;
    }
    .brand span { color: var(--accent); }
    .top-right {
      display: flex;
      align-items: center;
      gap: 20px;
      font-size: 0.85rem;
      color: var(--muted);
    }
    .top-cta {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      background: var(--accent);
      color: var(--white);
      padding: 10px 18px;
      border-radius: 999px;
      font-weight: 600;
      font-size: 0.85rem;
      text-decoration: none;
      transition: background 0.2s ease;
    }
    .top-cta:hover { background: var(--accent-soft); }
    .top-cta.outline {
      background: transparent;
      color: var(--accent);
      border: 1.5px solid var(--border-strong);
    }
    .top-cta.outline:hover {
      border-color: var(--accent);
      color: var(--ink);
      background: rgba(17, 17, 17, 0.04);
    }
    section { padding: 64px 0; }
    .hero { padding: 92px 0 72px; }
    .hero-grid { display: grid; gap: 48px; }
    .hero-eyebrow {
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.18em;
      color: var(--muted);
      text-transform: uppercase;
      margin-bottom: 20px;
    }
    h1 {
      font-family: var(--font-head);
      font-size: clamp(2.8rem, 8vw, 4.75rem);
      line-height: 1.05;
      letter-spacing: -0.01em;
      margin: 0 0 24px;
    }
    .hero-sub {
      font-size: 1.1rem;
      line-height: 1.7;
      color: var(--muted);
      margin-bottom: 32px;
      max-width: 32rem;
    }
    .hero-cta {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 32px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      border-radius: 999px;
      padding: 16px 28px;
      font-size: 1rem;
      font-weight: 600;
      text-decoration: none;
      transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
    }
    .btn-primary {
      background: var(--accent);
      color: var(--white);
      box-shadow: 0 14px 30px rgba(17, 17, 17, 0.18);
    }
    .btn-primary:hover {
      background: var(--accent-soft);
      transform: translateY(-2px);
    }
    .btn-secondary {
      background: transparent;
      color: var(--ink);
      border: 1.5px solid var(--border-strong);
    }
    .btn-secondary:hover {
      border-color: var(--accent);
      transform: translateY(-2px);
    }
    .hero-number {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 0.95rem;
      color: var(--muted);
    }
    .hero-number strong {
      font-size: 1.25rem;
      color: var(--ink);
      font-weight: 600;
      letter-spacing: 0.02em;
    }
    .hero-card {
      background: var(--white);
      border-radius: 24px;
      border: 1px solid var(--border);
      padding: 28px;
      display: flex;
      flex-direction: column;
      gap: 20px;
      box-shadow: 0 28px 60px rgba(14, 14, 14, 0.08);
    }
    .hero-card-title {
      font-size: 0.95rem;
      text-transform: uppercase;
      letter-spacing: 0.15em;
      color: var(--soft);
      font-weight: 600;
    }
    .hero-card-requests { display: grid; gap: 16px; }
    .request {
      padding: 18px;
      border: 1px solid var(--border);
      border-radius: 16px;
      background: var(--bg-light);
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .request-label {
      font-size: 0.78rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--soft);
      font-weight: 600;
    }
    .request-body { font-size: 0.95rem; line-height: 1.5; color: var(--ink); }
    .request-meta {
      font-size: 0.8rem;
      color: var(--muted);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 999px;
      font-size: 0.75rem;
      background: rgba(15, 15, 15, 0.08);
      color: var(--accent);
      font-weight: 600;
    }
    .section-heading {
      font-family: var(--font-head);
      font-size: clamp(2.1rem, 5vw, 3.2rem);
      margin-bottom: 18px;
      line-height: 1.1;
    }
    .section-subhead {
      font-size: 1.05rem;
      line-height: 1.7;
      color: var(--muted);
      max-width: 38rem;
      margin-bottom: 36px;
    }
    .help-grid {
      display: grid;
      gap: 16px;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    }
    .help-item {
      padding: 18px 20px;
      border-radius: 16px;
      border: 1px solid var(--border);
      background: var(--white);
      font-weight: 600;
      font-size: 0.98rem;
      color: var(--ink);
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .help-item::before {
      content: '';
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--accent);
      flex-shrink: 0;
    }
    .how { background: var(--bg); }
    .steps {
      display: grid;
      gap: 18px;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    }
    .step {
      background: var(--white);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 32px 28px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .step-number {
      font-size: 0.8rem;
      font-weight: 600;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: var(--soft);
    }
    .step-title { font-size: 1.35rem; font-weight: 600; letter-spacing: -0.01em; }
    .step-copy { font-size: 0.98rem; line-height: 1.7; color: var(--muted); }
    .agents {
      background: var(--accent);
      color: var(--white);
      border-top: 1px solid var(--border);
      border-bottom: 1px solid var(--border);
    }
    .agents .section-heading { color: var(--white); }
    .agents .section-subhead { color: rgba(255, 255, 255, 0.72); }
    .agents-grid {
      display: grid;
      gap: 24px;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    }
    .agents-card {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 22px;
      padding: 34px 32px;
      font-size: 1.05rem;
      line-height: 1.8;
      color: rgba(255, 255, 255, 0.84);
      display: grid;
      gap: 18px;
    }
    .waitlist-card {
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.24);
      border-radius: 22px;
      padding: 28px;
      color: rgba(255, 255, 255, 0.92);
      display: grid;
      gap: 18px;
    }
    .waitlist-title {
      margin: 0;
      font-size: 1.4rem;
      font-weight: 600;
    }
    .waitlist-sub { margin: 0; font-size: 0.95rem; color: rgba(255, 255, 255, 0.72); }
    .waitlist-form { display: grid; gap: 14px; }
    .form-row { display: flex; flex-direction: column; gap: 12px; }
    .form-row.two {
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    }
    .waitlist-input {
      width: 100%;
      min-height: 48px;
      padding: 12px 14px;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.24);
      background: rgba(17, 17, 17, 0.25);
      color: #fff;
      font: inherit;
    }
    .waitlist-input::placeholder { color: rgba(255, 255, 255, 0.5); }
    .waitlist-input:focus {
      outline: none;
      border-color: rgba(255, 255, 255, 0.6);
      background: rgba(17, 17, 17, 0.35);
    }
    .waitlist-submit {
      width: 100%;
      justify-content: center;
      font-size: 1rem;
      min-height: 52px;
    }
    .waitlist-note {
      margin: 0;
      font-size: 0.85rem;
      color: rgba(255, 255, 255, 0.55);
      text-align: center;
    }
    .form-feedback {
      margin: 0;
      font-size: 0.88rem;
      text-align: center;
      min-height: 1.2rem;
      color: rgba(255, 255, 255, 0.7);
    }
    .form-feedback.success { color: #8ff7c8; }
    .form-feedback.error { color: #ffd4d4; }
    .runner-grid { display: grid; gap: 36px; }
    .runner-card {
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 32px;
      background: var(--bg-light);
      display: grid;
      gap: 18px;
    }
    .runner-note {
      font-size: 0.9rem;
      color: var(--muted);
      line-height: 1.6;
    }
    .pulse { background: var(--pulse); }
    .pulse-grid {
      display: grid;
      gap: 28px;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      align-items: stretch;
    }
    .pulse-card {
      background: var(--white);
      border-radius: 24px;
      border: 1px solid var(--border);
      padding: 32px;
      display: flex;
      flex-direction: column;
      gap: 22px;
      box-shadow: 0 20px 50px rgba(14, 14, 14, 0.08);
    }
    .pulse-header { display: flex; flex-direction: column; gap: 6px; }
    .pulse-title {
      font-size: 0.78rem;
      letter-spacing: 0.24em;
      text-transform: uppercase;
      color: var(--soft);
      font-weight: 600;
    }
    .pulse-name { font-size: 1.4rem; font-weight: 600; }
    .pulse-metrics { display: grid; gap: 16px; }
    .metric { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid var(--border); padding-bottom: 10px; }
    .metric:last-of-type { border-bottom: none; }
    .metric-label { font-size: 0.9rem; color: var(--muted); }
    .metric-value { font-size: 1.1rem; font-weight: 600; letter-spacing: 0.01em; }
    .pulse-note { font-size: 0.96rem; line-height: 1.7; color: var(--muted); }
    .final-cta {
      background: var(--accent);
      color: var(--white);
      text-align: center;
      padding: 96px 0;
    }
    .final-cta h2 {
      font-family: var(--font-head);
      font-size: clamp(2.6rem, 7vw, 4rem);
      margin-bottom: 24px;
      line-height: 1.08;
    }
    .final-cta p { font-size: 1.05rem; color: rgba(255, 255, 255, 0.72); margin-bottom: 36px; line-height: 1.7; }
    footer {
      background: var(--bg-light);
      border-top: 1px solid var(--border);
      padding: 32px 0 54px;
    }
    .footer-inner {
      display: flex;
      flex-direction: column;
      gap: 12px;
      font-size: 0.85rem;
      color: var(--soft);
    }
    .footer-inner strong { color: var(--ink); font-weight: 600; }
    .mobile-sticky-cta {
      position: fixed;
      left: 16px;
      right: 16px;
      bottom: 16px;
      z-index: 100;
      display: none;
    }
    .mobile-sticky-cta a {
      width: 100%;
      display: inline-flex;
      justify-content: center;
      align-items: center;
      padding: 18px;
      border-radius: 18px;
      background: var(--accent);
      color: var(--white);
      font-size: 1rem;
      font-weight: 600;
      text-decoration: none;
      box-shadow: 0 20px 40px rgba(14, 14, 14, 0.32);
    }
    @media (min-width: 960px) {
      .hero-grid { grid-template-columns: 1.1fr 0.9fr; align-items: start; }
      .hero-cta { flex-direction: row; }
      .hero-number { flex-direction: row; align-items: center; gap: 12px; }
      .runner-grid { grid-template-columns: 1.1fr 1fr; align-items: center; }
      .runner-card { padding: 40px; }
      .pulse-grid { grid-template-columns: 1.1fr 0.9fr; }
    }
    @media (max-width: 720px) {
      header { position: static; }
      .top-right { display: none; }
      .hero { padding-top: 72px; }
      section { padding: 56px 0; }
      .mobile-sticky-cta { display: block; }
    }
  </style>
</head>
<body>
  <header>
    <div class="container top-bar">
      <div class="brand">Text<span>Marco</span></div>
      <div class="top-right">
        <span>Text 24/7: <strong>(645) 206-3407</strong></span>
        <a class="top-cta" href="sms:+16452063407">Text Marco</a>
        <a class="top-cta outline" href="/runner">Become a Runner</a>
      </div>
    </div>
  </header>
  <main>
    <section class="hero" id="home">
      <div class="container hero-grid">
        <div>
          <div class="hero-eyebrow">24/7 home operations desk</div>
          <h1>Text Marco what you need around a home.</h1>
          <p class="hero-sub">Repairs, seller prep, vendors, permits, cleanups, access, inspections, and real estate support — handled by text.</p>
          <div class="hero-cta">
            <a class="btn btn-primary" href="sms:+16452063407">Text Marco Now</a>
            <a class="btn btn-secondary" href="/runner">Become a Marco Runner</a>
          </div>
          <div class="hero-number">
            <span>Primary line:</span>
            <strong>(645) 206-3407</strong>
          </div>
        </div>
        <aside class="hero-card" aria-hidden="true">
          <div class="hero-card-title">Live request board</div>
          <div class="hero-card-requests">
            <div class="request">
              <div class="request-label">Escrow · San Mateo</div>
              <div class="request-body">Buyer walkthrough scheduled for 8AM. Need access coordination and lockbox swap before crew arrives.</div>
              <div class="request-meta">
                <span>Coordinating vendors</span>
                <span class="badge">On it</span>
              </div>
            </div>
            <div class="request">
              <div class="request-label">Permits · Los Angeles</div>
              <div class="request-body">Check status on electrical rough inspection and line up contingency electrician for Friday AM.</div>
              <div class="request-meta">
                <span>Permit desk</span>
                <span class="badge">Routing</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </section>
    <section class="helps" id="helps">
      <div class="container">
        <h2 class="section-heading">What Marco helps with</h2>
        <p class="section-subhead">Send the request over text. Marco lines up the people, paperwork, and follow through to keep the property moving.</p>
        <div class="help-grid">
          <div class="help-item">Seller prep</div>
          <div class="help-item">FSBO support</div>
          <div class="help-item">Agent support / Offer Room</div>
          <div class="help-item">Vendor meetups</div>
          <div class="help-item">Property access</div>
          <div class="help-item">Permits</div>
          <div class="help-item">Plumbing</div>
          <div class="help-item">Electrical</div>
          <div class="help-item">HVAC</div>
          <div class="help-item">Handyman</div>
          <div class="help-item">Landscaping</div>
          <div class="help-item">Brush clearing</div>
          <div class="help-item">Cleaning / junk removal</div>
          <div class="help-item">Inspection repair bids</div>
          <div class="help-item">Off-market opportunities</div>
        </div>
      </div>
    </section>
    <section class="how" id="how">
      <div class="container">
        <h2 class="section-heading">How it works</h2>
        <div class="steps">
          <div class="step">
            <div class="step-number">Step 1</div>
            <div class="step-title">Text Marco</div>
            <div class="step-copy">Send the address, urgency, and what you need. A human responds immediately and starts the checklist.</div>
          </div>
          <div class="step">
            <div class="step-number">Step 2</div>
            <div class="step-title">We close the gaps</div>
            <div class="step-copy">Marco asks for the missing details, photos, access instructions, or budget so the handoff is clear.</div>
          </div>
          <div class="step">
            <div class="step-number">Step 3</div>
            <div class="step-title">We route and coordinate</div>
            <div class="step-copy">Tasks are dispatched to vetted runners, vendors, and specialists. You stay updated in the same text thread.</div>
          </div>
        </div>
      </div>
    </section>
    <section class="agents" id="agents">
      <div class="container">
        <h2 class="section-heading">Offer Room for agents.</h2>
        <p class="section-subhead">Dump seller prep, escrow tasks, vendors, repairs, access, documents, and deadlines into one place. Marco helps coordinate the chaos around a transaction.</p>
        <div class="agents-grid">
          <div class="agents-card">
            <p>• Keep showings, vendor entries, and document runs on schedule without leaving your client group chat.</p>
            <p>• Offload follow-ups, recurring access checks, and inspection punch lists so you can focus on the deal.</p>
            <p>• Marco tracks deadlines, confirms who is on-site, and flags risks before they stall closing.</p>
          </div>
          <div class="waitlist-card">
            <h3 class="waitlist-title">Join the Offer Room waitlist</h3>
            <p class="waitlist-sub">Early access rolling out market by market.</p>
            <form class="waitlist-form" id="offer-room-form" novalidate>
              <div class="form-row">
                <input class="waitlist-input" type="text" name="name" placeholder="Name (optional)">
              </div>
              <div class="form-row">
                <input class="waitlist-input" type="email" name="email" placeholder="Email" required>
              </div>
              <div class="form-row">
                <input class="waitlist-input" type="tel" name="phone" placeholder="Phone" required>
              </div>
              <div class="form-row two">
                <input class="waitlist-input" type="text" name="brokerage" placeholder="Brokerage (optional)">
                <input class="waitlist-input" type="text" name="market" placeholder="Market / city (optional)">
              </div>
              <input type="hidden" name="source" value="offer-room-site">
              <button type="submit" class="btn btn-primary waitlist-submit">Join the Waitlist</button>
              <p class="waitlist-note">Early access rolling out market by market.</p>
              <p class="form-feedback" id="offer-room-feedback" role="status" aria-live="polite"></p>
            </form>
          </div>
        </div>
      </div>
    </section>
    <section class="runner" id="runner">
      <div class="container runner-grid">
        <div>
          <h2 class="section-heading">Become a Marco Runner</h2>
          <p class="section-subhead">Get paid to help homes move. Earn $30/hr, work on demand, make your own hours, meet vendors, take photos, document visits, check properties, and help source providers.</p>
          <p class="runner-note">Selected applicants may qualify for a first-day advance or launch bonus after vetting and approval.</p>
          <a class="btn btn-primary" href="sms:+16452063407&body=Runner%20Application">Apply to become a Marco Runner</a>
        </div>
        <div class="runner-card" aria-hidden="true">
          <span class="hero-card-title">Runner checklist</span>
          <div class="request">
            <div class="request-label">On-site</div>
            <div class="request-body">Document utility room, capture meter readings, confirm gate codes.</div>
            <div class="request-meta">
              <span>Deliver via SMS</span>
              <span class="badge">Same-day</span>
            </div>
          </div>
          <div class="request">
            <div class="request-label">Follow-up</div>
            <div class="request-body">Upload vendor receipts, flag outstanding permits, summarize next actions.</div>
            <div class="request-meta">
              <span>Ops ledger</span>
              <span class="badge">Cleared</span>
            </div>
          </div>
        </div>
      </div>
    </section>
    <section class="pulse" id="pulse">
      <div class="container">
        <h2 class="section-heading">PULSE preview</h2>
        <p class="section-subhead">The market read that makes Marco sharper. Marco reads the housing market, not just requests. PULSE helps Marco understand when sellers, buyers, agents, and homeowners may need more support.</p>
        <div class="pulse-grid">
          <div class="pulse-card">
            <div class="pulse-header">
              <div class="pulse-title">GH Housing Monitor</div>
              <div class="pulse-name">Current Score · 73</div>
            </div>
            <div class="pulse-metrics">
              <div class="metric">
                <span class="metric-label">Regime</span>
                <span class="metric-value">Tight inventory</span>
              </div>
              <div class="metric">
                <span class="metric-label">Breadth</span>
                <span class="metric-value">61% improving</span>
              </div>
              <div class="metric">
                <span class="metric-label">Trend</span>
                <span class="metric-value">Up 3 wks</span>
              </div>
            </div>
            <div class="pulse-note">When PULSE tilts tighter, Marco pre-books runners, preps vendor capacity, and alerts agents before the backlog hits.</div>
          </div>
          <div class="pulse-card">
            <div class="pulse-header">
              <div class="pulse-title">Quick look</div>
              <div class="pulse-name">Market cues Marco tracks</div>
            </div>
            <div class="pulse-metrics">
              <div class="metric">
                <span class="metric-label">Listing velocity</span>
                <span class="metric-value">+8% week over week</span>
              </div>
              <div class="metric">
                <span class="metric-label">Urgent service tags</span>
                <span class="metric-value">+12 overnight</span>
              </div>
              <div class="metric">
                <span class="metric-label">Agent escalations</span>
                <span class="metric-value">3 active</span>
              </div>
            </div>
            <div class="pulse-note">These signals help Marco anticipate staffing, line up specialty vendors, and keep transaction teams ahead of the market swing.</div>
          </div>
        </div>
      </div>
    </section>
    <section class="final-cta" id="cta">
      <div class="container">
        <h2>Need something around a home?</h2>
        <p>Text Marco and a 24/7 home operations team jumps in immediately.</p>
        <a class="btn btn-primary" href="sms:+16452063407">Text Marco</a>
      </div>
    </section>
  </main>
  <footer>
    <div class="container footer-inner">
      <span><strong>Text Marco</strong> — 24/7 home operations service</span>
      <span>Primary line: (645) 206-3407</span>
      <span>© 2026 Text Marco. All rights reserved.</span>
    </div>
  </footer>
  <div class="mobile-sticky-cta">
    <a href="/runner">Apply to be a Runner</a>
  </div>
  <script>
    (function () {
      const form = document.getElementById('offer-room-form');
      if (!form) return;
      const feedback = document.getElementById('offer-room-feedback');
      const submitBtn = form.querySelector('.waitlist-submit');

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        feedback.textContent = '';
        feedback.className = 'form-feedback';

        const formData = new FormData(form);
        const payload = {
          name: formData.get('name')?.trim() || null,
          email: formData.get('email')?.trim() || '',
          phone: formData.get('phone')?.trim() || '',
          brokerage: formData.get('brokerage')?.trim() || null,
          market: formData.get('market')?.trim() || null,
          source: formData.get('source') || 'offer-room-site',
        };

        if (!payload.email || !payload.phone) {
          feedback.textContent = 'Add your email and phone so we can reach you when Offer Room opens.';
          feedback.classList.add('error');
          return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Joining...';

        try {
          const res = await fetch('https://marco-clean.onrender.com/offer-room-waitlist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data?.success) {
            feedback.textContent = 'You’re on the list. We’ll reach out as Offer Room unlocks in your market.';
            feedback.classList.add('success');
            form.reset();
          } else {
            throw new Error(data?.error || 'unknown');
          }
        } catch (err) {
          feedback.textContent = 'Could not submit just now. Text (645) 206-3407 and we’ll add you manually.';
          feedback.classList.add('error');
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Join the Waitlist';
        }
      });
    })();
  </script>
</body>
</html>`;
}

function renderRunnerLanding() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Marco Runner Recruiting — $30/hr On-Demand Field Ops</title>
  <meta name="description" content="Join Marco as a flexible Runner. Earn $30/hr coordinating home operations, property visits, and vendor meetups across your city." />
  <meta property="og:title" content="Join Marco as a Runner" />
  <meta property="og:description" content="Flexible, on-demand field work for real estate and home operations. $30/hr with launch bonuses for vetted operators." />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    :root {
      --bg: #0E0E0E;
      --ink: #F4F1EA;
      --muted: rgba(244, 241, 234, 0.8);
      --soft: rgba(244, 241, 234, 0.56);
      --accent: #FA6400;
      --accent-soft: rgba(250, 100, 0, 0.18);
      --panel: rgba(24, 24, 24, 0.78);
      --panel-solid: #161616;
      --border: rgba(244, 241, 234, 0.16);
      --border-strong: rgba(244, 241, 234, 0.28);
      --pulse: rgba(250, 100, 0, 0.12);
      --font-body: 'Inter', sans-serif;
      --font-head: 'Space Grotesk', sans-serif;
    }
    html { font-size: 16px; background: var(--bg); color: var(--ink); }
    body {
      margin: 0;
      font-family: var(--font-body);
      background: linear-gradient(160deg, #0E0E0E 20%, #161616 60%, #121212 100%);
      min-height: 100vh;
      color: var(--muted);
    }
    a { color: inherit; text-decoration: none; }
    header {
      position: sticky;
      top: 0;
      z-index: 100;
      backdrop-filter: blur(20px);
      background: rgba(14, 14, 14, 0.82);
      border-bottom: 1px solid rgba(244, 241, 234, 0.08);
    }
    .nav {
      max-width: 1120px;
      margin: 0 auto;
      padding: 20px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 18px;
    }
    .brand {
      font-weight: 600;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--ink);
      font-size: 0.9rem;
    }
    .brand span { color: var(--accent); }
    .nav-link {
      font-size: 0.85rem;
      color: var(--soft);
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 10px 20px;
      border-radius: 999px;
      border: 1px solid rgba(244, 241, 234, 0.14);
      transition: border 0.2s ease, color 0.2s ease;
    }
    .nav-link:hover {
      border-color: var(--accent);
      color: var(--ink);
    }
    main { display: block; }
    section { padding: 72px 0; }
    .container {
      width: min(1120px, 100%);
      margin: 0 auto;
      padding: 0 24px;
    }
    .hero {
      padding-top: 88px;
      padding-bottom: 64px;
    }
    .hero-grid {
      display: grid;
      gap: 48px;
    }
    .hero-eyebrow {
      font-size: 0.78rem;
      letter-spacing: 0.24em;
      text-transform: uppercase;
      color: var(--soft);
      margin-bottom: 20px;
    }
    h1 {
      font-family: var(--font-head);
      font-size: clamp(2.6rem, 6vw, 4.4rem);
      color: var(--ink);
      letter-spacing: -0.02em;
      margin: 0 0 18px;
    }
    .hero-sub {
      font-size: 1.15rem;
      line-height: 1.75;
      color: var(--muted);
      max-width: 34rem;
      margin-bottom: 28px;
    }
    .hero-points {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 32px;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 12px 18px;
      border-radius: 999px;
      border: 1px solid rgba(244, 241, 234, 0.16);
      background: rgba(20, 20, 20, 0.72);
      font-size: 0.9rem;
      color: var(--ink);
    }
    .pill::before {
      content: '';
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--accent);
    }
    .cta-stack {
      display: flex;
      flex-direction: column;
      gap: 16px;
      align-items: flex-start;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 18px 28px;
      border-radius: 14px;
      font-size: 1rem;
      font-weight: 600;
      transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
      text-decoration: none;
    }
    .btn-primary {
      background: var(--accent);
      color: #0E0E0E;
      box-shadow: 0 18px 38px rgba(250, 100, 0, 0.32);
    }
    .btn-primary:hover { transform: translateY(-2px); }
    .btn-secondary {
      color: var(--ink);
      border: 1.5px solid rgba(244, 241, 234, 0.32);
      background: rgba(20, 20, 20, 0.6);
    }
    .hero-card {
      border: 1px solid rgba(244, 241, 234, 0.08);
      border-radius: 24px;
      background: rgba(12, 12, 12, 0.7);
      padding: 28px;
      display: grid;
      gap: 18px;
      box-shadow: 0 32px 80px rgba(0, 0, 0, 0.32);
    }
    .hero-card-title {
      font-size: 0.85rem;
      text-transform: uppercase;
      letter-spacing: 0.24em;
      color: var(--soft);
      font-weight: 600;
    }
    .signal-list { display: grid; gap: 18px; }
    .signal {
      padding: 18px;
      border: 1px solid rgba(244, 241, 234, 0.08);
      border-radius: 18px;
      background: rgba(18, 18, 18, 0.88);
    }
    .signal-label {
      text-transform: uppercase;
      letter-spacing: 0.18em;
      color: var(--soft);
      font-size: 0.72rem;
      margin-bottom: 8px;
    }
    .signal-body { color: var(--ink); font-size: 0.96rem; line-height: 1.6; }
    .section-heading {
      font-family: var(--font-head);
      font-size: clamp(2rem, 4vw, 3rem);
      color: var(--ink);
      margin-bottom: 20px;
      letter-spacing: -0.015em;
    }
    .section-sub {
      font-size: 1.05rem;
      line-height: 1.8;
      color: var(--muted);
      max-width: 40rem;
      margin-bottom: 38px;
    }
    .grid {
      display: grid;
      gap: 16px;
    }
    .grid.tall { gap: 20px; }
    .card {
      border: 1px solid rgba(244, 241, 234, 0.1);
      border-radius: 18px;
      background: rgba(14, 14, 14, 0.72);
      padding: 24px;
      display: grid;
      gap: 12px;
    }
    .card strong { color: var(--ink); }
    .ops-list {
      display: grid;
      gap: 14px;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    }
    .ops-item {
      border: 1px solid rgba(244, 241, 234, 0.12);
      border-radius: 16px;
      padding: 16px 18px;
      background: rgba(18, 18, 18, 0.82);
      font-weight: 600;
      color: var(--ink);
      font-size: 0.95rem;
    }
    .operators {
      border: 1px solid rgba(244, 241, 234, 0.1);
      border-radius: 22px;
      background: rgba(12, 12, 12, 0.75);
      padding: 32px;
      display: grid;
      gap: 18px;
    }
    .operators h3 {
      margin: 0;
      font-size: 1.3rem;
      color: var(--ink);
    }
    .operator-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .tag {
      border: 1px solid rgba(244, 241, 234, 0.14);
      border-radius: 999px;
      padding: 10px 16px;
      font-size: 0.85rem;
      color: var(--muted);
      background: rgba(20, 20, 20, 0.68);
    }
    .form-section {
      padding: 72px 0;
    }
    form {
      display: grid;
      gap: 18px;
    }
    .form-card {
      border: 1px solid rgba(244, 241, 234, 0.18);
      border-radius: 22px;
      padding: 32px;
      background: rgba(12, 12, 12, 0.82);
      box-shadow: 0 28px 80px rgba(0, 0, 0, 0.44);
    }
    .form-grid {
      display: grid;
      gap: 18px;
    }
    .form-grid.two {
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    }
    .form-grid.three {
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    }
    label {
      font-size: 0.85rem;
      color: var(--soft);
      text-transform: uppercase;
      letter-spacing: 0.12em;
      display: block;
      margin-bottom: 8px;
    }
    input, textarea, select {
      width: 100%;
      padding: 14px 16px;
      border-radius: 14px;
      border: 1px solid rgba(244, 241, 234, 0.16);
      background: rgba(24, 24, 24, 0.86);
      color: var(--ink);
      font: inherit;
      min-height: 52px;
    }
    textarea { min-height: 120px; resize: vertical; }
    input:focus, textarea:focus, select:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 1px rgba(250, 100, 0, 0.3);
    }
    .form-note {
      font-size: 0.85rem;
      color: var(--soft);
      line-height: 1.6;
    }
    .form-feedback {
      min-height: 1.2rem;
      font-size: 0.9rem;
      color: var(--soft);
    }
    .form-feedback.success { color: #8FF7C8; }
    .form-feedback.error { color: #FFB3B3; }
    .calendly-block {
      margin-top: 48px;
      border-radius: 20px;
      overflow: hidden;
      border: 1px solid rgba(244, 241, 234, 0.14);
      display: none;
    }
    .calendly-block.active { display: block; }
    .info-block {
      border: 1px solid rgba(244, 241, 234, 0.12);
      border-radius: 22px;
      padding: 32px;
      background: rgba(16, 16, 16, 0.78);
      display: grid;
      gap: 18px;
    }
    .info-grid {
      display: grid;
      gap: 16px;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    }
    .info-item {
      border: 1px solid rgba(244, 241, 234, 0.1);
      border-radius: 18px;
      padding: 20px;
      background: rgba(14, 14, 14, 0.74);
      display: grid;
      gap: 8px;
    }
    .info-item span {
      font-size: 0.78rem;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--soft);
    }
    .info-item strong { color: var(--ink); font-size: 1.05rem; }
    .timeline {
      display: grid;
      gap: 18px;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    }
    .timeline-step {
      border: 1px solid rgba(244, 241, 234, 0.12);
      border-radius: 18px;
      padding: 24px;
      background: rgba(18, 18, 18, 0.82);
      position: relative;
    }
    .timeline-step::before {
      content: attr(data-step);
      position: absolute;
      top: 18px;
      right: 20px;
      font-size: 0.72rem;
      letter-spacing: 0.22em;
      color: var(--soft);
    }
    .faq-grid {
      display: grid;
      gap: 16px;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    }
    .faq-card {
      border: 1px solid rgba(244, 241, 234, 0.1);
      border-radius: 18px;
      padding: 24px;
      background: rgba(20, 20, 20, 0.72);
    }
    .faq-card h3 {
      margin: 0 0 12px;
      font-size: 1.1rem;
      color: var(--ink);
    }
    footer {
      padding: 48px 0 60px;
      border-top: 1px solid rgba(244, 241, 234, 0.08);
      background: rgba(10, 10, 10, 0.9);
    }
    .footer-inner {
      max-width: 1120px;
      margin: 0 auto;
      padding: 0 24px;
      display: grid;
      gap: 10px;
      font-size: 0.85rem;
      color: var(--soft);
    }
    .mobile-cta {
      position: fixed;
      left: 18px;
      right: 18px;
      bottom: 18px;
      display: none;
      z-index: 120;
    }
    .mobile-cta a {
      display: inline-flex;
      width: 100%;
      justify-content: center;
      align-items: center;
      padding: 16px;
      border-radius: 16px;
      background: var(--accent);
      color: #0E0E0E;
      font-weight: 600;
      box-shadow: 0 22px 40px rgba(250, 100, 0, 0.32);
    }
    @media (min-width: 960px) {
      .hero-grid { grid-template-columns: 1.15fr 0.85fr; align-items: start; }
      .ops-list { grid-template-columns: repeat(3, minmax(200px, 1fr)); }
      .grid.two-col { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 28px; }
      .operators { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 720px) {
      header { position: sticky; }
      .nav-link { display: none; }
      section { padding: 60px 0; }
      .hero { padding-top: 64px; }
      .mobile-cta { display: block; }
    }
  </style>
</head>
<body>
  <header>
    <nav class="nav">
      <div class="brand">Marco<span>Ops</span></div>
      <a class="nav-link" href="/">← Back to text concierge</a>
    </nav>
  </header>
  <main>
    <section class="hero" id="top">
      <div class="container hero-grid">
        <div>
          <div class="hero-eyebrow">Field operations crew</div>
          <h1>Become a Runner for Marco.</h1>
          <p class="hero-sub">Get paid to help homes work better. $30/hr for on-demand property visits, vendor meetups, access checks, and the ops work owners hate doing.</p>
          <div class="hero-points">
            <span class="pill">Flexible hours</span>
            <span class="pill">Work on demand</span>
            <span class="pill">Real estate + home ops</span>
            <span class="pill">Mobile-first field work</span>
          </div>
          <div class="cta-stack">
            <a class="btn btn-primary" href="#apply">Apply now</a>
            <a class="btn btn-secondary" href="#ops">What you actually do</a>
          </div>
        </div>
        <aside class="hero-card" aria-hidden="true">
          <div class="hero-card-title">Signals we run</div>
          <div class="signal-list">
            <div class="signal">
              <div class="signal-label">On-site ops</div>
              <div class="signal-body">Vendor meetups, access checks, key swaps, light seller prep, verifying repairs, grabbing photos, logging proof for the ops ledger.</div>
            </div>
            <div class="signal">
              <div class="signal-label">Why it pays</div>
              <div class="signal-body">$30/hr, first-day advance or launch bonus for vetted operators, and you stay in the rotation as markets heat up.</div>
            </div>
            <div class="signal">
              <div class="signal-label">How you work</div>
              <div class="signal-body">Dispatch via SMS. We text the mission, context, and deliverables. You confirm, execute, and send back receipts or documentation.</div>
            </div>
          </div>
        </aside>
      </div>
    </section>

    <section id="ops">
      <div class="container grid two-col">
        <div>
          <h2 class="section-heading">Where we slot you in</h2>
          <p class="section-sub">Marco runs home operations for owners, sellers, and agents. Runners are the flexible field team that keep the work moving.</p>
          <div class="ops-list">
            <div class="ops-item">Property walk-throughs & condition checklists</div>
            <div class="ops-item">Vendor & inspector meetups</div>
            <div class="ops-item">Lockbox, access, & key swaps</div>
            <div class="ops-item">Staging + seller prep assists</div>
            <div class="ops-item">Photo + documentation drops</div>
            <div class="ops-item">Post-service QA + punch items</div>
          </div>
        </div>
        <div class="operators">
          <h3>Operators we love</h3>
          <div class="operator-tags">
            <span class="tag">Gig workers hunting stronger shifts</span>
            <span class="tag">Production assistants between shoots</span>
            <span class="tag">Freelancers needing steady ops work</span>
            <span class="tag">Real-estate-adjacent coordinators</span>
            <span class="tag">Side-income seekers with hustle</span>
            <span class="tag">Younger operators who know neighborhoods</span>
          </div>
          <p class="form-note">You know your way around homes, vendors, and checklists. You document everything. You handle small chaos without drama.</p>
        </div>
      </div>
    </section>

    <section class="form-section" id="apply">
      <div class="container">
        <div class="form-card">
          <h2 class="section-heading">Drop your info. We’ll text you right after.</h2>
          <p class="section-sub">Tell us how to reach you, where you operate, and how you like to work. We store everything securely in Marco’s Supabase vault.</p>
          <form data-runner-form novalidate>
            <div class="form-grid two">
              <div>
                <label for="name">Name</label>
                <input id="name" name="name" type="text" placeholder="First + last" autocomplete="name" required />
              </div>
              <div>
                <label for="phone">Phone</label>
                <input id="phone" name="phone" type="tel" inputmode="tel" placeholder="(415) 555-1234" autocomplete="tel" required />
              </div>
            </div>
            <div class="form-grid two">
              <div>
                <label for="email">Email</label>
                <input id="email" name="email" type="email" placeholder="you@fastmail.com" autocomplete="email" required />
              </div>
              <div>
                <label for="city">City</label>
                <input id="city" name="city" type="text" placeholder="City you operate in" required />
              </div>
            </div>
            <div>
              <label for="neighborhood">Primary neighborhoods or markets</label>
              <input id="neighborhood" name="neighborhood" type="text" placeholder="e.g. Echo Park, Silver Lake, DTLA" />
            </div>
            <div class="form-grid three">
              <div>
                <label for="car">Car access</label>
                <select id="car" name="car_access" required>
                  <option value="">Select one</option>
                  <option value="yes">Yes, I have reliable access</option>
                  <option value="sometimes">Sometimes / shared</option>
                  <option value="no">No car access</option>
                </select>
              </div>
              <div>
                <label for="phone_os">Phone</label>
                <select id="phone_os" name="phone_os" required>
                  <option value="">Pick one</option>
                  <option value="iphone">iPhone</option>
                  <option value="android">Android</option>
                  <option value="other">Other / both</option>
                </select>
              </div>
              <div>
                <label for="availability">Availability</label>
                <input id="availability" name="availability" type="text" placeholder="e.g. Weekdays 8-2, weekends open" required />
              </div>
            </div>
            <div>
              <label for="intro">Give us the 30-second intro</label>
              <textarea id="intro" name="intro" placeholder="Relevant ops / production / real estate / service experience. What kind of runs do you crush?" required></textarea>
            </div>
            <input type="hidden" name="source" value="runner-landing" />
            <button class="btn btn-primary" type="submit">Send application</button>
            <p class="form-feedback" data-feedback></p>
            <p class="form-note">We text from (645) 206-3407. Watch your phone — we qualify fast and get you on the schedule.</p>
          </form>
          <div class="calendly-block" data-calendly-block data-calendly-url="https://calendly.com/marco-runner/intro-call">
            <div class="calendly-inline-widget" style="min-width:320px;height:760px;"></div>
          </div>
        </div>
      </div>
    </section>

    <section>
      <div class="container grid two-col">
        <div class="info-block">
          <h2 class="section-heading">Comp, structure, cadence</h2>
          <div class="info-grid">
            <div class="info-item">
              <span>Rate</span>
              <strong>$30/hr + expense reimbursements</strong>
              <p class="form-note">First-day advance or launch bonus available once vetting clears.</p>
            </div>
            <div class="info-item">
              <span>Dispatch</span>
              <strong>SMS missions with GPS + deliverables</strong>
              <p class="form-note">Confirm receipt, send status pics, and we log everything in the ops ledger.</p>
            </div>
            <div class="info-item">
              <span>Scope</span>
              <strong>Homes, vendors, access, field docs</strong>
              <p class="form-note">We’re not flipping houses — we’re keeping the machine moving.</p>
            </div>
          </div>
        </div>
        <div class="info-block">
          <h3 class="section-heading">How onboarding goes</h3>
          <div class="timeline">
            <div class="timeline-step" data-step="01">
              <strong>Apply</strong>
              <p class="form-note">We store your info, auto-text you, and run a quick conversational qualification.</p>
            </div>
            <div class="timeline-step" data-step="02">
              <strong>Intro call</strong>
              <p class="form-note">15-minute calendar slot. We confirm markets, equipment, and coverage windows.</p>
            </div>
            <div class="timeline-step" data-step="03">
              <strong>Field trial</strong>
              <p class="form-note">You run a paid trial mission. We review documentation quality and response speed.</p>
            </div>
            <div class="timeline-step" data-step="04">
              <strong>Roster</strong>
              <p class="form-note">Cleared operators get added to the live dispatch rotation with market tags.</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section>
      <div class="container">
        <h2 class="section-heading">Questions we get asked</h2>
        <div class="faq-grid">
          <div class="faq-card">
            <h3>Do I need a fancy resume?</h3>
            <p>No. We care about reps, reliability, and proof you can run operations in the field. Show us you’ve handled production days, real estate tasks, facilities work, or any ops that moves fast.</p>
          </div>
          <div class="faq-card">
            <h3>How often will you dispatch me?</h3>
            <p>Depends on market demand. Hot weeks can be multiple runs per day. Slow weeks mean standby. Solid documentation and fast responses keep you at the top of the rotation.</p>
          </div>
          <div class="faq-card">
            <h3>What gear do I need?</h3>
            <p>Reliable smartphone (iPhone or Android), car access preferred, ability to scan/upload documents, and willingness to be around vendors, contractors, and homeowners.</p>
          </div>
          <div class="faq-card">
            <h3>Do you cover mileage or materials?</h3>
            <p>Yes. Approved expenses, mileage, and supplies tied to a mission are reimbursed through Marco’s ops ledger. Keep your receipts and send them with your debrief.</p>
          </div>
        </div>
      </div>
    </section>
  </main>
  <footer>
    <div class="footer-inner">
      <span><strong>Marco</strong> — Home operations, handled.</span>
      <span>Texts come from (645) 206-3407 · marco@textmarco.com</span>
      <span>© ${new Date().getFullYear()} Marco Ops. All rights reserved.</span>
    </div>
  </footer>
  <div class="mobile-cta">
    <a href="#apply">Apply to be a Runner</a>
  </div>
  <script>
    (function () {
      const form = document.querySelector('[data-runner-form]');
      if (!form) return;
      const feedback = form.querySelector('[data-feedback]');
      const calendlyBlock = document.querySelector('[data-calendly-block]');
      const calendlyContainer = calendlyBlock?.querySelector('.calendly-inline-widget');
      const body = document.body;
      const submitBtn = form.querySelector('button[type="submit"]');
      const endpoint = 'https://marco-clean.onrender.com/runner/apply';

      function setFeedback(message, type) {
        if (!feedback) return;
        feedback.textContent = message || '';
        feedback.className = 'form-feedback';
        if (type) feedback.classList.add(type);
      }

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        setFeedback('', null);
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending...';

        const data = Object.fromEntries(new FormData(form).entries());

        try {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          });

          const payload = await res.json().catch(() => ({}));

          if (!res.ok || !payload?.success) {
            throw new Error(payload?.error || 'unknown_error');
          }

          setFeedback('We got it. Watch for the text — qualification kicks off in under a minute.', 'success');
          form.reset();
          if (calendlyBlock) {
            calendlyBlock.classList.add('active');
            const newUrl = payload.calendly || calendlyBlock.getAttribute('data-calendly-url');
            calendlyBlock.setAttribute('data-calendly-url', newUrl);
            if (window.Calendly && calendlyContainer) {
              Calendly.initInlineWidget({
                url: newUrl,
                parentElement: calendlyContainer,
              });
            } else if (calendlyContainer) {
              calendlyContainer.setAttribute('data-url', newUrl);
            }
            calendlyBlock.scrollIntoView({ behavior: 'smooth', block: 'start' });
            body.classList.add('modal-open');
            const escHandler = function (e) {
              if (e.key === 'Escape') {
                calendlyBlock.classList.remove('active');
                body.classList.remove('modal-open');
                window.removeEventListener('keydown', escHandler);
              }
            };
            window.addEventListener('keydown', escHandler);
          }
        } catch (error) {
          console.error('[Runner Apply] failed', error);
          setFeedback('Could not submit right now. Text (645) 206-3407 and we’ll onboard you manually.', 'error');
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Send application';
        }
      });
    })();
  </script>
  <script type="text/javascript" src="https://assets.calendly.com/assets/external/widget.js" async></script>
</body>
</html>`;
}