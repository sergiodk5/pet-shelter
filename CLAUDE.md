# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Express 5 + TypeScript REST API for an animal shelter: pets are registered and put up for
adoption, users request to adopt, and the shelter tracks those requests. Full CRUD on
`/pets` exists today — `GET /pets` (with filters), `GET /pets/:id`, `POST /pets`,
`PUT /pets/:id`, `DELETE /pets/:id` — and a pet is adopted or returned by setting or
clearing `adoptionDate` through PUT. Users, auth and adoption requests are planned.
Pets are stored in **PostgreSQL via Drizzle**; `npm run db:seed` fills a development
database with demo data.

## Commands

```bash
npm run dev           # nodemon: rebuild + restart on save (http://localhost:8000)
npm run build         # rm -rf dist && npx tsc -p tsconfig.build.json
npm start             # build, then node --env-file-if-exists=.env dist/server.js
npm run lint          # oxlint --type-aware --deny-warnings src
npm run lint:fix      # oxlint --type-aware --fix src
npm run format        # prettier --write .
npm run format:check  # prettier --check .
npm run typecheck     # tsc --noEmit
npm test              # vitest run
npm run test:watch    # vitest
npm run test:cov      # vitest run --coverage
npm run commit        # commitizen prompt for a conventional commit message

docker compose up -d  # Postgres on 5432, Adminer on 8080 (local dev only)
npm run db:generate   # a change to a *.table.ts file -> migrations/
npm run db:migrate    # apply pending migrations
npm run db:check      # migration history + drift guard (CI runs this)
npm run db:seed       # truncate, then demo pets + 50 faker pets
npm run db:studio     # drizzle studio
```

The **test suite needs none of this running** — it uses pglite in process.

Run one spec file, or one test by name:
`npx vitest run src/modules/pets/pets.spec.ts -t "rejects id"`. Node 24 is required
(`.nvmrc`, `engines`).

## Toolchain constraints (TypeScript 7)

The project uses the **TypeScript 7 native compiler**, whose `typescript` package no longer
exposes the JS compiler API (`require("typescript")` has only `version`). Consequences:

- **No `ts-node`, no typescript-eslint.** Both depend on that API; typescript-eslint throws on
  startup under TS 7. Don't add them.
- **Dev is compile-then-run**: nodemon runs `npm run build && node --env-file-if-exists=.env dist/server.js`.
- **`build` deletes `dist/` first** on purpose: `tsc` never removes stale output, so a
  deleted or renamed source would otherwise keep being served.
