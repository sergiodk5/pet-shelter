# Architecture

How this API is organised, and why. Written to be the reference we build against —
so decisions get made once, here, rather than re-argued per feature.

The shape borrows NestJS's **feature module** idea (group by business capability,
not by technical role) without adopting NestJS itself. Where NestJS and our existing
scaffold disagree, the scaffold wins unless there's a concrete reason otherwise.

---

## 1. Target structure

```
src/
├─ modules/                       # business components — one folder per resource
│  ├─ pets/
│  │  ├─ pets.routes.ts           # path → middleware → controller
│  │  ├─ pets.controllers.ts      # HTTP in, HTTP out. No business rules.
│  │  ├─ pets.services.ts         # business logic (added when logic outgrows the controller)
│  │  ├─ pets.repositories.ts     # data access (added when a real DB lands)
│  │  ├─ pets.validators.ts       # parse + validate input, return typed values
│  │  ├─ pets.middleware.ts       # guards specific to this module
│  │  └─ pets.types.ts            # types owned by this module
│  ├─ shelters/
│  └─ auth/
├─ shared/                        # cross-cutting. Never business logic.
│  ├─ middleware/
│  │  ├─ requireAuth.ts
│  │  ├─ requireRole.ts
│  │  ├─ errorHandler.ts
│  │  └─ notFound.ts
│  ├─ types/
│  │  └─ api.types.ts             # ErrorResponse and friends
│  └─ lib/
│     ├─ logger.ts
│     └─ tokens.ts
├─ config/
│  ├─ env.ts                      # validated env vars, fail fast at boot
│  └─ db.ts
├─ app.ts                         # wiring only: cors, json, routes, error handler
└─ server.ts                      # listen()
```

Not every module needs every file. Start with `routes` + `controllers`, and add
`services` / `repositories` at the moment the controller stops being obvious —
not before.

---

## 2. Rules

These are the load-bearing ones. Everything else is taste.

### 2.1 The dependency rule

> Any module may import from `shared/`. `shared/` never imports from a module.

This single rule is what keeps the tree from tangling. It's also _why_
`requireAuth` can't live in `modules/auth/` — `pets` would end up depending on the
auth feature.

Lint enforces it: `.oxlintrc.json` fails any file under `src/shared/` that imports
from `modules/`.

### 2.2 Middleware guards, validators produce

| Job                                        | Shape                       | Home              |
| ------------------------------------------ | --------------------------- | ----------------- |
| Pass or reject, produces nothing           | `(req, res, next)`          | `*.middleware.ts` |
| Returns a typed value the handler consumes | `(input) => value \| error` | `*.validators.ts` |

`validateNumericId` is a guard: the controller never learns it ran, and doesn't
need to. `parseFilters` is a producer: it returns `PetFilters` the controller must
use.

Middleware has no type-safe way to hand a value onward — only `res.locals`, whose
type is an **assertion that the middleware ran**, not a proof. TypeScript will
happily let you read `res.locals.filters` on a route where the middleware was never
mounted. A validator that the controller _calls_ can't fail that way, because you
can see the value being produced.

Revisit this only when 3+ routes need the same parsed input; at that point the
duplication argument starts to outweigh the assertion risk.

### 2.3 Types live next to what they describe

Default to colocation. `Pet` lives with pets, `PetFilters` with the validator that
produces it.

Promote a type to `shared/types/` only when it passes this test:

> **Do two or more modules, in different layers, have to agree on this shape?**

`ErrorResponse` passes — `app.ts`, middleware, and every controller speak it.
`PetFilters` doesn't — one file uses it. This test is what keeps `shared/types/`
from decaying into a dumping ground.

### 2.4 Errors

One error handler, last in the chain, honouring the `http-errors` contract that
Express and body-parser already use:

```ts
const status = err.status ?? 500;
if (status >= 500) console.error(err); // 4xx are client mistakes, not faults
res.status(status).json({
  message: err.expose ? err.message : "Something went wrong.",
});
```

Why this shape:

- **`err.status`** — body-parser errors already carry the right code. Honouring it
  handles all eight of its error types (400 parse-failed, 413 too-large, 415
  unsupported-encoding, 403 verify-failed, …) with no case-specific code. The
  widely-copied `err instanceof SyntaxError` recipe handles exactly one of them.
- **`err.expose`** — the `http-errors` flag meaning "safe to show the client",
  which defaults to `false` for 5xx. Errors we throw ourselves have no flag, so
  they get the generic message and the stack stays server-side.
- **Only log 5xx** — otherwise every client typo reads as a server fault.

The error handler must have **all four parameters**. Express identifies error
handlers by arity; drop `_next` and it silently becomes ordinary middleware that
never sees an error.

Status codes in use: `400` bad input · `404` not found · `413` body too large ·
`500` unexpected.

### 2.5 Validation

Hand-rolled for now, deliberately. The threshold to adopt Zod is **create/update**:

- `Pet` is 9 top-level fields + 3 nested, with dates and a nullable string —
  roughly 70–90 lines of hand-written checks.
- `update` is _the same rules, optional_. Hand-rolled, that's either duplication or
  bespoke partial-application machinery. With a schema it's `.partial()`.
- `z.infer` derives the type _from_ the validator, so the two can't drift — which is
  exactly the failure that produced a `species.toLowerCase is not a function` crash
  when a hand-written type promised something nothing enforced.

Until then, validators return `{ value } | { error }` and the controller branches.

---

## 3. Auth

Auth is two things wearing one name, and they live in different places.

|         | What                                     | Where                              |
| ------- | ---------------------------------------- | ---------------------------------- |
| Feature | login, register, refresh, password reset | `modules/auth/`                    |
| Guard   | verify token → attach `req.user`         | `shared/middleware/requireAuth.ts` |

