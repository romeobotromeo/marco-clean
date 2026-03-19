const config = require('./config');

// ── Shared assets ─────────────────────────────────────────────────────────────

function googleFonts() {
  return `<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&family=DM+Mono:wght@300;400&display=swap" rel="stylesheet">`;
}

function baseStyles() {
  return `
:root {
  --cream:     #F2EDE4;
  --ink:       #1A1208;
  --terracotta:#C4602A;
  --sand:      #B8A98A;
  --muted:     #7A6A52;
  --dark:      #2C2416;
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
* { border-radius: 0 !important; }
html { font-size: 16px; scroll-behavior: smooth; }
body {
  font-family: 'DM Mono', monospace;
  font-weight: 300;
  background: var(--cream);
  color: var(--ink);
  line-height: 1.65;
  -webkit-font-smoothing: antialiased;
}
a { color: inherit; text-decoration: none; }
a:hover { color: var(--terracotta); }

/* Nav */
nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.1rem 2.5rem;
  border-bottom: 0.5px solid var(--sand);
  position: sticky;
  top: 0;
  background: var(--cream);
  z-index: 100;
}
.wordmark {
  font-family: 'DM Mono', monospace;
  font-weight: 400;
  font-size: 0.8rem;
  letter-spacing: 0.1em;
  color: var(--ink);
}
.nav-links { display: flex; gap: 2.5rem; align-items: center; }
.nav-links a {
  font-size: 0.65rem;
  letter-spacing: 0.12em;
  color: var(--muted);
  transition: color 0.15s;
}
.nav-links a:hover,
.nav-links a.active { color: var(--ink); }
.nav-cta {
  background: var(--terracotta) !important;
  color: var(--cream) !important;
  padding: 0.4rem 1rem;
  font-size: 0.62rem !important;
  letter-spacing: 0.14em;
  transition: background 0.15s;
}
.nav-cta:hover { background: var(--dark) !important; }

/* Ticker */
.ticker {
  overflow: hidden;
  border-bottom: 0.5px solid var(--sand);
  padding: 0.55rem 0;
  background: var(--cream);
}
.ticker-inner {
  display: flex;
  white-space: nowrap;
  animation: ticker 50s linear infinite;
}
.ticker-inner:hover { animation-play-state: paused; }
.ticker-item {
  display: inline-block;
  padding: 0 2rem;
  font-size: 0.68rem;
  letter-spacing: 0.14em;
  color: var(--muted);
  text-transform: uppercase;
}
.ticker-sep {
  display: inline-block;
  color: var(--sand);
  padding: 0 0.5rem;
}
@keyframes ticker {
  0%   { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}

/* Footer */
.site-footer {
  border-top: 0.5px solid var(--sand);
  padding: 1.75rem 2.5rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.68rem;
  color: var(--muted);
  letter-spacing: 0.06em;
  margin-top: 5rem;
}
.site-footer a { color: var(--terracotta); }

/* Utilities */
.container { max-width: 1160px; margin: 0 auto; padding: 0 2.5rem; }
.divider { border: none; border-top: 0.5px solid var(--sand); }
.section-label {
  font-size: 0.62rem;
  letter-spacing: 0.18em;
  color: var(--muted);
  text-transform: uppercase;
  display: block;
  margin-bottom: 0.75rem;
}
.display {
  font-family: 'Cormorant Garamond', serif;
  font-weight: 300;
}
.display-italic {
  font-family: 'Cormorant Garamond', serif;
  font-weight: 300;
  font-style: italic;
}

/* Buttons */
.btn {
  display: inline-block;
  padding: 0.7rem 1.75rem;
  font-family: 'DM Mono', monospace;
  font-size: 0.68rem;
  font-weight: 400;
  letter-spacing: 0.12em;
  cursor: pointer;
  border: none;
  background: var(--ink);
  color: var(--cream);
  transition: background 0.15s;
  text-transform: uppercase;
}
.btn:hover { background: var(--dark); color: var(--cream); }
.btn-terracotta { background: var(--terracotta); }
.btn-terracotta:hover { background: var(--dark); }
.btn-outline {
  background: transparent;
  border: 0.5px solid var(--ink);
  color: var(--ink);
}
.btn-outline:hover { background: var(--ink); color: var(--cream); }

/* Form inputs */
input[type="tel"],
input[type="text"],
input[type="email"] {
  font-family: 'DM Mono', monospace;
  font-size: 0.82rem;
  font-weight: 300;
  padding: 0.7rem 1rem;
  border: 0.5px solid var(--sand);
  background: var(--cream);
  color: var(--ink);
  width: 100%;
  outline: none;
  transition: border-color 0.15s;
}
input:focus { border-color: var(--ink); }

@media (max-width: 768px) {
  nav { padding: 1rem 1.25rem; }
  .nav-links { gap: 1.25rem; }
  .nav-links a:not(.nav-cta) { display: none; }
  .site-footer { flex-direction: column; gap: 0.5rem; text-align: center; }
  .container { padding: 0 1.25rem; }
}`;
}

