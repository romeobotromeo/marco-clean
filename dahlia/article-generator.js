/**
 * Dahlia Daily Article Generator
 * Generates a 600-900 word neighborhood article using Claude,
 * rotating through 30 keywords. Stores result in dahlia_articles.
 */

const Anthropic = require('@anthropic-ai/sdk');
const config    = require('./config');

function getKeywordForDate(date = new Date()) {
  const dayOfYear = Math.floor(
    (date - new Date(date.getFullYear(), 0, 0)) / 86400000
  );
  return config.keywords[dayOfYear % config.keywords.length];
}

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function countWords(html) {
  return (html.replace(/<[^>]+>/g, ' ').match(/\S+/g) || []).length;
}

async function generateArticle(pool, keyword) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = `You are writing a neighborhood guide article for a property listing site at 5142 Dahlia Dr, Los Angeles, CA 90041 in Eagle Rock.

Target keyword: "${keyword}"
Target word count: 650-850 words

Write a genuine, editorial-quality neighborhood article that:
- Naturally incorporates the target keyword
- Provides real, useful information about the Eagle Rock / NELA area
- Mentions the property's location area organically (not as a sales pitch)
- Has a compelling, keyword-rich title
- Uses 3-4 subheadings (H2 only)
- Reads like a local who actually lives in the neighborhood is writing it — specific, lived-in, opinionated
- Has a brief, editorial closing paragraph

IMPORTANT — accuracy rules:
- Never make specific walkability claims ("walkable to X", "steps from X", "a short walk to X") unless you are completely certain the place is within easy walking distance of Eagle Rock
- Never invent specific street addresses, hours, or prices for businesses
- Avoid superlatives that could be easily disproven ("best in LA", "most affordable", etc.)
- Stick to neighborhood character, culture, vibe, and general area knowledge rather than hyper-specific logistical claims
- If mentioning a specific business or landmark, only do so if you're confident it exists in Eagle Rock / NELA

Return ONLY valid JSON in exactly this format, no markdown, no explanation:
{
  "title": "Article title here",
  "meta_desc": "SEO meta description under 155 characters",
  "body_html": "<p>Intro paragraph...</p><h2>Subheading</h2><p>Content...</p>"
}

The body_html should use only <p>, <h2>, <ul>, <li> tags. No other tags.`;

  const message = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 2048,
    messages:   [{ role: 'user', content: prompt }],
  });

  const raw = message.content[0]?.text?.trim();
  if (!raw) throw new Error('Empty response from Claude');

  const jsonStr = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  const parsed  = JSON.parse(jsonStr);

  if (!parsed.title || !parsed.body_html) {
    throw new Error('Invalid article structure returned');
  }

  const slug      = slugify(parsed.title);
  const wordCount = countWords(parsed.body_html);

  await pool.query(`
    INSERT INTO dahlia_articles (slug, keyword, title, meta_desc, body_html, word_count, published_at)
    VALUES ($1, $2, $3, $4, $5, $6, NOW())
    ON CONFLICT (slug) DO NOTHING
  `, [slug, keyword, parsed.title, parsed.meta_desc || '', parsed.body_html, wordCount]);

  console.log(`[DAHLIA] Article generated: "${parsed.title}" (${wordCount} words, slug: ${slug})`);
  return { slug, keyword, title: parsed.title, wordCount };
}

async function runDailyArticle(pool) {
  const keyword = getKeywordForDate();
  console.log(`[DAHLIA] Daily article — keyword: "${keyword}"`);
  try {
    return await generateArticle(pool, keyword);
  } catch (err) {
    console.error('[DAHLIA] Article generation failed:', err.message);
    return null;
  }
}

module.exports = { runDailyArticle, generateArticle, getKeywordForDate };
