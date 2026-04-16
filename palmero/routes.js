/**
 * Palmero property site routes
 * Mounted via virtual host: req.hostname === '4175palmero.textmarco.com'
 * Also accessible at /palmero/* for local testing
 */

const express = require('express');
const router  = express.Router();

const T        = require('./templates');
const config   = require('./config');

// ── Homepage ──────────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  res.send(T.homePage());
});

// ── Static pages ──────────────────────────────────────────────────────────────
router.get('/the-house', (req, res) => {
  res.send(T.theHousePage());
});

router.get('/neighborhood', (req, res) => {
  res.send(T.neighborhoodPage());
});

router.get('/built-with-textmarco', (req, res) => {
  res.send(T.builtWithTextmarcoPage());
});

// ── Area Guide index ──────────────────────────────────────────────────────────
router.get('/area-guide', async (req, res) => {
  try {
    const pool = req.app.get('pool');
    const result = await pool.query(
      `SELECT slug, title, keyword, published_at FROM palmero_articles ORDER BY published_at DESC LIMIT 60`
    );
    res.send(T.areaGuidePage(result.rows));
  } catch (err) {
    console.error('[PALMERO] Area guide error:', err.message);
    res.send(T.areaGuidePage([]));
  }
});

// ── Individual article ────────────────────────────────────────────────────────
router.get('/area-guide/:slug', async (req, res) => {
  try {
    const pool   = req.app.get('pool');
    const result = await pool.query(
      `SELECT * FROM palmero_articles WHERE slug = $1`,
      [req.params.slug]
    );
    if (!result.rows[0]) return res.status(404).send(T.areaGuidePage([]));
    res.send(T.articlePage(result.rows[0]));
  } catch (err) {
    console.error('[PALMERO] Article error:', err.message);
    res.status(500).send('Error loading article.');
  }
});

module.exports = router;
