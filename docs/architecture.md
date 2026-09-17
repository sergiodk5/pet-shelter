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
│  ├─ errors/
│  │  └─ httpError.ts             # HttpError + one subclass per status in use
│  ├─ types/
│  │  └─ api.types.ts             # ErrorResponse and friends
│  └─ lib/
│     ├─ logger.ts
│     └─ tokens.ts
├─ config/
│  ├─ env.ts                      # validated env vars, fail fast at boot
│  └─ db.ts
├─ app.ts                         # wiring only: helmet, cors, json, routes, error handler
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

| Job                                        | Shape              | Home              |
| ------------------------------------------ | ------------------ | ----------------- |
| Pass or reject, produces nothing           | `(req, res, next)` | `*.middleware.ts` |
| Returns a typed value the handler consumes | `(input) => value` | `*.validators.ts` |

Both **throw** on bad input rather than writing a response — see §2.4.

`validateNumericId` is a guard: the controller never learns it ran, and doesn't
need to. `parseFilters` and `parseNewPet` are producers: they return `PetFilters`
and `NewPet`, which the controller must use. A producer's return type is
unconditional — there is no error branch to forget, because failure leaves via
`throw`.

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

`PetFilters` fails — one file uses it. This test is what keeps `shared/types/` from
decaying into a dumping ground.

`ErrorResponse` is the honest edge case. Since §2.4's refactor it has exactly one
importer, `errorHandler.ts`, so the letter of the test no longer passes. It stays in
`shared/types/` anyway: it's the API's public contract — the shape of _every_ error
this service can return — and the fact that one function now constructs them all is
the property §2.4 was after, not evidence that the type is local to it. Promote for
shared meaning, not for import count; the count is a proxy, and this is the case
where the proxy misleads.

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
- **`err.expose`** — the `http-errors` flag meaning "safe to show the client".
  Our own `HttpError` sets it too (below); a plain `Error` from anywhere else has
  no flag, so it gets the generic message and the stack stays server-side.
- **Only log 5xx** — otherwise every client typo reads as a server fault.

The error handler must have **all four parameters**. Express identifies error
handlers by arity; drop `_next` and it silently becomes ordinary middleware that
never sees an error. This isn't just a warning any more — deleting `_next` fails
40 of the 89 tests, because every 4xx in the app now travels through this function.

#### Nothing else writes an error body

> **Throw an `HttpError`. Never format an error response.**

One rule, no judgement calls. `errorHandler` is the **only** place that constructs
an `ErrorResponse`, and `api.types.ts` aside, the only file that imports the type.

`shared/errors/httpError.ts` carries the contract:

```ts
export class HttpError extends Error {
  readonly status: number;
  readonly expose: boolean;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.expose = status < 500; // derived, never a constructor argument
  }
}
```

`expose` is **derived**, so a 5xx cannot be made to leak its message by a careless
caller. Subclasses exist only for statuses actually in use — `BadRequestError`
(400) and `NotFoundError` (404). Add one when a feature needs it, not in
anticipation.

**Why throw rather than `res.status().json()`:** a response object is only
available to an Express handler. A service — the layer that arrives with adoption
requests (§5) — has no `res`, so "this pet doesn't exist" has to be expressible as
a throw regardless. Keeping one mechanism means the rule doesn't change when the
decision moves down a layer.

**Why `throw` rather than `next(err)`:** they're equivalent in Express 5, which
catches synchronous throws from handlers and middleware, and rejected promises from
async ones. Picking one removes the judgement call. `next(err)` remains necessary
for an error raised in a **callback** — a stream `'error'` event, say — where there
is no call stack to throw into.

Status codes in use: `200` ok · `201` created · `400` bad input · `404` not found ·
`413` body too large · `500` unexpected.

### 2.5 Validation — Zod

**Zod 4.** Both validators in `pets.validators.ts` are schemas; `parseNewPet` and
`parseFilters` are thin wrappers that `safeParse` and throw `BadRequestError` on the
first issue.

`POST /pets` shipped **hand-rolled first**, on purpose, so the cost of not having a
schema library was concrete before we paid for one. The conversion then deleted 147
lines and added 95 — net −52 — and removed six helpers (`isRecord`,
`requireNonEmptyString`, `requireNonNegativeInteger`, `requirePositiveNumber`,
`parseIntakeDate`, `parseMedicalRecord`) that a schema gives away for free. Worth the
detour: the hand-rolled version is what made the rules below obvious.

#### Messages are ours, not Zod's