function buildNav(current = '') {
  const links = [
    { href: '/the-house',          label: 'THE HOUSE' },
    { href: '/neighborhood',       label: 'NEIGHBORHOOD' },
    { href: '/area-guide',         label: 'AREA GUIDE' },
    { href: '/built-with-textmarco', label: 'HOW IT WORKS' },
  ];
  return `<nav>
  <a href="/" class="wordmark">4175 PALMERO</a>
  <div class="nav-links">
    ${links.map(l => `<a href="${l.href}"${current === l.href ? ' class="active"' : ''}>${l.label}</a>`).join('\n    ')}
    <a href="/#giveaway" class="nav-cta">ENTER GIVEAWAY</a>
  </div>
</nav>`;
}

function buildFooter() {
  return `<footer class="site-footer">
  <span>${config.address.full}</span>
  <span>This site was built by text message — <a href="https://textmarco.com" target="_blank">textmarco.com</a></span>
</footer>`;
}

function buildTicker() {
  const items = [...config.tickerItems, ...config.tickerItems];
  const html  = items.map(t => `<span class="ticker-item">${t}</span><span class="ticker-sep">·</span>`).join('');
  return `<div class="ticker"><div class="ticker-inner">${html}</div></div>`;
}

function pageShell({ title, desc, url, current, content, extraCss = '' }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${desc}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${desc}">
  <meta property="og:url" content="${url || config.siteUrl}">
  <meta property="og:type" content="website">
  <meta name="robots" content="index, follow">
  ${googleFonts()}
  <style>${baseStyles()}${extraCss}</style>
</head>
<body>
${buildNav(current)}
${content}
${buildFooter()}
</body>
</html>`;
}

// ── Homepage ──────────────────────────────────────────────────────────────────

function homePage({ success = false } = {}) {
  const css = `
.hero {
  padding: 5rem 2.5rem 4rem;
  border-bottom: 0.5px solid var(--sand);
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;
  align-items: end;
  max-width: 1160px;
  margin: 0 auto;
}
.hero-address h1 {
  font-family: 'Cormorant Garamond', serif;
  font-weight: 300;
  font-size: clamp(4rem, 9vw, 8rem);
  line-height: 0.92;
  letter-spacing: -0.02em;
  color: var(--ink);
}
.hero-address .street-suffix {
  font-family: 'DM Mono', monospace;
  font-weight: 300;
  font-size: 0.78rem;
  letter-spacing: 0.14em;
  color: var(--muted);
  margin-top: 0.75rem;
}
.hero-meta {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  padding-bottom: 0.5rem;
}
.hero-price {
  font-family: 'Cormorant Garamond', serif;
  font-weight: 300;
  font-size: clamp(2rem, 4vw, 3.25rem);
  letter-spacing: 0.01em;
}
.hero-divider { border: none; border-top: 0.5px solid var(--sand); }
.hero-specs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0;
}
.spec-block {
  padding: 0.75rem 0;
  border-right: 0.5px solid var(--sand);
}
.spec-block:last-child { border-right: none; }
.spec-value {
  font-family: 'DM Mono', monospace;
  font-weight: 400;
  font-size: 1.25rem;
  display: block;
}
.spec-label {
  font-size: 0.62rem;
  letter-spacing: 0.12em;
  color: var(--muted);
  text-transform: uppercase;
  display: block;
  margin-top: 0.15rem;
}
.hero-sub {
  font-size: 0.68rem;
  letter-spacing: 0.1em;
  color: var(--muted);
  text-transform: uppercase;
}

/* Stats strip */
.stats-strip {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border-bottom: 0.5px solid var(--sand);
  max-width: 1160px;
  margin: 0 auto;
}
.stat-cell {
  padding: 1.75rem 2.5rem;
  border-right: 0.5px solid var(--sand);
}
.stat-cell:last-child { border-right: none; }
.stat-num {
  font-family: 'Cormorant Garamond', serif;
  font-weight: 300;
  font-size: 2.25rem;
  display: block;
  line-height: 1;
}
.stat-unit {
  font-size: 0.62rem;
  letter-spacing: 0.12em;
  color: var(--muted);
  text-transform: uppercase;
  display: block;
  margin-top: 0.35rem;
}

/* Giveaway */
.giveaway {
  padding: 4rem 2.5rem;
  max-width: 1160px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4rem;
  align-items: start;
}
.giveaway-text h2 {
  font-family: 'Cormorant Garamond', serif;
  font-weight: 300;
  font-size: clamp(2rem, 4vw, 3rem);
  line-height: 1.1;
  margin-bottom: 1rem;
}
.giveaway-text p {
  font-size: 0.82rem;
  color: var(--muted);
  line-height: 1.7;
  margin-bottom: 1.5rem;
}
.giveaway-form-wrap {}
.form-row { display: flex; gap: 0; }
.form-row input { flex: 1; }
.form-row button {
  flex-shrink: 0;
  padding: 0.7rem 1.5rem;
  font-family: 'DM Mono', monospace;
  font-size: 0.68rem;
  letter-spacing: 0.12em;
  font-weight: 400;
  background: var(--terracotta);
  color: var(--cream);
  border: none;
  cursor: pointer;
  text-transform: uppercase;
  transition: background 0.15s;
}
.form-row button:hover { background: var(--dark); }
.sms-alt {
  font-size: 0.72rem;
  color: var(--muted);
  margin-top: 1rem;
  letter-spacing: 0.04em;
}
.sms-keyword {
  font-weight: 400;
  color: var(--terracotta);
  letter-spacing: 0.1em;
}
.success-msg {
  font-size: 0.82rem;
  color: var(--terracotta);
  padding: 0.75rem 0;
  letter-spacing: 0.06em;
}

