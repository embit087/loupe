CREATE TABLE lab_frame_categories_next (
  viewer_id TEXT NOT NULL,
  author TEXT NOT NULL,
  asset TEXT NOT NULL,
  frame_id TEXT NOT NULL,
  category TEXT NOT NULL,
  PRIMARY KEY (viewer_id, author, asset, frame_id, category)
);

INSERT INTO lab_frame_categories_next (viewer_id, author, asset, frame_id, category)
SELECT viewer_id, author, asset, frame_id, category FROM lab_frame_categories;

DROP TABLE lab_frame_categories;
ALTER TABLE lab_frame_categories_next RENAME TO lab_frame_categories;

CREATE INDEX lab_frame_categories_by_study
  ON lab_frame_categories (viewer_id, author, asset);

CREATE TABLE lab_custom_frame_labels (
  viewer_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (viewer_id, name COLLATE NOCASE)
);