**Every error message survived the conversion byte-for-byte**, and 88 of 89 tests
passed unedited through it. That was the point — a rewrite that changes both the code
and the tests proves nothing (same discipline as §2.4's refactor).

The mechanism matters. Don't write full sentences in `error:`, because one message
carries a computed index:

```
medicalRecord.vaccinations[1] must be a non-empty string.
```

Zod puts that index in the issue's **`path`**, not its message. So each rule's
`error` holds only the **predicate half** (`"must be a non-empty string."`), and
`formatIssue` renders the path and prepends it — numbers become `[1]`, strings become
`.name`. An empty path means the failure is at the root, and its message is used
as-is. Adding a field costs a predicate; the path comes free, and the style can't
drift.

#### Unknown keys are stripped; server-owned keys are rejected

`z.object()` strips by default, and that's deliberate — it matches NestJS's
`whitelist: true` and ~96% of n8n's 308 DTOs, and it lets a client GET a pet, edit it
and POST it back without a 400.

`id` and `adoptionDate` are the exception: a client sending those is trying to set
something it doesn't own, and silently dropping them would leave it believing its pet
has id `99` when it has id `4`. They're **declared** in the shape as
`z.never().optional()` — present fails, absent passes. Declaring them is what makes
them checked at all; an undeclared key would be stripped before anything could object.

> **Declaration order is load-bearing.** Zod collects every issue and we take
> `issues[0]`, so shape order decides which message wins. `id` and `adoptionDate` are
> declared **first** so they beat an unrelated field error. A test covers this (it's
> the one test that deliberately breaks two things at once) — reordering the shape
> alphabetically would otherwise pass 93 of 94 tests.

**First failure wins** — one message per request, not a list. Not a limitation of
hand-rolling, as this section used to claim: n8n returns `error.errors[0]` with Zod's
full array available. It's a choice, and it's the common one.

#### The entity is the source of truth, not the schema

`NewPet` stays `Omit<Pet, "id" | "adoptionDate">`, hand-written in `pets.types.ts`.
It is **not** derived with `z.output`, and that's deliberate:

- The check already exists. `parseNewPet` declares `: NewPet`, so `return result.data`
  makes `tsc` verify the schema's output against the entity on every build. Drop
  `photo` from the schema, or type `age` as a string, or forget the `intakeDate`
  transform, and the build fails — verified by mutation.
- Deriving would **invert the direction**. `Pet` is the storage shape; it shouldn't be
  dictated by whatever an HTTP body happens to look like. It would also force `NewPet`
  out of `pets.types.ts` (circular import) and need `Omit<…>` anyway to hide the
  `never` keys.

The older worry here — _"a hand-written type promises something nothing enforces"_ —
doesn't apply, because something does enforce it.

Still true and worth remembering: the wire shape is **not** `NewPet`. On the wire
`intakeDate` is an optional string; in `NewPet` it's a required `Date`. The schema's
`.refine().transform().default()` pipe is that conversion, and it's what `z.input` vs
`z.output` models.

#### Query params need a wrapper

Query strings aren't JSON: `?k=v` is a string, `?k=a&k=b` is an array, and `?k=` is
present-but-empty. Those are transport quirks, not domain rules, so `queryParam()`
handles them once — last value wins, blank counts as absent — and each filter states
only its own rule. `?species=` returning every pet rather than none is tested; it used
to be untested behaviour that a one-character change could invert.

### 2.6 Configuration is injected, not imported

`src/config/env.ts` reads and validates the environment **once**, at startup, and
`createApp(config)` receives the result. Nothing under `modules/` or `shared/` reads
`process.env` directly.

Two things follow. Invalid settings stop the process at boot instead of failing inside a
request, and a spec can build an app with any configuration — `createApp(loadConfig({
CORS_ORIGINS: "https://ok.example" }))` — without stubbing env vars or resetting modules.

CORS is the first user: an empty allowlist means no cross-origin browser access at all, and
the origins go to `cors` as an array so an unlisted origin gets no header rather than a 500.

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
│     ├─ pets.types.ts
│     ├─ pets.spec.ts
│     └─ pets.post.spec.ts
├─ shared/
│  ├─ middleware/
│  │  ├─ errorHandler.ts
│  │  ├─ errorHandler.spec.ts
│  │  └─ notFound.ts
│  ├─ errors/
│  │  ├─ httpError.ts
│  │  └─ httpError.spec.ts
│  └─ types/
│     └─ api.types.ts
├─ config/
│  ├─ env.ts
│  └─ env.spec.ts
├─ app.ts
├─ app.spec.ts
└─ server.ts
```

`app.ts` is pure wiring — cors, json, the pets router, then the two terminal handlers
in that order. Adding a module means adding one `app.use` line.

Deliberately absent, per §1. Add each at the moment it's needed, not before:

| Not yet                                              | Add when                                                                                       |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `modules/pets/pets.services.ts`                      | a rule spans more than one repository — first case: approving an adoption request              |
| `modules/pets/pets.fixtures.ts`                      | a second spec file needs the same test data (also add it to `tsconfig.build.json`'s `exclude`) |
| `modules/auth/` + `shared/middleware/requireAuth.ts` | auth arrives (§3)                                                                              |
| `config/db.ts`                                       | a real DB lands                                                                                |

The services row is the one most likely to be added too early. NestJS generates a
service per module because **dependency injection is how its controllers receive
collaborators at all** — the layering is a consequence of the IoC container, not an
independent rule. Express has no container, our controllers import directly, and
specs drive the real app through supertest, so the indirection would buy nothing
today: `createPet` is `addPet(parseNewPet(req.body))`, with no rule between parsing
and storing to own.

Approving an adoption request is the first thing that genuinely doesn't fit: it
reads and writes **two** repositories (pets and requests), and rejects on domain
grounds — already adopted, request not pending — that are neither HTTP nor storage
concerns. Note the filtering in `getPets` is _not_ the trigger: when a database
lands it becomes a `WHERE` clause and moves **down** into the repository, not
sideways into a service.

The `app.ts` / `server.ts` split landed ahead of this. `app.ts` exports
`createApp(config)`, which builds the app _without_ listening, so a test can build one per
case and drive it on an ephemeral port — which is what makes adding auth safe rather than
hopeful.

---

## 6. Adding a module

1. `src/modules/<name>/` — start with `<name>.routes.ts` and `<name>.controllers.ts`.
2. Types in `<name>.types.ts`. Promote to `shared/types/` only if §2.3's test passes.
3. Input handling: guard → `<name>.middleware.ts`; produces a value →
   `<name>.validators.ts`.
4. Mount in `app.ts`: `app.use("/<name>", <name>Router)`.
5. Check the route is behind `requireAuth` unless it's deliberately public (§3).
6. Errors: `throw` an `HttpError` — never format a response by hand. The shared
   handler owns status and body (§2.4).
7. Add `<name>.services.ts` / `<name>.repositories.ts` when the controller stops
   being obvious. Not before.
8. Add `<name>.spec.ts` beside the routes and drive them with supertest against
   `app`.

---

## 7. Dev workflow

```
npm run dev        # nodemon: rebuild + restart on save
npm run build      # rm -rf dist && npx tsc -p tsconfig.build.json
npm start          # build, then run
npm run lint       # oxlint --type-aware src
npm run format     # prettier --write .
npm run typecheck  # tsc --noEmit
npm test           # vitest run
npm run test:cov   # vitest run --coverage
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

### Tests

vitest + supertest. Specs sit next to the code they test as `*.spec.ts` and drive
`app` through supertest, so no port is bound. Middleware is tested by mounting it on
a throwaway Express app (see `errorHandler.spec.ts`).

`tsconfig.json` includes the specs, so `tsc --noEmit` type-checks them; `build` uses
`tsconfig.build.json`, which excludes them from `dist/`. Tests run in the **pre-push**
hook rather than pre-commit, so commits stay fast and a failing test blocks the push.

**A spec file per endpoint when the endpoint writes.** `pets.post.spec.ts` is
separate from `pets.spec.ts` because the in-memory repository is module state: a
`POST` test mutates the array that `pets.spec.ts` asserts against exactly. Vitest
gives each _file_ its own module registry, so a separate file starts from pristine
seed data no matter what another file did — while two `describe` blocks in one file
would only pass while they happened to run in the right order.

Within a write spec, assert membership (`toContain`), never an exact array: earlier
tests in the same file have already added rows.

**Everything here is an integration test** — they drive helmet, `express.json`, the
router, the validator and the repository, with nothing mocked. That's deliberate:
status codes, the `Location` header and the error envelope _are_ the contract, and
a unit test of `parseNewPet` couldn't prove `errorHandler` is wired up. The 21-row
rejection table is arguably a unit test of a pure function paying for a full request
cycle; at 89 tests in ~260ms that's not worth fixing. Split with Vitest's
`test.projects` (`workspace` was deprecated in 3.2) when the suite passes a couple
of seconds, or when a real database forces setup and teardown.

**Mutation-test anything load-bearing.** A suite that passes proves nothing until
it's been watched to fail: break the source deliberately, confirm the right tests
go red, revert. Deleting `errorHandler`'s 4th parameter, ignoring `err.status` or
hardcoding `expose = false` each fail 33–40 tests — which is both the proof the
suite works and a reminder that `errorHandler.ts` is now the highest-consequence
file in the repo.

It also finds behaviour nothing was testing. Two mutations **survived** a full green
run after the Zod conversion: treating a blank `?species=` as a value rather than as
absent (which turns an empty filter box into an empty result), and moving the
server-owned keys to the bottom of the schema (which silently changes which error
message a client sees). Both had been untested since long before the conversion.
A surviving mutation is a missing test, not a harmless one.

### CI

`.github/workflows/ci.yml` runs `npm ci`, then `format:check`, `lint`, `typecheck`, `test` and `build` on pushes to
`master` and on pull requests, using the Node version from `.nvmrc`. It sets `HUSKY=0`,
as husky recommends, so `npm ci` doesn't install git hooks on the runner. Superseded
pull-request runs are cancelled; runs on `master` always finish.
