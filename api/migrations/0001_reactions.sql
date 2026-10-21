CREATE TABLE reactions (
  author TEXT NOT NULL,
  asset TEXT NOT NULL,
  viewer_id TEXT NOT NULL,
  reaction INTEGER NOT NULL CHECK (reaction IN (-1, 1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (author, asset, viewer_id)
);

CREATE INDEX reactions_by_post ON reactions (author, asset, reaction);
