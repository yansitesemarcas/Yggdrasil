# Yggdrasil API Worker

This directory contains the Cloudflare Worker API.

- Wrangler config: `wrangler.jsonc`
- Entry point: `src/index.js`
- Required runtime secret: `OPENROUTER_API_KEY`
- Health check: `/health`
- Chat endpoint: `POST /api/chat`
