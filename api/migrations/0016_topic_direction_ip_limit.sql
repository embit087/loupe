ALTER TABLE topic_direction_suggestions ADD COLUMN client_ip TEXT;

CREATE INDEX topic_direction_suggestions_ip_time
  ON topic_direction_suggestions (client_ip, created_at_ms);

CREATE INDEX topic_direction_suggestions_time
  ON topic_direction_suggestions (created_at_ms);
