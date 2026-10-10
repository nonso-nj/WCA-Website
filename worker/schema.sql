-- WCA site content and admin. Apply with:
--   npx wrangler d1 execute wca-db --remote --file worker/schema.sql

CREATE TABLE IF NOT EXISTS sermons (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  date TEXT NOT NULL,                 -- YYYY-MM-DD
  speakers TEXT NOT NULL DEFAULT '[]',-- JSON array of names
  series TEXT NOT NULL DEFAULT '[]',
  topics TEXT NOT NULL DEFAULT '[]',
  description TEXT NOT NULL DEFAULT '',  -- cleaned HTML
  summary TEXT NOT NULL DEFAULT '',      -- short plain-text preview
  youtube TEXT,
  youtube_start INTEGER NOT NULL DEFAULT 0,
  audio_key TEXT,                     -- R2 key, played from the public media address
  notes_url TEXT,                     -- sermon notes PDF (site path or full URL)
  published INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS sermons_date ON sermons(date);

CREATE TABLE IF NOT EXISTS summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sermon_slug TEXT NOT NULL,
  kind TEXT NOT NULL,                 -- 'pdf' (url) or 'page' (body)
  url TEXT,
  body TEXT,
  position INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS summaries_sermon ON summaries(sermon_slug);

CREATE TABLE IF NOT EXISTS songs (
  slug TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'song',  -- 'song' or 'session' (full worship recording)
  title TEXT NOT NULL,
  credit TEXT NOT NULL DEFAULT '',
  lyrics TEXT NOT NULL DEFAULT '',
  audio_key TEXT,
  date TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS devotionals (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  number TEXT,
  date TEXT NOT NULL,
  topic TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  excerpt TEXT NOT NULL DEFAULT '',
  verse_text TEXT,
  verse_ref TEXT,
  image TEXT,
  feature_on TEXT,                    -- the day it is the verse of the day; afterwards it joins the rotation
  published INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS devotionals_date ON devotionals(date);

CREATE TABLE IF NOT EXISTS studies (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'outline', -- 'outline' or 'article'
  topic TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  excerpt TEXT NOT NULL DEFAULT '',
  pdf_url TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  recurs TEXT NOT NULL DEFAULT 'weekly', -- 'once', 'weekly' or 'daily'
  days TEXT NOT NULL DEFAULT '[]',       -- weekly: JSON list of weekdays, 0 = Sunday
  date TEXT,                             -- once: the date; weekly/daily: optional first date
  end_date TEXT,                         -- weekly/daily: optional last date
  start_time TEXT,                       -- HH:MM, 24-hour, Winnipeg time
  end_time TEXT,
  location TEXT NOT NULL DEFAULT '',
  details TEXT NOT NULL DEFAULT '',
  contact_to_join INTEGER NOT NULL DEFAULT 0, -- shows a "Reach out to join" link
  published INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS announcements (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',         -- plain text, a sentence or two
  link_url TEXT,
  link_label TEXT,
  show_from TEXT,                        -- optional YYYY-MM-DD; hidden before this date
  show_until TEXT,                       -- optional YYYY-MM-DD; hidden after this date
  published INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS verse_days (
  date TEXT PRIMARY KEY,                 -- Winnipeg date
  slug TEXT NOT NULL,                    -- the devotional whose verse was the verse of the day
  kind TEXT NOT NULL                     -- 'featured' (a new devotional, the day after it was added) or 'random'
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,        -- PBKDF2-SHA256, hex
  salt TEXT NOT NULL,                 -- hex
  is_owner INTEGER NOT NULL DEFAULT 0,  -- can add and remove editors
  care_team INTEGER NOT NULL DEFAULT 0, -- can read prayer and pastoral care requests
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,                 -- 'visit' or 'prayer'
  data TEXT NOT NULL,                 -- JSON of the form fields
  handled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS submissions_kind ON submissions(kind, created_at);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  window_start TEXT NOT NULL
);
