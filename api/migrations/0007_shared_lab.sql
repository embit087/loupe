-- Merge existing per-browser Exp Lab saves into one collection shared by clients.
INSERT OR IGNORE INTO lab_posts (viewer_id, author, asset, added_at)
SELECT '00000000-0000-4000-8000-000000000001', author, asset, MAX(added_at)
FROM lab_posts
WHERE viewer_id <> '00000000-0000-4000-8000-000000000001'
GROUP BY author, asset;

INSERT OR IGNORE INTO lab_post_categories (viewer_id, author, asset, category)
SELECT '00000000-0000-4000-8000-000000000001', author, asset, category
FROM lab_post_categories
WHERE viewer_id <> '00000000-0000-4000-8000-000000000001';
