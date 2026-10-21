CREATE TABLE lab_posts (
  viewer_id TEXT NOT NULL,
  author TEXT NOT NULL,
  asset TEXT NOT NULL,
  added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (viewer_id, author, asset)
);

CREATE INDEX lab_posts_by_viewer ON lab_posts (viewer_id, added_at DESC);
