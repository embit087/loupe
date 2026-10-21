CREATE TABLE topic_news_state (
  viewer_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  article_json TEXT NOT NULL,
  reaction INTEGER NOT NULL DEFAULT 0 CHECK (reaction IN (-1, 0, 1)),
  collected INTEGER NOT NULL DEFAULT 0 CHECK (collected IN (0, 1)),
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (viewer_id, item_id)
);

CREATE INDEX topic_news_state_collected ON topic_news_state (viewer_id, collected, updated_at);

CREATE TABLE topic_news_directions (
  viewer_id TEXT NOT NULL,
  id TEXT NOT NULL,
  label TEXT NOT NULL,
  query TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (viewer_id, id)
);
