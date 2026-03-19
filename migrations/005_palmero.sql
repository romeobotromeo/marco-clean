-- Palmero giveaway entrants
CREATE TABLE IF NOT EXISTS palmero_giveaway (
  id         SERIAL PRIMARY KEY,
  phone      TEXT NOT NULL,
  source     TEXT DEFAULT 'web',  -- 'web' or 'sms'
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS palmero_giveaway_phone_idx ON palmero_giveaway (phone);

-- Daily SEO articles
CREATE TABLE IF NOT EXISTS palmero_articles (
  id           SERIAL PRIMARY KEY,
  slug         TEXT UNIQUE NOT NULL,
  keyword      TEXT NOT NULL,
  title        TEXT NOT NULL,
  meta_desc    TEXT,
  body_html    TEXT NOT NULL,
  word_count   INTEGER,
  published_at TIMESTAMPTZ DEFAULT NOW(),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
