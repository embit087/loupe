CREATE TABLE topic_news_claims (
  cache_key TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  lease_until INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE topic_lab_items (
  viewer_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  collection_key TEXT NOT NULL,
  article_url TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  topic TEXT NOT NULL,
  published_at TEXT,
  note TEXT NOT NULL DEFAULT '',
  saved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (viewer_id, item_id)
);

CREATE TABLE topic_news_dedup_decisions (
  viewer_id TEXT NOT NULL,
  collection_key TEXT NOT NULL,
  pair_key TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('merge', 'keep')),
  reviewed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (viewer_id, collection_key, pair_key)
);
