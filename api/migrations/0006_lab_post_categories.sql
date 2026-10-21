CREATE TABLE lab_post_categories (
  viewer_id TEXT NOT NULL,
  author TEXT NOT NULL,
  asset TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('art-technical-leads', 'seo-leads', 'art-ref-leads')),
  PRIMARY KEY (viewer_id, author, asset, category),
  FOREIGN KEY (viewer_id, author, asset) REFERENCES lab_posts (viewer_id, author, asset) ON DELETE CASCADE
);

CREATE INDEX lab_post_categories_by_viewer_category ON lab_post_categories (viewer_id, category);
