# Roomwave

Live polls, word clouds, rating scales, timed quizzes and audience Q&A. A presenter puts a question on the big screen; everyone in the room answers on their phone, with no app and no account, and the results move as the answers arrive.

Production: https://roomwave.jeffgicharu.com

## How it fits together

```
apps/site      Astro: the marketing site and help centre, built to static HTML
apps/app       SvelteKit (Svelte 5): dashboard, editor, presenter screen, phone remote,
               audience page and staff console, built as a single-page app
apps/server    Node 24: Fastify API and Socket.IO live server (web.ts),
               BullMQ worker for reports, email and clean-up (worker.ts)
packages/shared  types, Zod schemas and rules used by the browser, the phone and the server
packages/ui      Svelte components (the slide renderer, charts, word cloud) and design tokens,
                 shared by the site and the app
```

- **nginx** serves both static builds and passes `/api/` and `/socket.io/` to the Node server on 127.0.0.1.
- **PostgreSQL 16** holds accounts, presentations, sessions and every answer (Kysely, migrations in `apps/server/src/db/migrations`).
- **Redis** carries live state between processes: the Socket.IO adapter, who is online, rate limits and the job queue. Every key and channel is prefixed `roomwave:`.

### Live sessions

- A session keeps its own copy of the slides, so results stay right when the presentation changes later.
- Results are counted from PostgreSQL and broadcast at most every 120 ms per slide, however fast votes arrive.
- Quiz timing runs on the server clock. A correct answer scores 500 to 1,000 points depending on speed.
- Phones reconnect by themselves, with backoff and jitter, and fall back to long-polling where WebSockets are blocked. A reconnecting phone is the same participant.
- During a release the old and new servers run side by side; the Redis adapter keeps their rooms in sync. Each connection is closed after at most an hour so phones always end up on the current release.

## Developing

Requirements: Node 24, pnpm 10, PostgreSQL and Redis.

```sh
pnpm install
cp apps/server/.env.example apps/server/.env   # then fill in APP_SECRET
pnpm migrate && pnpm seed
pnpm dev:server   # API and live server on :8300
pnpm dev:worker   # background jobs
pnpm dev:app      # the app on :5173, proxying /api and /socket.io
pnpm dev:site     # the marketing site on :4321
```

Checks:

```sh
pnpm typecheck
pnpm lint
pnpm test         # unit tests, and live-session tests against a real PostgreSQL and Redis
```

A room full of phones can be simulated from another machine with `apps/server/src/tools/load-test.ts` (usage at the top of the file). It joins phones at a set rate, answers every slide, and reports how long answers take to reach the presenter's screen.

## Releasing

Every push to `main` runs the tests, builds, and deploys (`.github/workflows/deploy.yml`):

1. `scripts/assemble-release.mjs` puts the static files and the bundled server with its production packages into one folder.
2. The release is uploaded with a key that can only write into the releases folder.
3. `deploy/activate.sh`, the only command the second key may run, migrates the database and starts the release on the idle port beside the live one. There it must pass `check-release`: sign in, start a session, join from a WebSocket phone and a long-polling phone, vote, and see both votes counted on the presenter's screen.
4. Only then is nginx pointed at it. The pages and a live connection are checked again through nginx, and if anything fails, visitors are put back on the previous release.

Server setup is in `deploy/provision.sh`, the systemd units in `deploy/`, and the nginx site in `deploy/nginx.conf`.
