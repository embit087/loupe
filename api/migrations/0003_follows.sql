CREATE TABLE follows (
  viewer_id TEXT NOT NULL,
  author TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (viewer_id, author)
);

CREATE INDEX follows_by_viewer ON follows (viewer_id, updated_at DESC);