**Authentication and authorization stay separate.** `requireAuth` answers _who are
you_; `requireRole("admin")` answers _may you_. Merging them means re-checking
identity inside permission logic.

**Default-deny.** Mount public routes first, then `app.use(requireAuth)` before the
protected ones. A new route should be protected because someone forgot to do
anything — not exposed because someone forgot to add a guard. (This is the Express
equivalent of NestJS binding a global guard and marking exceptions `@Public()`.)

**`req.user` is an assertion.** Typing it via declaration merging tells TypeScript
the guard ran; it doesn't prove it:

```ts
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
```

Keep it optional (`user?`) so the compiler forces a check at each use. This is the
accepted trade in Express — just know the type system is trusting the route wiring,
which is the second reason for default-deny.

---

## 4. Conventions

**File naming** — `<resource>.<role>.ts`, role **plural**: `pets.controllers.ts`,
`pets.routes.ts`, `pets.validators.ts`.

> Decision: NestJS uses singular (`cats.controller.ts`). We keep plural to match the
> existing scaffold. Renaming buys nothing, and what we're taking from NestJS is the
> _module structure_, which is independent of file naming. Consistency with
> ourselves beats consistency with a framework we're not using.

**Route ownership** — a module owns its router and its paths. `app.ts` only mounts
it: `app.use("/pets", petRouter)`.

**Controllers stay thin** — HTTP in, HTTP out. Parsing belongs to validators,
business rules to services, persistence to repositories. If a controller is making
decisions, that logic wants to move down a layer.

**`app.ts` / `server.ts` split** — `app.ts` exports the configured app _without_
listening; `server.ts` calls `listen()`. That's what lets integration tests drive
the app without binding a port.

---

## 5. Current state

The migration to modules is done. This is what's on disk:

```
src/
├─ modules/
│  └─ pets/
│     ├─ pets.routes.ts
│     ├─ pets.controllers.ts
│     ├─ pets.validators.ts
│     ├─ pets.middleware.ts
│     ├─ pets.repositories.ts
│     └─ pets.types.ts
├─ shared/
│  ├─ middleware/
│  │  ├─ errorHandler.ts
│  │  └─ notFound.ts
│  └─ types/
│     └─ api.types.ts
├─ app.ts
└─ server.ts
```

`app.ts` is pure wiring — cors, json, the pets router, then the two terminal handlers
in that order. Adding a module means adding one `app.use` line.

Deliberately absent, per §1. Add each at the moment it's needed, not before:

| Not yet                                              | Add when                                      |
| ---------------------------------------------------- | --------------------------------------------- |
| `modules/pets/pets.services.ts`                      | business logic outgrows the controller        |
| `modules/auth/` + `shared/middleware/requireAuth.ts` | auth arrives (§3)                             |
| `config/env.ts`, `config/db.ts`                      | env vars need validating, or a real DB lands  |
| `*.spec.ts`                                          | the first test — `app.ts` already supports it |

The `app.ts` / `server.ts` split landed ahead of this. `app.ts` exports the configured
app _without_ listening, so a test can import it and drive it on an ephemeral port —
which is what makes adding auth safe rather than hopeful.

---

## 6. Adding a module

1. `src/modules/<name>/` — start with `<name>.routes.ts` and `<name>.controllers.ts`.
2. Types in `<name>.types.ts`. Promote to `shared/types/` only if §2.3's test passes.
3. Input handling: guard → `<name>.middleware.ts`; produces a value →
   `<name>.validators.ts`.
4. Mount in `app.ts`: `app.use("/<name>", <name>Router)`.
5. Check the route is behind `requireAuth` unless it's deliberately public (§3).
6. Errors: `next(err)` or throw — never format a 500 by hand. The shared handler
   owns status and body.
7. Add `<name>.services.ts` / `<name>.repositories.ts` when the controller stops
   being obvious. Not before.

---

## 7. Dev workflow

```
npm run dev        # nodemon: rebuild + restart on save
npm run build      # rm -rf dist && npx tsc
npm start          # build, then run
npm run lint       # oxlint --type-aware src
npm run format     # prettier --write .
npm run typecheck  # tsc --noEmit
```

`nodemon.json` watches `src/`, debounces 250ms (so a multi-file save triggers one
rebuild, not several), and runs `npm run build && node dist/server.js`.

`build` deletes `dist/` first on purpose: `tsc` never removes stale output, so
without it a renamed or deleted source leaves its compiled `.js` behind — still
imported, still served, and you end up debugging code that no longer exists in
`src/`.

`ts-node` is not an option here: TypeScript 7 is the native compiler and no longer
ships the legacy JS compiler API that ts-node is built on (`require("typescript")`
exposes only `version`). Compile-then-run is the supported path, and it keeps dev
and prod on the identical `tsc` invocation.

### Linting and formatting

**oxlint, not ESLint.** typescript-eslint throws on startup under TypeScript 7,
because it's built on the old JS compiler API. The only workaround is installing
TypeScript 6 alongside 7 under the `typescript` package name. oxlint needs no
workaround: its type-aware rules come from `oxlint-tsgolint`, which is built on the
TypeScript 7 compiler. NestJS's official starter made the same switch. Revisit this
if typescript-eslint adds TypeScript 7 support.

**Prettier** formats the repo. `.prettierrc.json` spells out Prettier's defaults, so
a future change to those defaults can't silently reformat everything.

**Pre-commit** runs lint-staged (oxlint with fixes, then Prettier, on staged files
only), then `tsc --noEmit` on the whole project. oxlint runs with `--deny-warnings`, so
a warning (a leftover `debugger`, an unused variable) blocks a commit just like an
error.