- **Two tsconfigs**: `tsconfig.json` includes `*.spec.ts`, so `tsc --noEmit` (and the
  pre-commit hook) type-checks tests; `build` uses `tsconfig.build.json`, which excludes
  them from `dist/`. `tsconfig.json` sets `include: ["src"]` so root-level tool configs
  like `vitest.config.ts` stay out of the program (they'd violate `rootDir: src`).
- **Linting is oxlint**, with type-aware rules from `oxlint-tsgolint` (built on TS 7).
  Config is `.oxlintrc.json`.
- `package.json` is `"type": "commonjs"`, so tool configs are JSON (`.commitlintrc.json`,
  `.oxlintrc.json`, `.prettierrc.json`, `.lintstagedrc.json`) — a `.js` config using
  `export default` would fail to load.

## Commits and hooks

Commit messages must follow Conventional Commits (commitlint on `commit-msg`). The
`pre-commit` hook runs lint-staged — oxlint `--fix --deny-warnings` then Prettier on staged
files — followed by `tsc --noEmit` on the whole project. Lint **warnings** block commits,
not just errors (e.g. a leftover `debugger` or an unused variable). The `pre-push` hook runs
`npm test`, so a failing test blocks the push rather than the commit. When a hook fails, fix
the cause rather than bypassing it with `--no-verify`.

## CI

`.github/workflows/ci.yml` runs on pushes to `master` and on pull requests: `npm ci`, then
`format:check`, `lint`, `typecheck`, `db:check`, `test` and `build`, on the Node version in
`.nvmrc`. It sets `HUSKY=0` so `npm ci` doesn't install git hooks on the runner. CI runs the
same npm scripts as local development, so a change that passes them locally should pass CI.

**There is no Postgres service container**, and there doesn't need to be: the suite runs
Postgres in-process via pglite and `createTestDb` applies the migrations itself, per spec
file. `npm run db:check` is the guard over `migrations/` — `drizzle-kit check` for a journal
two branches have both written to, then `drizzle-kit generate` plus a clean-tree assertion
for a table definition edited without generating its migration. Neither command opens a
connection, so no `DATABASE_URL` either. Run it locally before pushing a schema change.

## Architecture

`docs/architecture.md` is the authoritative reference: it records each rule and the reason
for it. Read it before adding a module or moving code. The load-bearing points:

- **`app.ts` exports `createApp(config, db)`, which builds the app without listening;
  `server.ts` opens the database, pings it, then calls `listen()`.** Specs build their own
  app per test from `createTestApp()` — no env stubbing, no port bound, no database running.
  Wiring is explicit: `createPetRouter(createPetsControllers(createPetsRepository(db)))`.
- **`server.ts` stays wiring.** It is excluded from coverage, so logic placed there goes
  unmeasured. Graceful shutdown lives in `src/shared/shutdown.ts` for exactly that reason;
  put the next piece of real logic there too. It takes a narrow structural type for the
  server, so its spec uses a fake and binds no port. Do not add a `closeIdleConnections()`
  call — `http.Server.close` already does it via `httpServerPreClose`.
- **Configuration**: `src/config/env.ts` exports `loadConfig(env = process.env)`, which
  validates `PORT`, `NODE_ENV` and `CORS_ORIGINS` and **throws at startup** on bad input.
  `server.ts` calls it. `.env` is loaded by Node's `--env-file-if-exists` flag, not dotenv.
  `loadDatabaseUrl()` is deliberately **separate from `AppConfig`** — the app is handed a
  database, not a URL, so no spec needs one.
  Its validation is still hand-rolled. Zod has since landed for request bodies, so
  converting `loadConfig` is now a live option — but it runs once at boot, not per
  request, and it isn't causing problems. Don't convert it unprompted.
- **Feature modules**: each resource lives in `src/modules/<resource>/` as
  `<resource>.<role>.ts`, with the role **plural** (`pets.controllers.ts`,
  `pets.routes.ts`). Cross-cutting code lives in `src/shared/`. `app.ts` only mounts a
  module's router.
- **CORS is an allowlist** from `CORS_ORIGINS`; empty (the default) means no cross-origin
  browser access. The origins are passed to `cors` as an **array**, so an unlisted origin
  just gets no `Access-Control-Allow-Origin` header — a custom origin function calling
  `callback(new Error())` would turn it into a 500 instead.
- **Security headers**: `app.use(helmet())` runs before every other middleware. It also
  removes `X-Powered-By`. Note its default CSP is `script-src 'self'`, which will need an
  exception on `/docs` when Swagger UI is added.
- **Dependency rule**: modules may import from `shared/`; `shared/` never imports from
  `modules/`. oxlint enforces this with `no-restricted-imports`.
- **Middleware guards, validators produce.** Pass/reject logic that hands nothing onward is
  middleware (`validateNumericId`). Parsing that returns a typed value the handler needs is
  a validator the controller calls explicitly (`parseFilters` returns `PetFilters`,
  `parseNewPet` returns `NewPet`) — not middleware writing to `res.locals`, whose type
  would be an unchecked assertion. Both throw on bad input.
- **Errors — throw, never format.** `errorHandler` is the only code that builds a response
  body for an error; everything else throws an `HttpError` from
  `src/shared/errors/httpError.ts` (`BadRequestError` 400, `NotFoundError` 404). `expose`
  is derived from `status < 500`, never passed in, so a 5xx cannot leak its message. Add a
  subclass when a feature needs that status, not in anticipation.
- Every error body is `ErrorResponse` (`{ message }`, in
  `src/shared/types/api.types.ts`). The terminal `errorHandler` honours the `http-errors`
  contract: `err.status` sets the code (so body-parser's 400/413/415 pass through), and
  `err.message` is returned only when `err.expose` is true; otherwise it's a generic
  message and only 5xx are logged. It must keep **all four parameters** — Express detects
  error handlers by arity; dropping `_next` fails ~40 tests.
- **Types stay next to what they describe**; promote to `shared/types/` only when modules in
  different layers must agree on the shape.
- **Persistence — read `docs/architecture.md` §2.7 before touching the schema or the
  repository.** The load-bearing parts:
  - Each module owns its table (`pets.table.ts`), registered in `drizzle.config.ts` and in
    `schema` in `config/db.ts`. Migrations are generated with `npm run db:generate`,
    committed, and never hand-edited.
  - **Only the repository writes SQL.** `toPet` / `toRow` are the only code that knows the
    table is flat while `Pet` nests `medicalRecord`.
  - **`adoptionDate` is `NULL` in SQL and _absent_ on `Pet`.** `toPet` spreads the key
    conditionally; assigning it would make an available pet report as adopted.
  - **`findPets` must keep `.orderBy(petsTable.id)`.** Postgres moves an updated row to the
    end of the heap, so an unordered `SELECT` returns `2, 3, 1` after one `PUT`.
  - Constraint breaches are translated in the repository (duplicate `microchipId` → 409).
    Duck-type on the SQLSTATE `code`, which sits in `error.cause` — Drizzle wraps driver
    errors, and `instanceof` fails because pglite minifies its error class.
  - `numeric` comes back from node-postgres as a **string**; use `doublePrecision`.
  - **Demo data belongs to its module.** Each module exports a `Seeder` from
    `<name>.seed.ts` (name, tables, `run(db)` → row count); `src/seed.ts` is a list of
    them and knows nothing about any of them. `shared/seeding.ts` truncates every seeder's
    tables in one statement, then runs them in order. `pets.seed.ts` loads faker with
    `await import()` because every spec file reaches that module for `seedPets` — a static
    import would cost ~0.6s a run for something no test uses.
- **Adoption status is derived, not stored**: a pet is adopted iff it has an
  `adoptionDate` (`isAdopted` in the pets controller). There is no `adopted` field; the
  `?adopted=` query filter is computed from it.
- **Tests** are colocated `*.spec.ts` files run by vitest, and **need nothing running**:
  `createTestDb()` starts pglite (real Postgres, in process) and applies the migrations, per
  spec file. HTTP behaviour is tested with supertest against `app` (no port bound). Middleware is tested by mounting it on a
  throwaway Express app with a route that throws (see `errorHandler.spec.ts`).
  **Endpoints that write get their own spec file** (`pets.post.spec.ts`): vitest isolates
  modules per file, not per `describe`, so each file gets its own database and starts from
  the same seed data. Assert membership with `toContain`, never an exact array.
  `pets.repositories.spec.ts` is driven below HTTP because Zod shadows every CHECK
  constraint, so a non-unique database error cannot be provoked through a request.
- **Validation is Zod 4** (`pets.validators.ts`). Read `docs/architecture.md` §2.5 before
  touching a schema — the rules there are not obvious from the code:
  - Each rule's `error:` holds only the **predicate** (`"must be a non-empty string."`);
    `formatIssue` prepends the field path from `issue.path`. Don't write full sentences.
  - `z.object()` **strips** unknown keys on purpose. `id` and `adoptionDate` are declared
    as `z.never().optional()` so they're rejected instead of silently dropped.
  - **Shape order decides which error wins** (we throw on `issues[0]`), so `id` and
    `adoptionDate` are declared first. Don't reorder the shape.
  - `NewPet` stays hand-written in `pets.types.ts`; it is deliberately **not** derived with
    `z.output`. `parseNewPet`'s return type is what makes `tsc` check the schema against
    the entity.
  - `replacePetSchema` is `newPetSchema.extend(...)` overriding two keys. **Neither
    override is type-checked** — removing either compiles cleanly and silently breaks
    PUT (resets `intakeDate`, or disables adoption). Tests are the only guard.
- **Tests must not run concurrently.** `supertest` binds an ephemeral port per request, so
  two simultaneous `vitest` processes cross-talk and fail random tests with impossible
  results (a 401 from an API with no auth). Check nothing else is running the suite before
  debugging a flaky failure.

When endpoints, scripts or conventions change, update `README.md` and
`docs/architecture.md` to match.
