# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

Express 5 + TypeScript REST API for an animal shelter. Full CRUD on `/pets` today; users,
auth and adoption requests are planned. Pets are stored in PostgreSQL via Drizzle.
[`README.md`](README.md) covers setup and the commands; [`docs/api.md`](docs/api.md) is the
endpoint reference.

## Read before you write

`docs/architecture.md` is authoritative — it records each rule **and the reason for it**,
and most of those reasons are not recoverable from the code.

| Before you…                          | Read                             |
| ------------------------------------ | -------------------------------- |
| add a module, or move code           | §1, §2.1–2.3, §6 (the checklist) |
| touch a Zod schema                   | §2.5                             |
| touch the schema, a table or a query | §2.7                             |
| add or exclude a test                | §7                               |
| add error handling                   | §2.4                             |

When endpoints, scripts or conventions change, update `README.md`, `docs/api.md` and
`docs/architecture.md` to match.

## Toolchain constraints (TypeScript 7)

The `typescript` package no longer exposes the JS compiler API (`require("typescript")` has
only `version`). This is not discoverable by reading the code, and it rules things out:

- **No `ts-node`, no typescript-eslint.** Both are built on that API; typescript-eslint
  throws on startup. Don't add them, and don't propose them as a fix for anything.
- **Compile-then-run is the only path**, for dev (`nodemon`), `npm start` and `db:seed`.
- **`build` deletes `dist/` first** on purpose — `tsc` never removes stale output, so a
  renamed source would otherwise keep being served.
- **Two tsconfigs.** `tsconfig.json` includes specs so `tsc --noEmit` type-checks them;
  `tsconfig.build.json` excludes specs and `*.fixtures.ts` from `dist/`. `include: ["src"]`
  keeps root-level tool configs out of the program (they'd violate `rootDir`).
- **Linting is oxlint** (`.oxlintrc.json`), type-aware via `oxlint-tsgolint`.
- `package.json` is `"type": "commonjs"`, so tool configs are JSON — a `.js` config using
  `export default` fails to load. Decorators _are_ supported by TS 7; they are simply not
  wanted here, so don't claim the toolchain blocks them.

## Comments

**The code explains itself; a comment means the code failed to.** Reach for a better name
or a smaller function first — refactoring is the fix, a comment is the fallback.

Write one only when the reason cannot live in the code at all: a non-obvious constraint
where getting it wrong breaks something silently. Then keep it to a line. Anything longer,
or anything explaining a _decision_, belongs in `docs/architecture.md`, which exists to hold
rules and their reasons — a comment repeating what that file already says is duplication
that will drift.

Never write a comment that restates the line below it.

## Things that look like improvements and are not

Each of these has broken something before, or is protected only by a test.

- **Don't reorder the Zod shape.** We throw on `issues[0]`, so declaration order decides
  which message a client sees. `id` and `adoptionDate` are declared first deliberately.
- **Don't derive `NewPet` from the schema.** It stays hand-written; `parseNewPet`'s return
  type is what makes `tsc` check the schema against the entity.
- **Don't drop `errorHandler`'s 4th parameter.** Express detects error handlers by arity;
  removing `_next` silently turns it into ordinary middleware and fails ~40 tests.
- **Don't remove `.orderBy(petsTable.id)` from `findPets`.** Postgres moves an updated row
  to the end of the heap, so an unordered `SELECT` returns `2, 3, 1` after one `PUT`.
- **Don't add `closeIdleConnections()` to the shutdown.** `http.Server.close` already does
  it; measured at 0.03s either way.
- **Don't convert `loadConfig` to Zod unprompted.** Its validation is hand-rolled and Zod
  has since landed, so it is a live option — but it runs once at boot, not per request, and
  it isn't causing problems.
- **Don't hand `supertest` an app that isn't listening.** It binds a fresh ephemeral port
  per request and closes it after — 176 binds a run, and 3 failures in 40 runs. Specs take
  a listening server from `createTestApp().serverWith()`, which **awaits the `listening`
  event**; drop that await and supertest decides the server is its own and closes it,
  hanging every later request in the file.
- **Don't set Vitest's `isolate: false`**, even though its report suggests it for speed.
  `src/test.setup.ts` swaps `config/database` for pglite once per spec file; shared, every
  file sees every other file's rows.
- **Don't turn controller handlers into methods.** They are arrow fields because the router
  passes them to Express unbound; a method loses `this` and fails every request.
- **Don't run two test processes at once.** Concurrent runs cross-talk and fail random
  tests with impossible results (a 401 from an API with no auth). Rule that out before
  debugging a flaky failure.
- **Don't `git checkout` a file to revert an experiment** unless it is committed — it
  reverts to HEAD and takes uncommitted work with it.

## What gets tested

Packages don't (Express, Drizzle, Zod, `pg`, faker) — but **our configuration of them
does**: CHECK constraints, Zod schemas and the CORS allowlist are project decisions.
Dev-only commands and their demo data (`server.ts`, `seed.ts`, `**/*.seed.ts`) are excluded
from coverage. The question is _if this breaks, is it loud, and who does it reach?_
`docs/architecture.md` §7 has the full rule; read it before excluding anything else.

**Mutation-test anything load-bearing**: break the source deliberately, confirm the right
tests go red, revert. 100% covered is not the same as tested — the project has two recorded
cases of a mutation surviving a green suite on a fully covered line.

## Hooks

`pre-commit` runs lint-staged then `tsc --noEmit`; `commit-msg` runs commitlint
(Conventional Commits); `pre-push` runs the tests. Lint **warnings** block a commit, not
just errors. When a hook fails, fix the cause — never `--no-verify`.

Commit and push only when asked.
