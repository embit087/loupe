CREATE INDEX reactions_by_viewer_liked ON reactions (viewer_id, reaction, updated_at DESC);
