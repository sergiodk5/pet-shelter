# Pet Shelter API

[![CI](https://github.com/sergiodk5/pet-shelter/actions/workflows/ci.yml/badge.svg)](https://github.com/sergiodk5/pet-shelter/actions/workflows/ci.yml)

A REST API for running an animal shelter: the shelter registers the pets in its
care and puts them up for adoption, users request to adopt a pet, and the shelter
keeps track of those requests through to a decision.

Built with Express 5 and TypeScript.

---

## Domain

| Concept              | What it is                                                                                                                              |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Pet**              | An animal in the shelter's care, with its species, breed, age and medical record. A pet counts as adopted once it has an adoption date. |
| **User**             | A person who wants to adopt.                                                                                                            |
| **Adoption request** | A user's request to adopt a specific pet, tracked from submission to decision.                                                          |

### Status

| Feature                  | State        |
| ------------------------ | ------------ |
| List pets, with filters  | ✅ Available |
| Get a pet by id          | ✅ Available |
| Register a pet           | ✅ Available |
| Update / remove a pet    | ✅ Available |
| Adopt / return a pet     | ✅ Available |
| Users and authentication | 🔜 Planned   |
| Adoption requests        | 🔜 Planned   |

Pets are stored in **PostgreSQL**. The pets you get from a fresh checkout are
demo data, put there by `npm run db:seed`; everything the API writes persists.

---

## Requirements

- **Node.js 24**. The version is pinned in `.nvmrc`, so `nvm use` picks it up. The
  project uses the TypeScript 7 native compiler and `@tsconfig/node24`.
- npm
- **Docker**, for the local Postgres in `compose.yml`. Any Postgres 18 will do if
  you would rather point `DATABASE_URL` somewhere else. The **test suite needs
  neither** — see [Tests](#tests).

## Getting started

```bash
npm install            # also installs the git hooks (via the "prepare" script)
cp .env.example .env   # DATABASE_URL already matches compose.yml
docker compose up -d   # Postgres on 5432, Adminer on 8080
npm run db:migrate     # create the tables
npm run db:seed        # demo pets, so the filters have something to filter
npm run dev            # start the server; rebuilds and restarts when you save
```

The API listens on **http://localhost:8000**. A bad `DATABASE_URL` stops the server
at startup rather than failing on the first request, and `Ctrl-C` lets in-flight
requests finish before closing the pool.

Adminer is at **http://localhost:8080** — system `PostgreSQL`, server `postgres`,
user and password `postgres`, database `pet_shelter`.

### Configuration

`DATABASE_URL` is required; everything else is optional and the defaults below are what you
get without it. Copy `.env.example` to `.env` (gitignored) to override them. Invalid values
stop the server at startup rather than failing later.

| Variable       | Default       | Meaning                                                                                                                                                         |
| -------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL` | _(required)_  | Postgres connection string. The one in `.env.example` matches `compose.yml`.                                                                                    |
| `PORT`         | `8000`        | Port the API listens on                                                                                                                                         |
| `NODE_ENV`     | `development` | `development` or `production`                                                                                                                                   |
| `CORS_ORIGINS` | _(empty)_     | Comma-separated browser origins allowed to call the API. Empty blocks all cross-origin browser requests; curl, server-to-server calls and tests are unaffected. |

### Scripts

| Command                | What it does                                               |
| ---------------------- | ---------------------------------------------------------- |
| `npm run dev`          | Watch `src/`, rebuild and restart on change (nodemon)      |
| `npm run build`        | Clean `dist/` and compile with `tsc` (specs excluded)      |
| `npm start`            | Build, then run `dist/server.js` (loads `.env` if present) |
| `npm run lint`         | Lint `src/` with oxlint, including type-aware rules        |
| `npm run lint:fix`     | Lint and apply automatic fixes                             |
| `npm run format`       | Format the repo with Prettier                              |
| `npm run format:check` | Check formatting without changing files                    |
| `npm run typecheck`    | Type-check with `tsc --noEmit`                             |
| `npm test`             | Run the test suite once (vitest)                           |
| `npm run test:watch`   | Run tests in watch mode                                    |
| `npm run test:cov`     | Run tests with a coverage report                           |
| `npm run commit`       | Write a commit message with the guided prompt (commitizen) |

Database commands:

| Command               | What it does                                                               |
| --------------------- | -------------------------------------------------------------------------- |
| `npm run db:generate` | Turn a change to a `*.table.ts` file into a migration in `migrations/`     |
| `npm run db:migrate`  | Apply pending migrations                                                   |
| `npm run db:check`    | Fail if a table was edited without generating its migration (CI runs this) |
| `npm run db:seed`     | Empty the tables, then insert the demo pets and 50 generated ones          |
| `npm run db:studio`   | Open Drizzle Studio                                                        |
| `npm run db:push`     | Push the schema straight to the database, skipping migrations              |

`db:seed` **empties every table it touches** and refuses to run when `NODE_ENV` is
`production`. It is deterministic: the same 53 pets come out every time.

### Tests

**The suite needs nothing running** — no Docker, no `DATABASE_URL`. Each spec file gets
its own Postgres in process through [pglite](https://pglite.dev), a WASM build of the real
thing, with the same migrations applied.

```bash
npm test
npx vitest run src/modules/pets/pets.spec.ts                   # one file
npx vitest run src/modules/pets/pets.spec.ts -t "rejects id"   # one test by name
```

Run it **one process at a time**: `supertest` binds an ephemeral port per request, so two
concurrent runs cross-talk and fail random tests for no real reason. How the suite is
organised is in [`docs/architecture.md`](docs/architecture.md) §7.

---

## API

| Endpoint           | Does                                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------------------- |
| `GET /pets`        | List pets. Filters: `species`, `adopted`, `minAge`, `maxAge`                                         |
| `GET /pets/:id`    | Fetch one pet                                                                                        |
| `POST /pets`       | Register a pet                                                                                       |
| `PUT /pets/:id`    | Replace a pet — this is also how a pet is adopted or returned, by setting or clearing `adoptionDate` |
| `DELETE /pets/:id` | Remove a pet permanently                                                                             |

```bash
curl "http://localhost:8000/pets?species=cat&adopted=true"
```

Every error response is `{ "message": "..." }`. Full request and response shapes,
field rules and status codes: **[`docs/api.md`](docs/api.md)**.

---

## Project structure

```
src/
├─ modules/            # one folder per business area
│  └─ pets/            # routes, controllers, validators, middleware,
│                      # repositories, the Drizzle table, its seed data, types
├─ shared/             # cross-cutting code: error handling, shared types,
│                      # shutdown, the seeding runner
├─ config/             # validated env vars, and the database connection
├─ app.ts              # createApp(config, db): builds the app, never listens
├─ seed.ts             # npm run db:seed — a list of module seeders, nothing else
└─ server.ts           # checks the database, starts the server, handles signals

migrations/            # generated SQL, committed
compose.yml            # Postgres + Adminer for local development
```

Each module owns its own demo data: `pets.seed.ts` exports a `petsSeeder`, and
`src/seed.ts` is a list of those. Adding a module adds one line there and nothing
else.

## Documentation

| Doc                                                            | What is in it                                                       |
| -------------------------------------------------------------- | ------------------------------------------------------------------- |
| [`docs/api.md`](docs/api.md)                                   | Every endpoint: fields, rules, status codes, examples               |
| [`docs/architecture.md`](docs/architecture.md)                 | How the code is organised and **why** — read before adding a module |
| [`docs/production-readiness.md`](docs/production-readiness.md) | What has to be true before real users, and what triggers each piece |

---

## Contributing

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) —
`npm run commit` gives you a guided prompt. Git hooks lint, format and type-check every
commit and run the tests before every push, so there is nothing to remember.

Conventions and the reasoning behind them live in
[`docs/architecture.md`](docs/architecture.md).

---

## License

ISC