/* Preview links */
.page-previews {
  border-top: 0.5px solid var(--sand);
  max-width: 1160px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
}
.preview-link {
  padding: 2.5rem;
  border-right: 0.5px solid var(--sand);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.preview-link:last-child { border-right: none; }
.preview-label {
  font-size: 0.62rem;
  letter-spacing: 0.14em;
  color: var(--muted);
  text-transform: uppercase;
}
.preview-title {
  font-family: 'Cormorant Garamond', serif;
  font-weight: 300;
  font-size: 1.5rem;
  line-height: 1.2;
}
.preview-arrow {
  font-size: 0.72rem;
  color: var(--terracotta);
  margin-top: 0.5rem;
}

@media (max-width: 768px) {
  .hero { grid-template-columns: 1fr; padding: 3rem 1.25rem 2.5rem; }
  .stats-strip { grid-template-columns: repeat(2, 1fr); }
  .stat-cell:nth-child(2) { border-right: none; }
  .giveaway { grid-template-columns: 1fr; gap: 2rem; padding: 3rem 1.25rem; }
  .page-previews { grid-template-columns: 1fr; }
  .preview-link { border-right: none; border-bottom: 0.5px solid var(--sand); }
}`;

  const giveawayForm = success
    ? `<p class="success-msg">You're in. We'll be in touch.</p>`
    : `<div class="form-row">
        <input type="tel" name="phone" placeholder="(323) 555-0100" required>
        <button type="submit">ENTER</button>
      </div>
      <p class="sms-alt">Or text <span class="sms-keyword">PALMERO</span> to ${config.smsNumber}</p>`;

  const content = `
${buildTicker()}

<div class="hero">
  <div class="hero-address">
    <span class="section-label">Mount Washington — Los Angeles 90065</span>
    <h1 class="display">4175<br>PALMERO<br>DR</h1>
    <p class="street-suffix">LOS ANGELES, CA 90065</p>
  </div>
  <div class="hero-meta">
    <div>
      <span class="section-label">Listed at</span>
      <div class="hero-price display">${config.price}</div>
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
    <p class="hero-sub">Built ${config.yearBuilt} · ${config.lot} lot</p>
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
    <span class="stat-num display">${config.neighborhood.split(' ')[0]}</span>
    <span class="stat-unit">Neighborhood</span>
  </div>
</div>

<div class="giveaway" id="giveaway">
  <div class="giveaway-text">
    <span class="section-label">Giveaway</span>
    <h2 class="display">Win a private<br><em class="display-italic">tour of this home</em></h2>
    <p>${config.giveawayPrize}.</p>
    <p>Enter your number below or text <strong>${config.smsKeyword}</strong> to ${config.smsNumber}. We'll announce the winner before closing.</p>
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
    desc:     `${config.beds}BD/${config.baths}BA ${config.sqft} sq ft home in ${config.neighborhood}, Los Angeles. Built ${config.yearBuilt}. Listed at ${config.price}.`,
    url:      config.siteUrl,
    current:  '/',
    content,
    extraCss: css,
  });
}

// ── The House ─────────────────────────────────────────────────────────────────

