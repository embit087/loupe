# Loupe API Worker (`api/`)

This Worker stores anonymous per-browser like/dislike annotations for the local collections archive in D1. Run local migrations before `npm run dev`. Use prepared D1 statements. Do not deploy the Next app or this Worker without an explicit deployment request. The `database_id` in `wrangler.jsonc` is a local placeholder and must be replaced with a real D1 database ID before remote deployment.
