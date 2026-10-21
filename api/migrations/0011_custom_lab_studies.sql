CREATE TABLE lab_custom_studies (
  id TEXT PRIMARY KEY,
  viewer_id TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('design', 'kol')),
  title TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX lab_custom_studies_by_viewer
  ON lab_custom_studies (viewer_id, category, updated_at DESC);

CREATE TABLE lab_custom_study_assets (
  id TEXT PRIMARY KEY,
  study_id TEXT NOT NULL,
  source_key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('post', 'caption', 'poster', 'video', 'audio', 'frame', 'transcript', 'ocr', 'note', 'image', 'file')),
  author TEXT,
  asset TEXT,
  frame_id TEXT,
  text_content TEXT,
  external_url TEXT,
  object_key TEXT,
  file_name TEXT,
  mime_type TEXT,
  byte_size INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (study_id, source_key),
  FOREIGN KEY (study_id) REFERENCES lab_custom_studies (id) ON DELETE CASCADE
);

CREATE INDEX lab_custom_study_assets_by_study
  ON lab_custom_study_assets (study_id, created_at, id);
