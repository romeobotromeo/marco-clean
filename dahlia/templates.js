/**
 * Dahlia property site templates
 * 5142 Dahlia Dr — Eagle Rock, Los Angeles
 */

const config = require('./config');

function googleFonts() {
  return `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=DM+Mono:wght@300;400&display=swap" rel="stylesheet">`;
}

function baseStyles() {
  return `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --cream:      #F2EDE4;
    --ink:        #1A1208;
    --terracotta: #8B4A2A;
    --sand:       #B8A98A;
    --muted:      #6B6050;
    --moss:       #3D5A3E;
  }
  html { font-size: 16px; -webkit-font-smoothing: antialiased; }
  body {
    background: var(--cream);
    color: var(--ink);
    font-family: 'DM Mono', monospace;
    font-weight: 300;
    font-size: 0.82rem;
    line-height: 1.7;
  }
  .display {
    font-family: 'Cormorant Garamond', serif;
    font-weight: 300;
    font-size: clamp(2.5rem, 6vw, 5rem);
    line-height: 0.95;
    letter-spacing: -0.01em;
  }
  .display-italic { font-style: italic; }
  .section-label {
    display: block;
    font-size: 0.65rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 0.75rem;
  }
  a { color: inherit; text-decoration: none; }
  hr { border: none; border-top: 0.5px solid var(--sand); }
  .divider { margin: 0; }
  `;
}

function buildNav(current) {
  const links = [
    { href: '/',                    label: 'HOME' },
    { href: '/the-house',           label: 'THE HOUSE' },
    { href: '/neighborhood',        label: 'NEIGHBORHOOD' },
    { href: '/area-guide',          label: 'AREA GUIDE' },
    { href: '/built-with-textmarco', label: 'BUILT WITH TEXTMARCO' },
  ];
  return `
<nav class="nav">
  <a href="/" class="nav-brand">5142 DAHLIA DR</a>
  <div class="nav-links">
    ${links.filter(l => l.href !== '/').map(l =>
      `<a href="${l.href}" class="nav-link${current === l.href ? ' active' : ''}">${l.label}</a>`
    ).join('')}
  </div>
</nav>`;
}

function buildFooter() {
  return `
<footer class="footer">
  <div class="footer-inner">
    <div>
      <div class="footer-address">${config.address.full}</div>
      <div class="footer-sub">${config.neighborhood}, Los Angeles · ${config.beds} BD / ${config.baths} BA · Coming Soon</div>
    </div>
    <div class="footer-links">
      <a href="/the-house">The House</a>
      <a href="/neighborhood">Neighborhood</a>
      <a href="/area-guide">Area Guide</a>
      <a href="/built-with-textmarco">Built with TextMarco</a>
    </div>
  </div>
</footer>`;
}

function buildTicker() {
  const items = config.tickerItems.map(t => `<span class="tick-item">${t}</span>`).join('');
  return `<div class="ticker"><div class="ticker-inner">${items}${items}</div></div>`;
}

