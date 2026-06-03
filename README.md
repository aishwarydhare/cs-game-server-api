# CS2 Matchmaking / Server-Join API

A matchmaking service for a CS2-style bomb-defusal game. Players create servers
(each with an auto-provisioned lobby), list open servers, and join them. The core
engineering problem — **letting many players race to join a server without ever
exceeding its capacity, and without a queue** — is solved with a single atomic
conditional `UPDATE` inside a transaction.

Stack: TypeScript · Express · PostgreSQL · Drizzle ORM · Jest · Docker · k6.

## Architecture

Strict four-layer flow, no layer skipping:

```
routes (DTO validation)  →  controllers  →  services (business logic)  →  repos (SQL)  →  schema (Drizzle models)
```

```
src/
  app.ts / index.ts        express app factory + process bootstrap
  config/env.ts            zod-validated env (DATABASE_URL, PORT)
  db/                      schema (models), drizzle client, migrate runner, migrations/
  middleware/              auth (simulated), idempotency, validate, errorHandler
  dtos/                    zod request schemas + response DTO mappers
  routes/ controllers/ services/ repos/
  errors/AppError.ts       error taxonomy (400/401/403/404/409)
  helpers/                 fingerprint, asyncHandler, validation
```

## Endpoints

| Method | Path                | Auth   | Idempotent | Description |
|--------|---------------------|--------|------------|-------------|
| GET    | `/healthz`          | none   | no         | Liveness probe |
| POST   | `/servers`          | player | yes        | Create a server (+lobby) |
| GET    | `/servers`          | player | no         | List **open** (non-full) servers |
| GET    | `/servers/:id`      | player | no         | Server detail + lobby + member count |
| POST   | `/servers/:id/join` | player | yes        | Join a server's lobby |

### Auth (simulated)

Auth is header-based, not real. Send:

- `x-user-id: <id>` — required (missing → `401`)
- `x-user-role: player` — optional, defaults to `player`

RBAC is a `requireRole(...)` factory; all routes currently require `player`.

### Create server

Body: `{ "name": string, "requiredPlayers": number }`. `requiredPlayers` must be a
**positive even** integer (validated by the request schema). `gameType` is fixed to
`bomb_defusal`. The server and its lobby are created in one transaction.

### Join server (concurrency-safe, no queue)

Inside one transaction:

1. Insert the membership (`ON CONFLICT (server_id, user_id) DO NOTHING`) — no row
   means the user already joined → `409 ALREADY_JOINED`.
2. Atomically bump the count only while there is room and flip status to `full` on
   the last seat:
   ```sql
   UPDATE servers
   SET current_players = current_players + 1,
       status = CASE WHEN current_players + 1 >= required_players THEN 'full' ELSE status END
   WHERE id = $1 AND current_players < required_players
   RETURNING *;
   ```
   No row means the server is full → rollback → `409 SERVER_FULL`.

The conditional `WHERE` + the row lock taken by the `UPDATE` serialize concurrent
joiners, so `current_players` can never exceed `required_players`. A DB-level
`CHECK (current_players <= required_players)` constraint backstops this invariant,
and an index on `servers.status` keeps the open-server listing fast.

### Idempotency

`POST` routes require an `Idempotency-Key` header (missing → `400`). Keys are scoped
per user and persisted. A fingerprint is computed over `method + path + body`:

- First use → request runs, response is captured and stored.
- Same key + same fingerprint, completed → stored response is **replayed verbatim**
  with header `IDEMPOTENCY_REPLAYED: true`.
- Same key + different fingerprint → `409 IDEMPOTENCY_KEY_MISMATCH`.
- Same key while the original is still running → `409 IDEMPOTENCY_REQUEST_IN_PROGRESS`.

### Error responses

Errors are returned as `{ "error": { "code": string, "message": string, "details"?: unknown } }`
with the matching HTTP status.

## Running locally

Requires Docker. Postgres is mapped to host port **5433** (to avoid colliding with a
local Postgres on 5432); inside compose the API talks to `db:5432`.

```bash
cp .env.example .env
docker compose up --build        # db + api; migrations run on api start
curl localhost:3000/healthz      # {"status":"ok"}
```

Run the API directly against a local DB instead:

```bash
docker compose up -d db          # Postgres on localhost:5433
npm install
npm run db:migrate               # apply migrations
npm run dev                      # ts-node-dev with reload
```

Useful scripts: `build`, `start`, `dev`, `db:generate` (new migration from schema
changes), `db:migrate`, `lint` / `check` (Biome), `format`.

## Testing

Two Jest projects:

```bash
npm test          # unit: routes / services / middleware / helpers (mocked deps)
npm run test:repo # repo integration tests against real Postgres (needs db up)
npm run test:all  # everything
```

`test:repo` needs Postgres running (`docker compose up -d db`). A `globalSetup`
creates the test database and applies migrations.

### Concurrency-safety test

The key invariant — joins never overfill a server under parallel load — is proven by
the `CONCURRENCY SAFETY` test in `tests/repos/server.repo.test.ts`. It fires 40 joins
at an 8-seat server in parallel and asserts exactly 8 succeed, 32 get `server_full`,
and the final count is exactly 8.

```bash
docker compose up -d db
npm run test:repo -- -t "CONCURRENCY SAFETY"
```

## Load testing (k6)

A dockerized k6 scenario creates 100 servers (even capacities 8–16), storms each with
20–50 distinct joiners, and asserts no server is ever overfilled, full servers drop
out of `GET /servers`, and idempotent replays return the same body.

```bash
docker compose up -d --build api
docker compose run --rm k6 run /scripts/join-load-test.js
```

## API collection

`postman/cs2-matchmaking.postman_collection.json` — importable Postman collection
covering health, create/replay/mismatch/odd, list, get, and join flows.
```
