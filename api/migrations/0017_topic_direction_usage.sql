ALTER TABLE topic_direction_suggestions ADD COLUMN status TEXT NOT NULL DEFAULT 'unmetered';
ALTER TABLE topic_direction_suggestions ADD COLUMN model TEXT NOT NULL DEFAULT 'gpt-5.4-mini';
ALTER TABLE topic_direction_suggestions ADD COLUMN input_tokens INTEGER;
ALTER TABLE topic_direction_suggestions ADD COLUMN output_tokens INTEGER;
