-- Rebuild both tables together so their foreign key relationship remains valid
-- while adding Topics studies and a snapshot of saved news sources.
ALTER TABLE lab_custom_studies RENAME TO lab_custom_studies_previous;

CREATE TABLE lab_custom_studies (
  id TEXT PRIMARY KEY,
  viewer_id TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('design', 'kol', 'topics')),
  title TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO lab_custom_studies (id, viewer_id, category, title, created_at, updated_at)
SELECT id, viewer_id, category, title, created_at, updated_at
FROM lab_custom_studies_previous;

ALTER TABLE lab_custom_study_assets RENAME TO lab_custom_study_assets_previous;

CREATE TABLE lab_custom_study_assets (
  id TEXT PRIMARY KEY,
  study_id TEXT NOT NULL,
  source_key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('post', 'caption', 'poster', 'video', 'audio', 'frame', 'transcript', 'ocr', 'note', 'image', 'file', 'article')),
  author TEXT,
  asset TEXT,
  frame_id TEXT,
  text_content TEXT,
  external_url TEXT,
  object_key TEXT,
  file_name TEXT,
  mime_type TEXT,
  byte_size INTEGER,
  topic_item_id TEXT,
  source_title TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (study_id, source_key),
  FOREIGN KEY (study_id) REFERENCES lab_custom_studies (id) ON DELETE CASCADE
);

INSERT INTO lab_custom_study_assets
  (id, study_id, source_key, kind, author, asset, frame_id, text_content,
   external_url, object_key, file_name, mime_type, byte_size, created_at)
SELECT id, study_id, source_key, kind, author, asset, frame_id, text_content,
       external_url, object_key, file_name, mime_type, byte_size, created_at
FROM lab_custom_study_assets_previous;

DROP TABLE lab_custom_study_assets_previous;
DROP TABLE lab_custom_studies_previous;

CREATE INDEX lab_custom_studies_by_viewer
  ON lab_custom_studies (viewer_id, category, updated_at DESC);

CREATE INDEX lab_custom_study_assets_by_study
  ON lab_custom_study_assets (study_id, created_at, id);
