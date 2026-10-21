CREATE TABLE lab_frame_categories (
  viewer_id TEXT NOT NULL,
  author TEXT NOT NULL,
  asset TEXT NOT NULL,
  frame_id TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('art-technical-leads', 'seo-leads', 'art-ref-leads')),
  PRIMARY KEY (viewer_id, author, asset, frame_id, category)
);

CREATE INDEX lab_frame_categories_by_study
  ON lab_frame_categories (viewer_id, author, asset);