function pageShell({ title, desc, url, current, content, extraCss = '' }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${desc}">
  <link rel="canonical" href="${url}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${desc}">
  <meta property="og:url" content="${url}">
  <meta property="og:type" content="website">
  ${googleFonts()}
  <style>
  ${baseStyles()}

  /* Nav */
  .nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 2rem;
    border-bottom: 0.5px solid var(--sand);
    position: sticky;
    top: 0;
    background: var(--cream);
    z-index: 100;
  }
  .nav-brand {
    font-size: 0.65rem;
    letter-spacing: 0.2em;
    font-weight: 400;
  }
  .nav-links { display: flex; gap: 2rem; }
  .nav-link {
    font-size: 0.6rem;
    letter-spacing: 0.15em;
    color: var(--muted);
  }
  .nav-link.active, .nav-link:hover { color: var(--ink); }
  @media (max-width: 768px) {
    .nav-links { display: none; }
    .nav { padding: 1rem 1.25rem; }
  }

  /* Ticker */
  .ticker {
    border-bottom: 0.5px solid var(--sand);
    overflow: hidden;
    white-space: nowrap;
    padding: 0.6rem 0;
    background: var(--ink);
    color: var(--cream);
  }
  .ticker-inner { display: inline-block; animation: ticker 30s linear infinite; }
  .tick-item { margin: 0 2.5rem; font-size: 0.65rem; letter-spacing: 0.15em; }
  @keyframes ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }

  /* Footer */
  .footer {
    border-top: 0.5px solid var(--sand);
    padding: 2.5rem 2rem;
    margin-top: 0;
  }
  .footer-inner {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 2rem;
    flex-wrap: wrap;
  }
  .footer-address { font-size: 0.75rem; margin-bottom: 0.35rem; }
  .footer-sub { font-size: 0.65rem; color: var(--muted); }
  .footer-links { display: flex; flex-direction: column; gap: 0.5rem; text-align: right; }
  .footer-links a { font-size: 0.65rem; color: var(--muted); letter-spacing: 0.1em; }
  .footer-links a:hover { color: var(--ink); }

  ${extraCss}
  </style>
</head>
<body>
  ${buildNav(current)}
  ${buildTicker()}
  <main>${content}</main>
  ${buildFooter()}