function theHousePage() {
  const css = `
.house-hero {
  padding: 5rem 2.5rem 4rem;
  border-bottom: 0.5px solid var(--sand);
  max-width: 1160px;
  margin: 0 auto;
}
.house-hero h1 {
  font-family: 'Cormorant Garamond', serif;
  font-weight: 300;
  font-size: clamp(3rem, 7vw, 6rem);
  line-height: 1;
  margin-bottom: 1rem;
}
.house-hero .subtitle {
  font-size: 0.82rem;
  color: var(--muted);
  max-width: 520px;
  line-height: 1.7;
}
.house-grid {
  max-width: 1160px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
}
.house-section {
  padding: 3rem 2.5rem;
  border-bottom: 0.5px solid var(--sand);
  border-right: 0.5px solid var(--sand);
}
.house-section:nth-child(even) { border-right: none; }
.house-section h2 {
  font-family: 'Cormorant Garamond', serif;
  font-weight: 300;
  font-size: 1.75rem;
  margin-bottom: 1rem;
  line-height: 1.2;
}
.house-section p {
  font-size: 0.82rem;
  color: var(--muted);
  line-height: 1.8;
  margin-bottom: 0.75rem;
}
.house-section ul {
  list-style: none;
  padding: 0;
  margin: 0.75rem 0 0;
}
.house-section li {
  font-size: 0.78rem;
  color: var(--muted);
  padding: 0.35rem 0;
  border-bottom: 0.5px solid var(--sand);
  display: flex;
  justify-content: space-between;
}
.house-section li:last-child { border-bottom: none; }
.house-section li span { color: var(--ink); font-weight: 400; }
.house-full {
  grid-column: 1 / -1;
  border-right: none;
}
@media (max-width: 768px) {
  .house-hero { padding: 3rem 1.25rem 2.5rem; }
  .house-grid { grid-template-columns: 1fr; }
  .house-section { border-right: none; }
}`;

  const content = `
<div class="house-hero">
  <span class="section-label">4175 Palmero Dr — ${config.neighborhood}</span>
  <h1 class="display">The<br><em class="display-italic">House</em></h1>
  <p class="subtitle">A 1928 Craftsman bungalow on a hillside lot in Mount Washington, quietly updated for the way people live now while keeping everything that made it worth saving.</p>
</div>

<div class="house-grid">
  <div class="house-section">
    <span class="section-label">Vitals</span>
    <h2 class="display">By the numbers</h2>
    <ul>
      <li>Bedrooms <span>${config.beds}</span></li>
      <li>Bathrooms <span>${config.baths} full</span></li>
      <li>Living area <span>${config.sqft.toLocaleString()} sq ft</span></li>
      <li>Lot size <span>${config.lot}</span></li>
      <li>Year built <span>${config.yearBuilt}</span></li>
      <li>Style <span>Craftsman Bungalow</span></li>
      <li>Parking <span>2-car garage</span></li>
    </ul>
  </div>

  <div class="house-section">
    <span class="section-label">Interior</span>
    <h2 class="display">Original details, <em class="display-italic">thoughtfully kept</em></h2>
    <p>The original fir floors run through the main living areas, dark from nearly a century of afternoon light. Built-in bookshelves flank the fireplace. Picture rails and crown molding — both original — run through every room.</p>
    <p>The kitchen was renovated without erasing the house: white Shaker cabinets, Carrara marble counters, a vintage-style range. The back window frames the terraced yard and the hills beyond it.</p>
  </div>

  <div class="house-section">
    <span class="section-label">Primary Suite</span>
    <h2 class="display">Views from <em class="display-italic">the top</em></h2>
    <p>The primary bedroom occupies the quietest corner of the house — a hillside room with canyon views east toward the San Gabriels. The ensuite bath has subway tile, a soaking tub, and period fixtures restored rather than replaced.</p>
  </div>

  <div class="house-section">
    <span class="section-label">Exterior</span>
    <h2 class="display">The yard is half the house</h2>
    <p>Three terraced levels step down the hillside behind the house: a dining terrace off the kitchen, a garden level with mature citrus and olive trees, and a lower flat area that gets afternoon sun all year. The front porch runs the full width of the facade.</p>
  </div>

  <div class="house-section house-full" style="padding: 3rem 2.5rem;">
    <span class="section-label">The Story</span>
    <h2 class="display" style="font-size: clamp(2rem, 4vw, 3.5rem); margin-bottom: 1.25rem;">Built in 1928,<br><em class="display-italic">still here for a reason</em></h2>
    <p style="max-width: 620px; font-size: 0.88rem; line-height: 1.85;">Mount Washington bungalows from this era were built to last — thick plaster walls, old-growth lumber, proportions that hold up across a century of tastes. This one has been cared for by people who understood what they had. The work done here over the years was additive, not subtractive. The result is a house that feels old in the best way: settled, particular, with an ease that newer construction doesn't manufacture.</p>
  </div>
</div>`;

  return pageShell({
    title:    `The House — ${config.address.street}, ${config.neighborhood}`,
    desc:     `3-bedroom 1928 Craftsman bungalow in Mount Washington, Los Angeles. Original hardwood floors, renovated kitchen, hillside yard with canyon views.`,
    url:      `${config.siteUrl}/the-house`,
    current:  '/the-house',
    content,
    extraCss: css,
  });
}

// ── Neighborhood ──────────────────────────────────────────────────────────────

