CREATE TABLE topic_direction_suggestions (
  id TEXT PRIMARY KEY,
  viewer_id TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL
);

CREATE INDEX topic_direction_suggestions_viewer_time
  ON topic_direction_suggestions (viewer_id, created_at_ms);