</body>
</html>`;
}

// ── Homepage ───────────────────────────────────────────────────────────────────
function homePage({ success = false } = {}) {
  const css = `
  .hero {
    display: grid;
    grid-template-columns: 1fr 1fr;
    min-height: 70vh;
    border-bottom: 0.5px solid var(--sand);
  }
  .hero-left {
    padding: 4rem 2.5rem;
    border-right: 0.5px solid var(--sand);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  .hero-right {
    padding: 4rem 2.5rem;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  .hero-price {
    font-family: 'Cormorant Garamond', serif;
    font-weight: 300;
    font-size: clamp(1.4rem, 3vw, 2.2rem);
    letter-spacing: 0.15em;
    color: var(--terracotta);
  }
  .hero-divider { margin: 1.5rem 0; }
  .hero-specs { display: flex; gap: 0; }
  .spec-block { }
  .spec-value {
    display: block;
    font-family: 'Cormorant Garamond', serif;
    font-weight: 300;
    font-size: 2rem;
  }
  .spec-label {
    display: block;
    font-size: 0.6rem;
    letter-spacing: 0.15em;
    color: var(--muted);
    text-transform: uppercase;
  }
  .hero-sub { font-size: 0.65rem; color: var(--muted); margin-top: 1rem; }
  .success-banner {
    background: var(--moss);
    color: var(--cream);
    padding: 0.75rem 1rem;
    font-size: 0.7rem;
    letter-spacing: 0.1em;
    text-align: center;
  }
  .stats-strip {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    border-bottom: 0.5px solid var(--sand);
  }
  .stat-cell {
    padding: 2rem 1.5rem;
    border-right: 0.5px solid var(--sand);
    text-align: center;
  }
  .stat-cell:last-child { border-right: none; }
  .stat-num {
    font-family: 'Cormorant Garamond', serif;
    font-weight: 300;
    font-size: 2.25rem;
    display: block;
    margin-bottom: 0.35rem;
  }
  .stat-unit { font-size: 0.6rem; letter-spacing: 0.15em; color: var(--muted); text-transform: uppercase; }
  .builder-section {
    padding: 3rem 2.5rem;
    max-width: 680px;
  }
  .giveaway {
    display: grid;
    grid-template-columns: 1fr 1fr;
    border-top: 0.5px solid var(--sand);
    border-bottom: 0.5px solid var(--sand);
  }
  .giveaway-text {
    padding: 3rem 2.5rem;
    border-right: 0.5px solid var(--sand);
  }
  .giveaway-text p { font-size: 0.78rem; margin-top: 1rem; color: var(--muted); line-height: 1.8; }
  .giveaway-form-wrap { padding: 3rem 2.5rem; }
  .giveaway-input {
    width: 100%;
    border: 0.5px solid var(--sand);
    background: transparent;
    padding: 0.85rem 1rem;
    font-family: 'DM Mono', monospace;
    font-size: 0.82rem;
    color: var(--ink);
    margin-bottom: 0.75rem;
    outline: none;
  }
  .giveaway-input:focus { border-color: var(--ink); }
  .giveaway-btn {
    width: 100%;
    background: var(--ink);
    color: var(--cream);
    border: none;
    padding: 0.85rem 1rem;
    font-family: 'DM Mono', monospace;
    font-size: 0.7rem;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    cursor: pointer;
  }
  .page-previews {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    border-bottom: 0.5px solid var(--sand);
  }
  .preview-link {
    padding: 2.5rem 2rem;
    border-right: 0.5px solid var(--sand);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .preview-link:last-child { border-right: none; }
  .preview-link:hover .preview-arrow { transform: translateX(4px); }
  .preview-label { font-size: 0.6rem; letter-spacing: 0.2em; color: var(--muted); text-transform: uppercase; }
  .preview-title { font-size: clamp(1.5rem, 3vw, 2.25rem); }
  .preview-arrow { font-size: 0.75rem; color: var(--muted); transition: transform 0.2s; margin-top: auto; }
  @media (max-width: 768px) {
    .hero { grid-template-columns: 1fr; min-height: auto; }
    .hero-left { border-right: none; border-bottom: 0.5px solid var(--sand); padding: 2.5rem 1.25rem; }
    .hero-right { padding: 2.5rem 1.25rem; }
    .stats-strip { grid-template-columns: repeat(2, 1fr); }
    .stat-cell:nth-child(2) { border-right: none; }
    .giveaway { grid-template-columns: 1fr; }
    .giveaway-text { border-right: none; border-bottom: 0.5px solid var(--sand); padding: 2.5rem 1.25rem; }
    .giveaway-form-wrap { padding: 2.5rem 1.25rem; }
    .page-previews { grid-template-columns: 1fr; }
    .preview-link { border-right: none; border-bottom: 0.5px solid var(--sand); padding: 2rem 1.25rem; }
    .builder-section { padding: 2.5rem 1.25rem; }
  }
  `;

  const giveawayForm = success
    ? `<p style="font-size:0.78rem;color:var(--moss);padding:1rem 0;">You're in. We'll be in touch before closing.</p>`
    : `<input class="giveaway-input" type="tel" name="phone" placeholder="Your phone number" required>
       <button class="giveaway-btn" type="submit">Enter Giveaway</button>`;

  const content = `
${success ? `<div class="success-banner">YOU'RE IN — WE'LL BE IN TOUCH BEFORE CLOSING</div>` : ''}
<div class="hero">
  <div class="hero-left">
    <span class="section-label">5142 Dahlia Dr — ${config.neighborhood}</span>
    <h1 class="display">5142<br>DAHLIA<br>DR</h1>
    <p class="street-suffix">LOS ANGELES, CA 90041</p>
  </div>
  <div class="hero-right">
    <div>
      <span class="section-label">Listing Price</span>
      <div class="hero-price">COMING SOON</div>
    </div>
    <hr class="hero-divider">
    <div class="hero-specs">
      <div class="spec-block">
        <span class="spec-value">${config.beds}</span>
        <span class="spec-label">Bedrooms</span>
      </div>
      <div class="spec-block" style="padding-left:1.25rem;">
        <span class="spec-value">${config.baths}</span>
        <span class="spec-label">Bathrooms</span>
      </div>
      <div class="spec-block" style="padding-left:1.25rem;">
        <span class="spec-value">${config.sqft.toLocaleString()}</span>
        <span class="spec-label">Sq Ft</span>
      </div>
    </div>
    <p class="hero-sub">Built ${config.yearBuilt} · ${config.lot} lot · ${config.style}</p>
  </div>
</div>

<div class="stats-strip">
  <div class="stat-cell">
    <span class="stat-num display">${config.yearBuilt}</span>
    <span class="stat-unit">Year Built</span>
  </div>
  <div class="stat-cell">
    <span class="stat-num display">${config.sqft.toLocaleString()}</span>
    <span class="stat-unit">Square Feet</span>
  </div>
  <div class="stat-cell">
    <span class="stat-num display">${config.lot.split(' ')[0]}</span>
    <span class="stat-unit">Sq Ft Lot</span>
  </div>
  <div class="stat-cell">
    <span class="stat-num display" style="font-size:clamp(1rem,2.5vw,1.4rem); letter-spacing:0.05em;">EAGLE ROCK</span>
    <span class="stat-unit">Neighborhood</span>
  </div>
</div>

<div class="builder-section">
  <span class="section-label">The Builder</span>
  <h2 class="display">Gibson House — <em class="display-italic">designed to last</em></h2>
  <p style="font-size:0.82rem; color:var(--muted); line-height:1.85; margin-top:1rem;">Originally built in 1926 by W.W. Boyle for first owner E.E. Andrews — Lot 25 of the historic Dahlgreen Tract. Boyle operated out of a prestigious address on W. 7th Street and built several homes on this block simultaneously to create the cohesive village feel that still defines the street today.</p>
  <p style="font-size:0.82rem; color:var(--muted); line-height:1.85; margin-top:0.85rem;">Nearly a century later, Gibson House — a notable local design firm with luxury projects from Venice Beach to Pasadena — transformed the outdoor space: a deck off the kitchen, large travertine patio, Mediterranean landscaping, 25-foot cypress hedges, multiple olive trees, and a pool beside a vibrant orchard through a DG meditation garden.</p>
</div>

<hr class="divider">

<div class="giveaway" id="giveaway">
  <div class="giveaway-text">
    <span class="section-label">Giveaway</span>
    <h2 class="display">Win a<br><em class="display-italic">${config.giveawayPrize}</em></h2>
    <p>Enter your number for a chance to win. We'll announce the winner before closing.</p>
    <p>Or text <strong>${config.smsKeyword}</strong> to ${config.smsNumber}.</p>
  </div>
  <div class="giveaway-form-wrap">
    <span class="section-label">Enter now</span>
    <form action="/giveaway" method="POST">
      ${giveawayForm}
    </form>
  </div>
</div>

<hr class="divider">

<div class="page-previews">
  <a href="/the-house" class="preview-link">
    <span class="preview-label">Interior</span>
    <span class="preview-title display">The House</span>
    <span class="preview-arrow">Explore →</span>
  </a>
  <a href="/neighborhood" class="preview-link">
    <span class="preview-label">Location</span>
    <span class="preview-title display">The Neighborhood</span>
    <span class="preview-arrow">Explore →</span>
  </a>
  <a href="/area-guide" class="preview-link">
    <span class="preview-label">Context</span>
    <span class="preview-title display">Area Guide</span>
    <span class="preview-arrow">Read →</span>
  </a>
</div>`;

  return pageShell({
    title:    `${config.address.street} — ${config.neighborhood}, Los Angeles`,
    desc:     `${config.beds}BD/${config.baths}BA ${config.sqft} sq ft ${config.style} in ${config.neighborhood}, Los Angeles. Built ${config.yearBuilt}. Reimagined by Gibson House. Coming soon.`,
    url:      config.siteUrl,
    current:  '/',
    content,
    extraCss: css,
  });
}

// ── The House ─────────────────────────────────────────────────────────────────
function theHousePage() {
  const css = `
  .house-hero { padding: 4rem 2.5rem 3rem; border-bottom: 0.5px solid var(--sand); }
  .house-hero .subtitle { font-size: 0.85rem; color: var(--muted); margin-top: 1.5rem; max-width: 520px; line-height: 1.85; }
  .house-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
  .house-section {
    padding: 3rem 2.5rem;
    border-right: 0.5px solid var(--sand);
    border-bottom: 0.5px solid var(--sand);
  }
  .house-section:nth-child(even) { border-right: none; }
  .house-full { grid-column: 1 / -1; border-right: none; }
  .house-section h2 { margin-bottom: 1.25rem; }
  .house-section p { font-size: 0.82rem; color: var(--muted); line-height: 1.85; margin-bottom: 0.85rem; }
  .house-section ul { list-style: none; margin-top: 1rem; }
  .house-section li {
    display: flex;
    justify-content: space-between;
    padding: 0.65rem 0;
    border-bottom: 0.5px solid var(--sand);
    font-size: 0.78rem;
  }
  .house-section li span { color: var(--muted); }
  @media (max-width: 768px) {
    .house-hero { padding: 2.5rem 1.25rem 2rem; }
    .house-grid { grid-template-columns: 1fr; }
    .house-section { border-right: none; padding: 2.5rem 1.25rem; }
  }
  `;

  const content = `
<div class="house-hero">
  <span class="section-label">5142 Dahlia Dr — ${config.neighborhood}</span>
  <h1 class="display">The<br><em class="display-italic">House</em></h1>
  <p class="subtitle">A 1926 Tudor on one of Eagle Rock's most coveted streets — not on the market in over 60 years, now fully reimagined by Gibson House with a luxury outdoor living program and all the original character intact.</p>
</div>

<div class="house-grid">
  <div class="house-section">
    <span class="section-label">Vitals</span>
    <h2 class="display">By the numbers</h2>
    <ul>
      <li>Bedrooms <span>${config.beds}</span></li>
      <li>Bathrooms <span>${config.baths}</span></li>
      <li>Living area <span>${config.sqft.toLocaleString()} sq ft</span></li>
      <li>Lot size <span>${config.lot}</span></li>
      <li>Year built <span>${config.yearBuilt}</span></li>
      <li>Style <span>${config.style}</span></li>
      <li>Parking <span>${config.garage}</span></li>
      <li>Builder <span>${config.builder}</span></li>
    </ul>
  </div>

  <div class="house-section">
    <span class="section-label">Interior</span>
    <h2 class="display">Original details, <em class="display-italic">fully alive</em></h2>
    <p>Two stone and brick fireplaces. A den that feels like a mountain retreat. Separate formal dining. Oversized kitchen. Light-filled living room and tucked-away bedrooms that read like a storybook. Hardwood floors under the carpets, waiting.</p>
    <p>Original details abound — this is a house that was built to last and cared for accordingly. The bones are exceptional.</p>
  </div>

  <div class="house-section">
    <span class="section-label">Outdoor Living</span>
    <h2 class="display">The yard <em class="display-italic">they built</em></h2>
    <p>Gibson House transformed the outdoor space into something exceptional: a deck off the kitchen, a large travertine patio, 25-foot cypress hedges for complete privacy, multiple olive trees, and a pool set beside a vibrant orchard.</p>
    <p>A DG meditation garden connects the living areas to the pool. Mediterranean landscaping throughout. Built for year-round entertaining.</p>
  </div>

  <div class="house-section">
    <span class="section-label">Gibson House</span>
    <h2 class="display">Designed by <em class="display-italic">the best</em></h2>
    <p>Gibson House is a notable local design firm with luxury projects from the Venice Beach canals to Pasadena. Their work is defined by high-style, site-specific design that respects what's already there while building something extraordinary on top of it.</p>
    <p>5142 Dahlia Dr is a Gibson House project — and it shows.</p>
  </div>

  <div class="house-section house-full" style="padding: 3rem 2.5rem;">
    <span class="section-label">The Story</span>
    <h2 class="display" style="font-size: clamp(2rem, 4vw, 3.5rem); margin-bottom: 1.25rem;">Built in 1926<br><em class="display-italic">by W.W. Boyle</em></h2>
    <p style="max-width: 620px; font-size: 0.88rem; line-height: 1.85;">On May 27, 1926, contractor and designer W.W. Boyle pulled a permit for a new 5-room residence on Dahlia Drive — Lot 25 of the Dahlgreen Tract. The original construction cost was $4,000, a premium price at the time, signaling this was built for an upper-middle-class buyer. The original materials: redwood mudsills, brick chimneys, cedar shingle roof. The first owner was E.E. Andrews.</p>
    <p style="max-width: 620px; font-size: 0.88rem; line-height: 1.85; margin-top: 1rem;">The Dahlgreen Tract was part of Eagle Rock's "Hillside Retreat" movement — subdivisions designed to offer views and clean air away from the city center. Boyle likely developed several lots on the block simultaneously, creating a cohesive village feel that still exists today. The property is noted in historic surveys as potentially eligible for the National Register due to its intact 1920s character.</p>
    <p style="max-width: 620px; font-size: 0.88rem; line-height: 1.85; margin-top: 1rem;">Nearly a century later, Gibson House brought it fully into the present — without erasing any of it.</p>
    <div style="margin-top: 2.5rem; max-width: 380px;">
      <img src="/public/permit-1926.png" alt="Original 1926 building permit — 5142 Dahlia Dr" style="width: 100%; border: 0.5px solid var(--sand); display: block;">
      <p style="font-size: 0.72rem; color: var(--muted); letter-spacing: 0.08em; text-transform: uppercase; margin-top: 0.6rem;">Original building permit — May 27, 1926 · Permit No. 15987</p>
    </div>
  </div>
</div>`;

  return pageShell({
    title:    `The House — ${config.address.street}, ${config.neighborhood}`,
    desc:     `3BD/2BA 1926 Tudor in Eagle Rock, Los Angeles. Reimagined by Gibson House with travertine pool patio, orchard, meditation garden, and 25ft cypress hedges.`,
    url:      `${config.siteUrl}/the-house`,
    current:  '/the-house',
    content,
    extraCss: css,
  });
}

// ── Neighborhood ──────────────────────────────────────────────────────────────
function neighborhoodPage() {
  const css = `
  .nbhd-hero { padding: 4rem 2.5rem 3rem; border-bottom: 0.5px solid var(--sand); }
  .nbhd-hero .subtitle { font-size: 0.85rem; color: var(--muted); margin-top: 1.5rem; max-width: 520px; line-height: 1.85; }
  .nbhd-grid { display: grid; grid-template-columns: 1fr 1fr; }
  .nbhd-section {
    padding: 3rem 2.5rem;
    border-right: 0.5px solid var(--sand);
    border-bottom: 0.5px solid var(--sand);
  }
  .nbhd-section:nth-child(even) { border-right: none; }
  .nbhd-section h2 { margin-bottom: 1.25rem; }
  .nbhd-section p { font-size: 0.82rem; color: var(--muted); line-height: 1.85; margin-bottom: 0.85rem; }
  @media (max-width: 768px) {
    .nbhd-hero { padding: 2.5rem 1.25rem 2rem; }
    .nbhd-grid { grid-template-columns: 1fr; }
    .nbhd-section { border-right: none; padding: 2.5rem 1.25rem; }
  }
  `;

  const content = `
<div class="nbhd-hero">
  <span class="section-label">Eagle Rock + Highland Park + Pasadena</span>
  <h1 class="display">The<br><em class="display-italic">Neighborhood</em></h1>
  <p class="subtitle">Eagle Rock sits at the intersection of two worlds: the creative energy of Highland Park to the west, and the established calm of Pasadena to the east. Dahlia Drive is the best of both.</p>
</div>

<div class="nbhd-grid">
  <div class="nbhd-section">
    <span class="section-label">Eagle Rock</span>
    <h2 class="display">A neighborhood <em class="display-italic">with roots</em></h2>
    <p>Eagle Rock is one of the oldest incorporated neighborhoods in Northeast LA — named for the massive boulder on the hillside that casts an eagle shadow at certain times of day. The streets are wide, the lots are generous, and the homes have character that newer developments simply can't replicate.</p>
    <p>Colorado Boulevard is the main artery — coffee shops, restaurants, bookstores, and local businesses that have been there for decades alongside newer spots that have made it a destination. Dahlia Heights Elementary is consistently one of the top-rated public elementary schools in the area.</p>
  </div>

  <div class="nbhd-section">
    <span class="section-label">Highland Park</span>
    <h2 class="display">Next door, <em class="display-italic">in the best way</em></h2>
    <p>Highland Park's York Boulevard and Figueroa Street corridor is a short drive from Dahlia Drive — one of the most vibrant restaurant and bar scenes in Northeast LA. Highly Likely, Kumquat Coffee, Kitchen Mouse, Civil Coffee — the kind of neighborhood food culture that takes years to build.</p>
    <p>The proximity to Highland Park gives Eagle Rock residents access to that energy without being in the middle of it. You get the quiet street and the lively neighborhood simultaneously.</p>
  </div>

  <div class="nbhd-section">
    <span class="section-label">Pasadena</span>
    <h2 class="command">The east, <em class="display-italic">right there</em></h2>
    <p>Eagle Rock borders Pasadena — the 134 Freeway connects them in minutes. Old Town Pasadena, the Huntington Library, the Rose Bowl, Caltech. For anyone working in the San Gabriel Valley or commuting east, Eagle Rock's position is hard to beat.</p>
    <p>The blend of access — Highland Park culture to the west, Pasadena institutions to the east, DTLA 20 minutes south — makes Eagle Rock one of the most strategically located neighborhoods in the city.</p>
  </div>

  <div class="nbhd-section">
    <span class="section-label">Getting Around</span>
    <h2 class="display">Location <em class="display-italic">that works</em></h2>
    <p>The 134 and 2 Freeways run along Eagle Rock's edges. Downtown LA is about 20 minutes without traffic. Pasadena is 10 minutes east. Burbank and Glendale are close to the north. The Metro Gold Line serves Highland Park and Pasadena, with stations accessible from Eagle Rock.</p>
    <p>Dahlia Drive itself is quiet and residential — the street ends at the kind of calm that's rare for how close you are to everything.</p>
  </div>
</div>`;

  return pageShell({
    title:    `Neighborhood — ${config.address.street}, Eagle Rock`,
    desc:     `Eagle Rock neighborhood guide. Near Highland Park restaurants and Pasadena. One of NELA's most coveted streets.`,
    url:      `${config.siteUrl}/neighborhood`,
    current:  '/neighborhood',
    content,
    extraCss: css,
  });
}