function neighborhoodPage() {
  const css = `
.hood-hero {
  padding: 5rem 2.5rem 4rem;
  border-bottom: 0.5px solid var(--sand);
  max-width: 1160px;
  margin: 0 auto;
}
.hood-hero h1 {
  font-family: 'Cormorant Garamond', serif;
  font-weight: 300;
  font-size: clamp(3rem, 7vw, 6rem);
  line-height: 1;
  margin-bottom: 1rem;
}
.hood-grid {
  max-width: 1160px;
  margin: 0 auto;
}
.hood-section {
  padding: 3rem 2.5rem;
  border-bottom: 0.5px solid var(--sand);
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 3rem;
}
.hood-section-label { padding-top: 0.2rem; }
.hood-section h2 {
  font-family: 'Cormorant Garamond', serif;
  font-weight: 300;
  font-size: 1.75rem;
  margin-bottom: 1rem;
  line-height: 1.2;
}
.hood-section p {
  font-size: 0.82rem;
  color: var(--muted);
  line-height: 1.8;
  margin-bottom: 0.75rem;
}
.spot-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0;
  margin-top: 1.25rem;
}
.spot {
  padding: 0.85rem 0;
  border-bottom: 0.5px solid var(--sand);
}
.spot:nth-child(odd) { padding-right: 1.5rem; border-right: 0.5px solid var(--sand); }
.spot:nth-child(even) { padding-left: 1.5rem; }
.spot-name {
  font-size: 0.82rem;
  color: var(--ink);
  display: block;
}
.spot-type {
  font-size: 0.65rem;
  letter-spacing: 0.1em;
  color: var(--muted);
  text-transform: uppercase;
  display: block;
  margin-top: 0.15rem;
}
@media (max-width: 768px) {
  .hood-hero { padding: 3rem 1.25rem 2.5rem; }
  .hood-section { grid-template-columns: 1fr; gap: 1.5rem; padding: 2.5rem 1.25rem; }
  .spot-list { grid-template-columns: 1fr; }
  .spot:nth-child(odd) { border-right: none; padding-right: 0; }
  .spot:nth-child(even) { padding-left: 0; }
}`;

  const content = `
<div class="hood-hero">
  <span class="section-label">Highland Park + Mount Washington</span>
  <h1 class="display">The<br><em class="display-italic">Neighborhood</em></h1>
  <p style="font-size:0.88rem; color:var(--muted); max-width:580px; line-height:1.75;">Two neighborhoods, one culture. Mount Washington is where you sleep. Highland Park is where you eat, drink, and argue about which coffee shop is actually better.</p>
</div>

<div class="hood-grid">
  <div class="hood-section">
    <div class="hood-section-label">
      <span class="section-label">Mount Washington</span>
    </div>
    <div>
      <h2 class="display">Hillside quiet, <em class="display-italic">five minutes from everything</em></h2>
      <p>Mount Washington is one of the few neighborhoods in LA where the streets go silent after 9pm. The houses are hillside Craftsmans, California bungalows, and the occasional mid-century modern — most of them with views, all of them on curving streets that dead-end at canyon edges.</p>
      <p>Ernest E. Debs Regional Park cuts through the neighborhood — 282 acres of oak woodland, hiking trails, and a pond that draws birders and families on weekday mornings. The park is walkable from Palmero Drive.</p>
    </div>
  </div>

  <div class="hood-section">
    <div class="hood-section-label">
      <span class="section-label">Highland Park</span>
    </div>
    <div>
      <h2 class="display">York Boulevard is <em class="display-italic">the corridor</em></h2>
      <p>York Boulevard and Figueroa Street are the main arteries of Highland Park — independently owned restaurants, coffee roasters, record shops, art galleries, and natural wine bars stacked side by side. It's a walkable commercial district of the kind LA rarely produces.</p>
      <p>The neighborhood has been a working-class Latino community for generations and a creative corridor for the last decade — both things are true simultaneously, and the tension between them is part of its character.</p>
      <div class="spot-list">
        <div class="spot"><span class="spot-name">Kumquat Coffee</span><span class="spot-type">Coffee</span></div>
        <div class="spot"><span class="spot-name">Café de Leche</span><span class="spot-type">Coffee</span></div>
        <div class="spot"><span class="spot-name">Tallula's</span><span class="spot-type">Restaurant</span></div>
        <div class="spot"><span class="spot-name">The Greyhound</span><span class="spot-type">Bar</span></div>
        <div class="spot"><span class="spot-name">Highly Likely</span><span class="spot-type">Restaurant</span></div>
        <div class="spot"><span class="spot-name">Avenue 50 Studio</span><span class="spot-type">Gallery</span></div>
        <div class="spot"><span class="spot-name">Kitchen Mouse</span><span class="spot-type">Brunch</span></div>
        <div class="spot"><span class="spot-name">Donut Friend</span><span class="spot-type">Bakery</span></div>
      </div>
    </div>
  </div>

  <div class="hood-section">
    <div class="hood-section-label">
      <span class="section-label">Getting Around</span>
    </div>
    <div>
      <h2 class="display">Downtown in <em class="display-italic">15 minutes</em></h2>
      <p>The 110 Freeway runs along the western edge of Mount Washington — on-ramp access is 5 minutes from Palmero Drive. Downtown LA is 15 minutes by car without traffic. The Metro Gold Line stops at Southwest Museum and Highland Park stations, both within a mile.</p>
      <p>Pasadena is 20 minutes east. Silverlake and Los Feliz are 10 minutes west. You're in the geographic center of the parts of LA that people actually want to be in.</p>
    </div>
  </div>

  <div class="hood-section" style="border-bottom: none;">
    <div class="hood-section-label">
      <span class="section-label">Context</span>
    </div>
    <div>
      <h2 class="display">Why people <em class="display-italic">stay</em></h2>
      <p>People who move to Mount Washington and Highland Park tend to stay. The hillside streets and the walkable commercial district offer something rare in Los Angeles: a neighborhood with a specific character, where the same faces show up at the same coffee shop on Saturday morning.</p>
      <p>NELA — Northeast Los Angeles — has been one of the most consistently appreciated real estate corridors in the city for the past fifteen years. Proximity to downtown, architectural stock that can't be reproduced, and a cultural scene that outlasted the trend cycle.</p>
    </div>
  </div>
</div>`;

  return pageShell({
    title:    `The Neighborhood — Highland Park & Mount Washington, Los Angeles`,
    desc:     `Highland Park and Mount Washington neighborhood guide: coffee, restaurants, parks, commute, and culture in NELA, Los Angeles 90065.`,
    url:      `${config.siteUrl}/neighborhood`,
    current:  '/neighborhood',
    content,
    extraCss: css,
  });
}

