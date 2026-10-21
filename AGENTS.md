# Loupe

Monorepo of three projects — see `README.md`. Each project has its own `AGENTS.md`.

- `web/` Next.js frontend (read `web/AGENTS.md` before touching Next APIs).
- `api/` Cloudflare Worker + D1/KV/R2. Use prepared D1 statements; schema changes go in a new numbered migration.
- `media/` R2 media Worker.
- Never commit `.env.local` or `.dev.vars`; keys come from the environment only.
- Do not deploy without an explicit request.