// ── Area Guide index ───────────────────────────────────────────────────────────
function areaGuidePage(articles) {
  const css = `
  .guide-hero { padding: 4rem 2.5rem 3rem; border-bottom: 0.5px solid var(--sand); }
  .guide-hero .subtitle { font-size: 0.85rem; color: var(--muted); margin-top: 1.5rem; max-width: 460px; line-height: 1.85; }
  .article-list { }
  .article-row {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    padding: 1.5rem 2.5rem;
    border-bottom: 0.5px solid var(--sand);
    text-decoration: none;
    color: inherit;
    transition: background 0.15s;
  }
  .article-row:hover { background: rgba(0,0,0,0.02); }
  .article-title { font-size: 0.88rem; margin-bottom: 0.35rem; }
  .article-meta { font-size: 0.65rem; color: var(--muted); letter-spacing: 0.1em; }
  .article-arrow { font-size: 0.75rem; color: var(--muted); }
  .empty-state { padding: 4rem 2.5rem; color: var(--muted); font-size: 0.82rem; }
  @media (max-width: 768px) {
    .guide-hero { padding: 2.5rem 1.25rem 2rem; }
    .article-row { padding: 1.25rem; }
  }
  `;

  const list = articles.length
    ? articles.map(a => {
        const date = new Date(a.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        return `<a href="/area-guide/${a.slug}" class="article-row">
          <div>
            <div class="article-title">${a.title}</div>
            <div class="article-meta">${date} · ${a.keyword}</div>
          </div>
          <span class="article-arrow">→</span>
        </a>`;
      }).join('')
    : `<div class="empty-state">Articles coming soon — check back daily.</div>`;

  const content = `
<div class="guide-hero">
  <span class="section-label">Eagle Rock · Highland Park · NELA</span>
  <h1 class="display">Area<br><em class="display-italic">Guide</em></h1>
  <p class="subtitle">Daily articles on Eagle Rock, Highland Park, and Northeast LA — written for people who actually live here.</p>
</div>
<div class="article-list">${list}</div>`;

  return pageShell({
    title:    `Area Guide — Eagle Rock & Highland Park`,
    desc:     `Daily neighborhood articles on Eagle Rock, Highland Park, and NELA. Local insight for buyers and residents.`,
    url:      `${config.siteUrl}/area-guide`,
    current:  '/area-guide',
    content,
    extraCss: css,
  });
}

// ── Individual article ─────────────────────────────────────────────────────────
function articlePage(article) {
  const css = `
  .article-hero { padding: 4rem 2.5rem 3rem; border-bottom: 0.5px solid var(--sand); }
  .article-body {
    max-width: 680px;
    padding: 3rem 2.5rem;
  }
  .article-body p { font-size: 0.88rem; line-height: 1.9; margin-bottom: 1.25rem; color: var(--muted); }
  .article-body h2 {
    font-family: 'Cormorant Garamond', serif;
    font-weight: 300;
    font-size: 1.75rem;
    margin: 2.5rem 0 1rem;
    color: var(--ink);
  }
  .article-body ul { margin: 0 0 1.25rem 1.25rem; }
  .article-body li { font-size: 0.88rem; line-height: 1.9; color: var(--muted); margin-bottom: 0.5rem; }
  .back-link { font-size: 0.65rem; letter-spacing: 0.15em; color: var(--muted); text-transform: uppercase; }
  .back-link:hover { color: var(--ink); }
  @media (max-width: 768px) {
    .article-hero { padding: 2.5rem 1.25rem 2rem; }
    .article-body { padding: 2.5rem 1.25rem; }
  }
  `;

  const date = new Date(article.published_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const content = `
<div class="article-hero">
  <a href="/area-guide" class="back-link">← Area Guide</a>
  <h1 class="display" style="margin-top:1.5rem; font-size:clamp(2rem,5vw,4rem);">${article.title}</h1>
  <p style="font-size:0.65rem; color:var(--muted); letter-spacing:0.1em; margin-top:1rem;">${date} · ${article.keyword}</p>
</div>
<div class="article-body">${article.body_html}</div>`;

  return pageShell({
    title:    `${article.title} — Eagle Rock Area Guide`,
    desc:     article.meta_desc || `Neighborhood guide: ${article.title}`,
    url:      `${config.siteUrl}/area-guide/${article.slug}`,
    current:  '/area-guide',
    content,
    extraCss: css,
  });
}

// ── Built with TextMarco ───────────────────────────────────────────────────────
function builtWithTextmarcoPage() {
  const content = `
<div style="padding: 4rem 2.5rem; max-width: 620px;">
  <span class="section-label">Built with</span>
  <h1 class="display">Text<br><em class="display-italic">Marco</em></h1>
  <p style="font-size:0.85rem; color:var(--muted); line-height:1.85; margin-top:1.5rem;">This property site was built using TextMarco — a platform that lets real estate professionals build beautiful listing sites by text message. No designers, no developers, no waiting.</p>
  <p style="font-size:0.85rem; color:var(--muted); line-height:1.85; margin-top:1rem;">Text Marco to get started: <strong>(888) 900-7501</strong></p>
  <a href="https://textmarco.com" style="display:inline-block; margin-top:2rem; font-size:0.7rem; letter-spacing:0.15em; text-transform:uppercase; border-bottom: 0.5px solid var(--ink); padding-bottom:0.25rem;">Visit TextMarco →</a>
</div>`;

  return pageShell({
    title:    `Built with TextMarco — ${config.address.street}`,
    desc:     `This property marketing site was built with TextMarco. Build your listing site by text message.`,
    url:      `${config.siteUrl}/built-with-textmarco`,
    current:  '/built-with-textmarco',
    content,
    extraCss: '',
  });
}

module.exports = { homePage, theHousePage, neighborhoodPage, areaGuidePage, articlePage, builtWithTextmarcoPage };
