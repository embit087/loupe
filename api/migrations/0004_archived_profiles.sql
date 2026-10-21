CREATE TABLE archived_profiles (
  viewer_id TEXT NOT NULL,
  author TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (viewer_id, author)
);

CREATE INDEX archived_profiles_by_viewer ON archived_profiles (viewer_id, updated_at DESC);