// ── Area Guide index ──────────────────────────────────────────────────────────

function areaGuidePage(articles) {
  const css = `
.guide-hero {
  padding: 5rem 2.5rem 4rem;
  border-bottom: 0.5px solid var(--sand);
  max-width: 1160px;
  margin: 0 auto;
}
.guide-hero h1 {
  font-family: 'Cormorant Garamond', serif;
  font-weight: 300;
  font-size: clamp(3rem, 7vw, 6rem);
  line-height: 1;
  margin-bottom: 1rem;
}
.article-list {
  max-width: 1160px;
  margin: 0 auto;
}
.article-row {
  display: grid;
  grid-template-columns: 120px 1fr 80px;
  gap: 2rem;
  align-items: baseline;
  padding: 1.5rem 2.5rem;
  border-bottom: 0.5px solid var(--sand);
  text-decoration: none;
  color: var(--ink);
  transition: background 0.1s;
}
.article-row:hover { background: rgba(0,0,0,0.015); }
.article-row:hover .article-title { color: var(--terracotta); }
.article-date {
  font-size: 0.65rem;
  letter-spacing: 0.08em;
  color: var(--muted);
  white-space: nowrap;
}
.article-title {
  font-family: 'Cormorant Garamond', serif;
  font-weight: 300;
  font-size: 1.2rem;
  transition: color 0.15s;
}
.article-kw {
  font-size: 0.62rem;
  letter-spacing: 0.08em;
  color: var(--muted);
  text-align: right;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.empty-state {
  padding: 5rem 2.5rem;
  font-size: 0.82rem;
  color: var(--muted);
  max-width: 1160px;
  margin: 0 auto;
}
@media (max-width: 768px) {
  .guide-hero { padding: 3rem 1.25rem 2.5rem; }
  .article-row { grid-template-columns: 1fr; gap: 0.25rem; padding: 1.25rem 1.25rem; }
  .article-kw { display: none; }
}`;

  const rows = articles.length === 0
    ? `<div class="empty-state">New articles published every morning. Check back tomorrow.</div>`
    : articles.map(a => {
        const date = new Date(a.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        return `<a href="/area-guide/${a.slug}" class="article-row">
  <span class="article-date">${date}</span>
  <span class="article-title display">${a.title}</span>
  <span class="article-kw">NELA</span>
</a>`;
      }).join('\n');

  const content = `
<div class="guide-hero">
  <span class="section-label">Highland Park · Mount Washington · NELA</span>
  <h1 class="display">Area<br><em class="display-italic">Guide</em></h1>
  <p style="font-size:0.82rem; color:var(--muted); max-width:500px; line-height:1.7;">A living index of Northeast Los Angeles. New articles every morning.</p>
</div>
<div class="article-list">${rows}</div>`;

  return pageShell({
    title:    `Area Guide — Highland Park & Mount Washington, Los Angeles`,
    desc:     `A growing neighborhood guide to Highland Park, Mount Washington, and Northeast Los Angeles. New articles every morning.`,
    url:      `${config.siteUrl}/area-guide`,
    current:  '/area-guide',
    content,
    extraCss: css,
  });
}

// ── Individual article ────────────────────────────────────────────────────────

function articlePage(article) {
  const css = `
.article-wrap {
  max-width: 1160px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 0;
  border-bottom: 0.5px solid var(--sand);
}
.article-sidebar {
  border-right: 0.5px solid var(--sand);
  padding: 3rem 2.5rem;
  position: sticky;
  top: 56px;
  align-self: start;
}
.article-back {
  display: block;
  font-size: 0.68rem;
  letter-spacing: 0.1em;
  color: var(--muted);
  margin-bottom: 2rem;
}
.article-back:hover { color: var(--terracotta); }
.article-date {
  font-size: 0.65rem;
  letter-spacing: 0.1em;
  color: var(--muted);
  text-transform: uppercase;
  display: block;
  margin-bottom: 0.5rem;
}
.article-kw-tag {
  font-size: 0.65rem;
  letter-spacing: 0.08em;
  color: var(--terracotta);
  display: block;
  margin-top: 2rem;
}
.article-body {
  padding: 3rem 3rem 3rem 3.5rem;
}
.article-body h1 {
  font-family: 'Cormorant Garamond', serif;
  font-weight: 300;
  font-size: clamp(1.75rem, 3.5vw, 3rem);
  line-height: 1.15;
  margin-bottom: 2rem;
}
.article-body h2 {
  font-family: 'Cormorant Garamond', serif;
  font-weight: 300;
  font-size: 1.5rem;
  margin: 2.5rem 0 0.75rem;
  color: var(--ink);
}
.article-body p {
  font-size: 0.88rem;
  line-height: 1.85;
  color: var(--muted);
  margin-bottom: 1.1rem;
}
.article-body ul {
  padding-left: 1.25rem;
  margin-bottom: 1.1rem;
}
.article-body li {
  font-size: 0.88rem;
  line-height: 1.75;
  color: var(--muted);
  margin-bottom: 0.35rem;
}
.article-cta {
  margin-top: 3rem;
  padding-top: 2rem;
  border-top: 0.5px solid var(--sand);
}
.article-cta h3 {
  font-family: 'Cormorant Garamond', serif;
  font-weight: 300;
  font-size: 1.35rem;
  margin-bottom: 0.5rem;
}
.article-cta p { font-size: 0.78rem; color: var(--muted); }
@media (max-width: 768px) {
  .article-wrap { grid-template-columns: 1fr; }
  .article-sidebar { position: static; border-right: none; border-bottom: 0.5px solid var(--sand); padding: 2rem 1.25rem; }
  .article-body { padding: 2rem 1.25rem; }
}`;

  const date = new Date(article.published_at).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric'
  });

  const content = `
<div class="article-wrap">
  <div class="article-sidebar">
    <a href="/area-guide" class="article-back">← Area Guide</a>
    <span class="article-date">${date}</span>
    <span class="section-label" style="margin-top:0.5rem;">Highland Park · NELA</span>
    <a href="/" class="article-kw-tag" style="margin-top:3rem; display:block;">4175 Palmero Dr →</a>
  </div>
  <div class="article-body">
    <h1 class="display">${article.title}</h1>
    ${article.body_html}
    <div class="article-cta">
      <h3 class="display">4175 Palmero Dr</h3>
      <p>${config.neighborhood}, Los Angeles · ${config.beds} BD / ${config.baths} BA · ${config.price}</p>
      <a href="/#giveaway" class="btn btn-terracotta" style="margin-top:1rem;">Enter the Giveaway</a>
    </div>
  </div>
</div>`;

  return pageShell({
    title:    `${article.title} — Area Guide`,
    desc:     article.meta_desc || `A neighborhood guide article about Highland Park and Mount Washington, Los Angeles.`,
    url:      `${config.siteUrl}/area-guide/${article.slug}`,
    current:  '/area-guide',
    content,
    extraCss: css,
  });
}

