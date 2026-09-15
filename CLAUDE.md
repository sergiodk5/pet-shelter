# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Express 5 + TypeScript REST API for an animal shelter: pets are registered and put up for
adoption, users request to adopt, and the shelter tracks those requests. Only `GET /pets`
(with filters) and `GET /pets/:id` exist today; users, auth and adoption requests are
planned. Pets are **in-memory demo data** in `src/modules/pets/pets.repositories.ts` and reset
on restart.

## Commands

```bash
npm run dev           # nodemon: rebuild + restart on save (http://localhost:8000)
npm run build         # rm -rf dist && npx tsc
npm start             # build, then node dist/server.js
npm run lint          # oxlint --type-aware --deny-warnings src
npm run lint:fix      # oxlint --type-aware --fix src
npm run format        # prettier --write .
npm run format:check  # prettier --check .
npm run typecheck     # tsc --noEmit
npm run commit        # commitizen prompt for a conventional commit message
```

There is no test runner yet. Node 24 is required (`.nvmrc`, `engines`).

## Toolchain constraints (TypeScript 7)

The project uses the **TypeScript 7 native compiler**, whose `typescript` package no longer
exposes the JS compiler API (`require("typescript")` has only `version`). Consequences:

- **No `ts-node`, no typescript-eslint.** Both depend on that API; typescript-eslint throws on
  startup under TS 7. Don't add them.
- **Dev is compile-then-run**: nodemon runs `npm run build && node dist/server.js`.
- **`build` deletes `dist/` first** on purpose: `tsc` never removes stale output, so a
  deleted or renamed source would otherwise keep being served.
- **Linting is oxlint**, with type-aware rules from `oxlint-tsgolint` (built on TS 7).
  Config is `.oxlintrc.json`.
- `package.json` is `"type": "commonjs"`, so tool configs are JSON (`.commitlintrc.json`,
  `.oxlintrc.json`, `.prettierrc.json`, `.lintstagedrc.json`) — a `.js` config using
  `export default` would fail to load.

## Commits and hooks

Commit messages must follow Conventional Commits (commitlint on `commit-msg`). The
`pre-commit` hook runs lint-staged — oxlint `--fix --deny-warnings` then Prettier on staged
files — followed by `tsc --noEmit` on the whole project. Lint **warnings** block commits,
not just errors (e.g. a leftover `debugger` or an unused variable). When a hook fails, fix
the cause rather than bypassing it with `--no-verify`.

## Architecture

`docs/architecture.md` is the authoritative reference: it records each rule and the reason
for it. Read it before adding a module or moving code. The load-bearing points:

- **`app.ts` builds the Express app without listening; `server.ts` calls `listen()`.** Tests
  can import `app` and drive it on an ephemeral port.
- **Feature modules**: each resource lives in `src/modules/<resource>/` as
  `<resource>.<role>.ts`, with the role **plural** (`pets.controllers.ts`,
  `pets.routes.ts`). Cross-cutting code lives in `src/shared/`. `app.ts` only mounts a
  module's router.
- **Dependency rule**: modules may import from `shared/`; `shared/` never imports from
  `modules/`. oxlint enforces this with `no-restricted-imports`.
- **Middleware guards, validators produce.** Pass/reject logic that hands nothing onward is
  middleware (`validateNumericId`). Parsing that returns a typed value the handler needs is
  a validator the controller calls explicitly (`parseFilters` returns
  `{ filters } | { error }`) — not middleware writing to `res.locals`, whose type would be
  an unchecked assertion.
- **Errors**: every error body is `ErrorResponse` (`{ message }`, in
  `src/shared/types/api.types.ts`). The terminal `errorHandler` honours the `http-errors`
  contract: `err.status` sets the code (so body-parser's 400/413/415 pass through), and
  `err.message` is returned only when `err.expose` is true; otherwise it's a generic
  message and only 5xx are logged. It must keep **all four parameters** — Express detects
  error handlers by arity.
- **Types stay next to what they describe**; promote to `shared/types/` only when modules in
  different layers must agree on the shape.
- **Adoption status is derived, not stored**: a pet is adopted iff it has an
  `adoptionDate` (`isAdopted` in the pets controller). There is no `adopted` field; the
  `?adopted=` query filter is computed from it.
- Validation is hand-rolled on purpose; the documented trigger for adopting Zod is adding
  create/update endpoints.

When endpoints, scripts or conventions change, update `README.md` and
`docs/architecture.md` to match.