// ── Built with TextMarco ──────────────────────────────────────────────────────

function builtWithTextmarcoPage() {
  const css = `
.btm-hero {
  padding: 5rem 2.5rem 4rem;
  border-bottom: 0.5px solid var(--sand);
  max-width: 1160px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4rem;
  align-items: end;
}
.btm-hero h1 {
  font-family: 'Cormorant Garamond', serif;
  font-weight: 300;
  font-size: clamp(2.5rem, 6vw, 5.5rem);
  line-height: 1;
}
.btm-hero p {
  font-size: 0.88rem;
  color: var(--muted);
  line-height: 1.8;
}
.btm-body {
  max-width: 1160px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
}
.btm-section {
  padding: 3.5rem 2.5rem;
  border-bottom: 0.5px solid var(--sand);
  border-right: 0.5px solid var(--sand);
}
.btm-section:nth-child(even) { border-right: none; }
.btm-section h2 {
  font-family: 'Cormorant Garamond', serif;
  font-weight: 300;
  font-size: 1.75rem;
  margin-bottom: 1rem;
  line-height: 1.2;
}
.btm-section p {
  font-size: 0.82rem;
  color: var(--muted);
  line-height: 1.8;
  margin-bottom: 0.75rem;
}

/* SMS transcript */
.sms-transcript {
  max-width: 1160px;
  margin: 0 auto;
  padding: 3.5rem 2.5rem;
  border-bottom: 0.5px solid var(--sand);
}
.sms-transcript h2 {
  font-family: 'Cormorant Garamond', serif;
  font-weight: 300;
  font-size: 1.75rem;
  margin-bottom: 2rem;
}
.sms-log {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-width: 520px;
}
.sms-msg {
  font-size: 0.8rem;
  line-height: 1.55;
  padding: 0.7rem 1rem;
  max-width: 80%;
}
.sms-from-user {
  align-self: flex-end;
  background: var(--ink);
  color: var(--cream);
}
.sms-from-marco {
  align-self: flex-start;
  border: 0.5px solid var(--sand);
  color: var(--ink);
}
.sms-label {
  font-size: 0.6rem;
  letter-spacing: 0.1em;
  color: var(--muted);
  margin-bottom: 0.15rem;
}
.sms-label-right { text-align: right; }

/* CTA section */
.btm-cta {
  max-width: 1160px;
  margin: 0 auto;
  padding: 4rem 2.5rem;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4rem;
  align-items: center;
}
.btm-cta h2 {
  font-family: 'Cormorant Garamond', serif;
  font-weight: 300;
  font-size: clamp(2rem, 4vw, 3.5rem);
  line-height: 1.1;
}
.btm-cta p { font-size: 0.82rem; color: var(--muted); line-height: 1.8; margin-bottom: 1.5rem; }
@media (max-width: 768px) {
  .btm-hero { grid-template-columns: 1fr; gap: 2rem; padding: 3rem 1.25rem; }
  .btm-body { grid-template-columns: 1fr; }
  .btm-section { border-right: none; }
  .btm-cta { grid-template-columns: 1fr; gap: 2rem; padding: 3rem 1.25rem; }
  .sms-transcript { padding: 2.5rem 1.25rem; }
}`;

  const content = `
<div class="btm-hero">
  <div>
    <span class="section-label">TextMarco</span>
    <h1 class="display">A website,<br>built by<br><em class="display-italic">text message</em></h1>
  </div>
  <div>
    <p>This property site was built using TextMarco — a service that lets anyone create a professional website by having a conversation over SMS. No designer, no developer, no agency.</p>
    <p>You text Marco, answer five questions, and your site is live within minutes at your own URL.</p>
  </div>
</div>

<div class="btm-body">
  <div class="btm-section">
    <span class="section-label">How it works</span>
    <h2 class="display">Five questions. <em class="display-italic">Five minutes.</em></h2>
    <p>Marco is an AI that collects the information it needs to build your site through a simple text conversation. Business name, type, contact information, a few details about what you do.</p>
    <p>When the conversation ends, your site is automatically generated, deployed to a subdomain, and live — without you touching a single button.</p>
  </div>

  <div class="btm-section">
    <span class="section-label">The technology</span>
    <h2 class="display">AI that <em class="display-italic">actually builds things</em></h2>
    <p>Marco uses Claude (by Anthropic) to conduct the conversation and generate the site HTML. The final site is deployed to Cloudflare Pages — the same global infrastructure that powers millions of production websites.</p>
    <p>Sites are mobile-responsive, SEO-optimized, and load in under a second anywhere in the world.</p>
  </div>
</div>

<div class="sms-transcript">
  <span class="section-label">How the Palmero site was built</span>
  <h2 class="display">The actual conversation</h2>
  <div class="sms-log">
    <div>
      <p class="sms-label sms-label-right">You</p>
      <div class="sms-msg sms-from-user">hey</div>
    </div>
    <div>
      <p class="sms-label">Marco</p>
      <div class="sms-msg sms-from-marco">hey it's Marco. are you ready to take the internet by storm? let's build you a site. business or personal?</div>
    </div>
    <div>
      <p class="sms-label sms-label-right">You</p>
      <div class="sms-msg sms-from-user">business. property listing in mount washington</div>
    </div>
    <div>
      <p class="sms-label">Marco</p>
      <div class="sms-msg sms-from-marco">nice. what's the name — the address or the property name you want on the site?</div>
    </div>
    <div>
      <p class="sms-label sms-label-right">You</p>
      <div class="sms-msg sms-from-user">4175 Palmero Dr</div>
    </div>
    <div>
      <p class="sms-label">Marco</p>
      <div class="sms-msg sms-from-marco">got it. any particular look you want — clean editorial, modern dark, classic real estate?</div>
    </div>
    <div>
      <p class="sms-label sms-label-right">You</p>
      <div class="sms-msg sms-from-user">editorial. like a magazine. cream and terracotta</div>
    </div>
    <div>
      <p class="sms-label">Marco</p>
      <div class="sms-msg sms-from-marco">building it now. give me a minute.</div>
    </div>
    <div>
      <p class="sms-label">Marco</p>
      <div class="sms-msg sms-from-marco">here it is → 4175palmero.textmarco.com</div>
    </div>
  </div>
</div>

<div class="btm-cta">
  <div>
    <span class="section-label">TextMarco</span>
    <h2 class="display">Build your site<br><em class="display-italic">by text</em></h2>
  </div>
  <div>
    <p>TextMarco builds professional websites through SMS. $9.99/month, cancel any time. No contracts, no designer required, no technical knowledge needed.</p>
    <p>Text us to get started, or visit textmarco.com to learn more.</p>
    <a href="https://textmarco.com" target="_blank" class="btn btn-terracotta">Visit textmarco.com</a>
  </div>
</div>`;

  return pageShell({
    title:    `Built with TextMarco — Websites by Text Message`,
    desc:     `This property site was built using TextMarco, a service that builds professional websites through SMS conversations. Learn how it works.`,
    url:      `${config.siteUrl}/built-with-textmarco`,
    current:  '/built-with-textmarco',
    content,
    extraCss: css,
  });
}

module.exports = {
  homePage,
  theHousePage,
  neighborhoodPage,
  areaGuidePage,
  articlePage,
  builtWithTextmarcoPage,
};
