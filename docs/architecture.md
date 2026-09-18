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
│  │  ├─ pets.repositories.ts     # data access — the only file that writes SQL
│  │  ├─ pets.table.ts            # the Drizzle table, colocated with its module
│  │  ├─ pets.seed.ts             # demo rows, shared by the test fixtures and db:seed
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
│  ├─ shutdown.ts                 # the SIGTERM/SIGINT sequence, kept out of server.ts
│  └─ lib/
│     ├─ logger.ts
│     └─ tokens.ts
├─ config/
│  ├─ env.ts                      # validated env vars, fail fast at boot
│  └─ db.ts                       # the pool, the Db type, and ping()
├─ app.ts                         # wiring only: helmet, cors, json, routes, error handler
├─ seed.ts                        # npm run db:seed
└─ server.ts                      # ping, listen(), signal handlers
```

Outside `src/`: `migrations/` holds the generated SQL and is committed, and
`drizzle.config.ts` lists each module's table file.

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
need to. `parseFilters`, `parseNewPet` and `parseReplacementPet` are producers: they
return `PetFilters`, `NewPet` and `PetUpdate`, which the controller must use. A producer's return type is
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
roughly a third of the suite, because every 4xx in the app travels through this
function.

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

> **Revisit trigger: a documented public API.** Stripping is right for an internal
> endpoint, where an unknown key is junk the client does not care about. n8n splits on
> exactly this line — only ~12 of its 308 DTOs are `strict`, and those are the public
> ones, where silently ignoring a key a caller wrote is a support ticket. If this API is
> ever published with a contract, that is the moment to switch.

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

#### PUT, not PATCH

Both are idempotent for our purposes — the common claim that PATCH isn't is only true
of _operation_-style bodies (`{"op":"add","path":"/vaccinations/-"}`); a merge patch of
literal values applied twice gives the same result. So that wasn't the deciding factor.

PUT won because **adoption is clearable**. Under PUT, omitting `adoptionDate` returns
the pet to the shelter, which is a real event. Under PATCH, omission means "don't
touch it", so clearing would need `null` to mean something different from absent — a
distinction every client has to get right. PUT also makes an empty body `{}` an
ordinary missing-required-fields `400` rather than a case to design.

The cost, and it is real: a client must send the whole pet, so one hand-built body
that forgets `adoptionDate` silently un-adopts. That's the mirror of PATCH's ambiguity.
If single-field updates are ever needed, PATCH can be added against
`newPetSchema.partial()` — and `updatePet` is deliberately left unused as a name for it
(the PUT controller is `replacePet`).

#### PUT derives its schema from create

`replacePetSchema` is `newPetSchema.extend({ … })` overriding exactly two keys, so every
rule and every message is defined once and both endpoints move together. `.extend()`
returns a new schema — create is unaffected. The conversion added **no new error
messages**.

The two overrides are what PUT _means_:

- **`intakeDate` is required.** Create defaults it to now; keeping that here would
  silently reset a pet's intake date on every edit.
- **`adoptionDate` is writable**, as `dateString.nullish()` mapped to `undefined`. A
  date adopts; `null` **or** omission returns the pet to the shelter. `null` is
  accepted because a form clears a field by sending `null`, not by dropping the key —
  and `null` already means "no value" in this API (`microchipId`).

> **Neither override is type-checked.** Delete the `intakeDate` line and it falls back
> to a default — output is still `Date`, so it compiles, and every PUT quietly resets
> the intake date. Delete the `adoptionDate` line and it falls back to server-owned —
> output is `undefined`, assignable to `adoptionDate?: Date`, so it compiles, and
> adoption silently stops working. Both are verified by mutation instead: a missing
> `intakeDate` must 400, and sending an `adoptionDate` must adopt. Don't delete those
> tests.

**Known asymmetry:** PUT accepts `adoptionDate: null`, POST rejects it as server-owned.
A client sharing one form between create and edit has to drop the key when creating.
Making POST lenient is not a one-liner — accepting `null` would store
`adoptionDate: null`, and `isAdopted` tests `!== undefined`, so **every new pet would
read as adopted** unless the schema also transformed it away.

#### Query params need a wrapper

Query strings aren't JSON: `?k=v` is a string, `?k=a&k=b` is an array, and `?k=` is
present-but-empty. Those are transport quirks, not domain rules, so `queryParam()`
handles them once — last value wins, blank counts as absent — and each filter states
only its own rule. `?species=` returning every pet rather than none is tested; it used
to be untested behaviour that a one-character change could invert.

### 2.6 Configuration and the database are injected, not imported

`src/config/env.ts` reads and validates the environment **once**, at startup, and
`createApp(config, db)` receives the result. Nothing under `modules/` or `shared/` reads
`process.env` directly.

Two things follow. Invalid settings stop the process at boot instead of failing inside a
request, and a spec can build an app with any configuration — `createApp(loadConfig({
CORS_ORIGINS: "https://ok.example" }), db)` — without stubbing env vars or resetting
modules.

CORS is the first user: an empty allowlist means no cross-origin browser access at all, and
the origins go to `cors` as an array so an unlisted origin gets no header rather than a 500.

The database arrives the same way, and the chain is explicit rather than container-managed:

```
createApp(config, db)
  └─ createPetRouter(createPetsControllers(createPetsRepository(db)))
```

Three consequences worth stating, because each one was the point:

- **`DATABASE_URL` is deliberately not part of `AppConfig`.** The app is handed a
  database, not a URL, so a spec never needs one. `loadDatabaseUrl()` sits beside
  `loadConfig()` and is called only by whoever opens a connection — `server.ts`,
  `seed.ts` and `drizzle.config.ts`.
- **`Db` is a union of both drivers** (`NodePgDatabase | PgliteDatabase`), which is also
  what a Drizzle transaction handle satisfies. Transactions will therefore not need
  another refactor when adoption requests arrive.
- **Specs get a real Postgres, in process.** `createTestDb()` starts pglite, applies the
  migrations and returns the same `Database` shape — see §7.

---

### 2.7 Persistence

**Postgres through Drizzle.** No decorators, no generated client, and schemas compose with
Zod — which matters because §2.5 already owns request validation.

**The table lives in its module.** `pets.table.ts` sits beside the repository that queries
it, and `drizzle.config.ts` lists each table file by name rather than globbing, so adding a
module adds one line there. Drizzle's quickstart puts everything in `src/db/schema.ts`; that
is a quickstart, not architecture, and it fights §2.1 the moment a second module exists.

**Only the repository writes SQL.** Controllers await it and never see a row. Two private
functions own the gap between storage and the entity:

| Direction | Function | What it knows                                                    |
| --------- | -------- | ---------------------------------------------------------------- |
| row → Pet | `toPet`  | the table is flat; `Pet` nests `medicalRecord`                   |
| Pet → row | `toRow`  | the same, plus that an absent `adoptionDate` is stored as `NULL` |

That last part is easy to get wrong in both directions. SQL says `NULL`; `Pet` says the key
is **absent**. Assigning `null` when reading would make `adoptionDate !== undefined` true,
so an available pet would report as adopted and serialize as `"adoptionDate": null`.
`toPet` spreads the key conditionally for exactly that reason.

**`ORDER BY id` is not optional.** Postgres rewrites an updated row at the end of the heap,
so an unordered `SELECT` returns `2, 3, 1` after a single `PUT`. Nothing in the suite caught
it until a test was added that updates a pet and then asserts list order.

**Constraint breaches become `HttpError`s in the repository, or they become 500s.** A
duplicate `microchip_id` is a client mistake, and `errorHandler` would otherwise report our
fault. The translation is duck-typed on the SQLSTATE code rather than `instanceof`, because
Drizzle wraps driver errors in a `DrizzleQueryError` and puts the original in `cause`, and
pglite minifies its error class name. Translate the ones you can explain; rethrow the rest.

**Column types are checked against the driver, not assumed.** `numeric` round-trips
through node-postgres as a **string**, not a number, which would have made `weightKg` a
string on every read; `doublePrecision` is what the weight column actually uses. Probe a
type before adding a column.

**Validation is two layers, on purpose.** Zod rejects bad input at the edge with a readable
message; the CHECK constraints (`age >= 0`, `weight_kg > 0`) are the backstop for anything
that reaches the database another way. Zod shadows them completely for HTTP traffic, which
is why `pets.repositories.spec.ts` exists: a non-unique database error cannot be provoked
through a request, so that one case is driven against the repository directly.

**Migrations are generated, committed, and never hand-edited.** `npm run db:generate`
diffs the table files against the snapshot in `migrations/meta/`. `npm run db:check` is the
guard: it runs `drizzle-kit check` for a journal two branches have both written to, then
regenerates and asserts the tree is clean, which catches a table edited without its
migration. CI runs it.

**Demo data belongs to the module, not to the seed script.** Each module exports a
`Seeder` — a name, the tables it owns, and a `run(db)` returning the row count — and
`src/seed.ts` is a list of them and nothing else:

```ts
const seeders = [petsSeeder];
```

`shared/seeding.ts` owns the machinery: it empties every seeder's tables in **one**
`TRUNCATE … RESTART IDENTITY CASCADE`, so a foreign key between two modules does not
dictate the order they are emptied in, then runs the seeders **in the order listed**,
because a later module may reference ids an earlier one wrote.

This is the shape both references use. n8n keeps its seeder inside the module
(`modules/dynamic-credentials.ee/services/n8n-resolver-seeder.service.ts`) and has the
module's own `init()` call it; NestJS has no seeding feature at all, and the community
answer is a provider in the feature module plus a thin
`NestFactory.createApplicationContext` script. Neither puts one module's demo data in a
shared script. We have no container, so the list in `seed.ts` is our composition root —
the same role `app.ts` plays for routers.

**`pets.seed.ts` loads faker through `await import()`**, not a top-level import. Every
spec file reaches this module for `seedPets`, faker costs ~65ms to load, and no test uses
it — a static import would put ~0.6s on a 2.4s suite for nothing. Verified: importing the
compiled module leaves `@faker-js/faker` out of `require.cache`. n8n's modules defer their
optional services the same way.

**Storage is flatter than the entity, for now.** `weight_kg` and `vaccinations` are columns
on `pets` while `Pet` keeps them inside `medicalRecord`, so the wrapper is already there
when they move to a history table. `microchipId` was pulled **out** of `medicalRecord` for
the opposite reason: it identifies the animal permanently and is not a medical event, so it
would have been left behind by that move.

## 3. Auth

Auth is two things wearing one name, and they live in different places.

|         | What                                     | Where                              |
| ------- | ---------------------------------------- | ---------------------------------- |
| Feature | login, register, refresh, password reset | `modules/auth/`                    |
| Guard   | verify token → attach `req.user`         | `shared/middleware/requireAuth.ts` |

**Authentication and authorization stay separate.** `requireAuth` answers _who are
you_; `requireRole("admin")` answers _may you_. Merging them means re-checking
identity inside permission logic.

**Permissions name the action, on the route.** `requireScope("pet:create")` as
middleware in `pets.routes.ts`, not a check buried in the handler — the guard belongs
next to the route it guards, where reading the router tells you what is protected. This
is the Express shape of n8n's `@GlobalScope('tag:create')` decorator, and n8n keeps its
authentication and authorization separate the same way.

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
│     ├─ pets.table.ts
│     ├─ pets.seed.ts
│     ├─ pets.types.ts
│     ├─ pets.fixtures.ts
│     ├─ pets.spec.ts
│     ├─ pets.post.spec.ts
│     ├─ pets.put.spec.ts
│     ├─ pets.delete.spec.ts
│     └─ pets.repositories.spec.ts
├─ shared/
│  ├─ middleware/
│  │  ├─ errorHandler.ts
│  │  ├─ errorHandler.spec.ts
│  │  └─ notFound.ts
│  ├─ errors/
│  │  ├─ httpError.ts
│  │  └─ httpError.spec.ts
│  ├─ types/
│  │  └─ api.types.ts
│  ├─ shutdown.ts
│  ├─ shutdown.spec.ts
│  ├─ seeding.ts
│  └─ seeding.spec.ts
├─ config/
│  ├─ env.ts
│  ├─ env.spec.ts
│  ├─ db.ts
│  └─ db.fixtures.ts
├─ app.ts
├─ app.spec.ts
├─ app.fixtures.ts
├─ seed.ts
└─ server.ts
```

Plus `migrations/` and `drizzle.config.ts` at the root, and `compose.yml` for a local
Postgres.

`app.ts` is pure wiring — cors, json, the pets router, then the two terminal handlers
in that order. Adding a module means adding one `app.use` line.

Deliberately absent, per §1. Add each at the moment it's needed, not before:

| Not yet                                              | Add when                                                                          |
| ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| `modules/pets/pets.services.ts`                      | a rule spans more than one repository — first case: approving an adoption request |
| `modules/auth/` + `shared/middleware/requireAuth.ts` | auth arrives (§3)                                                                 |
| `shared/lib/logger.ts`                               | `console` stops being enough — see the gaps below                                 |

`config/db.ts` has since landed, and with it `pets.table.ts`, `migrations/` and
`compose.yml` (§2.7). **Pets are stored in Postgres**; nothing is held in module state any
more.

Files ending in `.fixtures.ts` are test-only and excluded from `tsconfig.build.json`, or
test data — and pglite — would compile into `dist/`. There are three: `pets.fixtures.ts`
for request bodies, `db.fixtures.ts` for the in-process database, and `app.fixtures.ts`,
which combines them into the `createTestApp()` that every HTTP spec starts from. The demo
pets themselves live in `pets.seed.ts`, which **is** built, because `src/seed.ts` imports
them; `pets.fixtures.ts` re-exports `seedPets` so the two can never drift.

### Known gaps

Recorded so they're decisions rather than discoveries:

- **405 is never returned.** `PUT /pets` and `DELETE /pets` match no route, so they
  fall through to `notFound` as a `404`. The correct answer for a path that exists
  under other methods is `405` with an `Allow` header. Worth doing when a client cares.
- **`DrizzleQueryError.message` embeds the SQL and its parameter values**, and
  `errorHandler` logs 5xx with `console.error`. Row data therefore reaches the logs on an
  unexpected database error. Harmless with demo pets and a personal machine; it needs
  redaction before anything real is stored, and it is the strongest argument for a real
  logger.
- **pglite is single-connection.** It is a genuine Postgres build, so SQL, constraints and
  types all behave, but it exercises no pooling and no concurrency. Anything that turns on
  genuine concurrent connections — the first candidate is approving an adoption request —
  needs a real Postgres in the loop before it can be trusted.
- **Logging is `console`.** Fine for one process on one machine; not structured, not
  levelled, not correlated to a request.
- ~~An intermittent test failure~~ — **fixed**, see §7. It was real: 3 failures in 40 runs
  on the old fixture, 0 in 40 after.

**Closed since this list was written.** The old entry here was read-then-write:
`updatePet` and `removePet` each did a `findIndex` and then mutated the array, which is a
lost-update race against a real database, and `findPetById` handed back the stored object
by reference. All three are gone — `updatePet` is one `UPDATE … WHERE id = ? RETURNING`,
`removePet` one `DELETE … RETURNING`, and every read builds a fresh object through `toPet`.
The prediction that the signatures (`Pet | undefined`, `boolean`) would map onto a row
count held exactly, so no caller changed.

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
`createApp(config, db)`, which builds the app _without_ listening, so a test can build one
per case and drive it on an ephemeral port — which is what makes adding auth safe rather
than hopeful. The database moving behind the same seam cost no spec any change beyond
awaiting the app.

`server.ts` stays wiring, and that is load-bearing rather than aesthetic: it is excluded
from coverage, so logic placed there goes unmeasured. It now pings the database before
`listen()` — the pool connects lazily, so a bad `DATABASE_URL` would otherwise stay quiet
until the first request and then look like a runtime fault — and installs the `SIGINT` and
`SIGTERM` handlers. The shutdown sequence itself lives in `shared/shutdown.ts` for that
reason: stop the server, let in-flight requests finish, then close the pool, because an
unclosed pool keeps the process alive. It takes a narrow structural type for the server, so
its spec drives it with a fake and binds no port.

Do **not** add a `server.closeIdleConnections()` call before `close()`. It looks necessary —
idle keep-alive sockets do hold a server open — but `http.Server.close` already calls it
through `httpServerPreClose`, read out of Node 24's own source, and a held keep-alive
connection delays shutdown by 0.03s either way.

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
8. Storing anything? `<name>.table.ts` beside the repository, add it to the `schema`
   array in `drizzle.config.ts` and to `schema` in `config/db.ts`, then
   `npm run db:generate` and commit the SQL (§2.7).
9. Demo data? Export a `Seeder` from `<name>.seed.ts` and add it to the list in
   `src/seed.ts`. Nothing about the module goes in that file.
10. Add `<name>.spec.ts` beside the routes and drive them with supertest against an app
    from `createTestApp()`.

---

## 7. Dev workflow

```
npm run dev          # nodemon: rebuild + restart on save
npm run build        # rm -rf dist && npx tsc -p tsconfig.build.json
npm start            # build, then run
npm run lint         # oxlint --type-aware src
npm run format       # prettier --write .
npm run typecheck    # tsc --noEmit
npm test             # vitest run
npm run test:cov     # vitest run --coverage

docker compose up -d # Postgres on 5432, Adminer on 8080
npm run db:generate  # table files → migrations/
npm run db:check     # history consistency, then drift (CI runs this)
npm run db:migrate   # apply migrations
npm run db:seed      # truncate, then demo pets + 50 faker pets
npm run db:studio    # drizzle studio
```

`compose.yml` is local development only — the suite needs nothing running (§7, Tests).
`npm run db:seed` refuses to run when `NODE_ENV` is `production`, because it truncates.

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

**Specs get a real Postgres, in process.** `createTestDb()` starts
[pglite](https://pglite.dev) — Postgres compiled to WASM — applies the same migrations the
real database gets, and returns the same `Database` shape. No Docker, no CI service
container, and no shared state: each spec file gets its own instance, at about 200ms each.

| Option                | Local setup         | CI                | Speed               | Fidelity                   |
| --------------------- | ------------------- | ----------------- | ------------------- | -------------------------- |
| **pglite in-process** | none                | none              | fast, no I/O        | real Postgres (WASM build) |
| Docker Compose        | `docker compose up` | service container | network round trips | identical                  |
| Testcontainers        | Docker daemon       | Docker-in-Docker  | slow start          | identical                  |

The deciding evidence was a project that shares one real Postgres across its suite and
therefore has to set `maxWorkers: 1`. pglite preserves the per-file isolation this suite
already depended on, and migrations are shared with the real database, so the two cannot
drift.

Its one real limitation is that it is single-connection, so pooling and concurrency go
untested (§5, Known gaps).

**A spec file per endpoint when the endpoint writes.** `pets.post.spec.ts` is separate
from `pets.spec.ts` because a `POST` test adds rows that `pets.spec.ts` asserts against
exactly. This was module state before and is a database now; the reasoning did not change,
because Vitest gives each _file_ its own module registry and therefore its own pglite
instance. A separate file starts from pristine seed data no matter what another file did,
while two `describe` blocks in one file would only pass while they happened to run in the
right order.

Within a write spec, assert membership (`toContain`), never an exact array: earlier
tests in the same file have already added rows.

**What is not tested, and why.** The deciding question is: _if this breaks, is the
failure loud, and who does it reach?_

| Not tested                                         | Because                                                                                                                                                                                |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Packages — Express, Drizzle, Zod, `pg`, faker      | Their behaviour is their maintainers' problem. Our **configuration** of them is not: a CHECK constraint, a Zod schema and the CORS allowlist are project decisions and are all tested. |
| `src/server.ts`, `src/seed.ts`, `src/**/*.seed.ts` | A command and its demo data. A break is loud — `npm run db:seed` fails on the spot — and reaches one developer for one minute. All three are excluded from coverage.                   |

`shared/seeding.ts` is deliberately **not** in that list, and the line is worth stating
because it is thin. It issues SQL the application never issues — one multi-table
`TRUNCATE … RESTART IDENTITY CASCADE` — and its failure mode arrives _later_, when a second
module's table references `pets` and somebody has since "simplified" it into a loop. The
data a seeder produces is content; the machinery that empties tables is a decision.

n8n draws the same line by example: `seedInstance.mjs` generates ~500 varied workflows
through the public API and has no tests, while `seedHistory.mjs` — which writes SQLite
directly, backdates timestamps by hand and leans on foreign-key cascades — has eight. The
Laravel testing skill states the general rule: _"Leave framework behavior to framework
tests. Testing project configuration is not testing the framework."_

**Almost everything here is an integration test** — they drive helmet,
`express.json`, the router, the validator, the repository and now Postgres, with nothing
mocked. That's deliberate: status codes, the `Location` header and the error envelope _are_
the contract, and a unit test of `parseNewPet` couldn't prove `errorHandler` is wired up.
The 21-row rejection table is arguably a unit test of a pure function paying for a full
request cycle.

Two specs are deliberately not integration tests, and each says why in its own header
comment: `pets.repositories.spec.ts`, because Zod shadows every CHECK constraint so a
non-unique database error cannot be provoked through a request, and `shutdown.spec.ts`,
because the alternative is binding a port to kill it.

**The trigger to split has now fired, and was declined on purpose.** The old note here
said to reach for Vitest's `test.projects` (`workspace` was deprecated in 3.2) "when the
suite passes a couple of seconds, or when a real database forces setup and teardown". Both
happened: 146 tests in ~2.4s, with a database. It is still not worth it — pglite costs
~200ms per file with no teardown to write, and the whole run is under the threshold where
anyone waits. Revisit if a spec file needs a fixture that pglite cannot give it cheaply.

**Mutation-test anything load-bearing.** A suite that passes proves nothing until
it's been watched to fail: break the source deliberately, confirm the right tests
go red, revert. Deleting `errorHandler`'s 4th parameter, ignoring `err.status` or
hardcoding `expose = false` each fail 33–40 tests — which is both the proof the
suite works and a reminder that `errorHandler.ts` is now the highest-consequence
file in the repo.

The database move was checked the same way. The mutation that **survived** a green suite
was the missing `ORDER BY id` in `findPets` (§2.7) — on a line at 100% coverage, which is
the whole point: **100% covered is not the same as tested**. A test that updates a pet and
then asserts list order closed it.

`toPet`'s conditional `adoptionDate` spread came out well defended, and by three different
mechanisms, which is worth knowing before touching it: assigning `row.adoptionDate`
directly is a **type error**, so `tsc` refuses it; if it compiled, 5 tests fail on
`"adoptionDate": null` appearing in the body. Writing `row.adoptionDate ?? undefined`
survives — but that is an **equivalent mutant**, since an explicit `undefined` and an
absent key serialize identically and both leave `isAdopted` false.

It also finds behaviour nothing was testing. Two mutations **survived** a full green
run after the Zod conversion: treating a blank `?species=` as a value rather than as
absent (which turns an empty filter box into an empty result), and moving the
server-owned keys to the bottom of the schema (which silently changes which error
message a client sees). Both had been untested since long before the conversion.

A surviving mutation is usually a missing test — but check for an **equivalent
mutant** first, one that changes no behaviour at all. Rewriting
`nextId = pets.reduce(max…) + 1` as `pets.length + 1` looks like it would let ids be
reused; on seed ids 1–3 both evaluate to `4`, and `nextId` is assigned once at module
load, so nothing changes. The mutations that _do_ reuse ids — recomputing the id
inside `addPet` from `pets.length` or `max(id) + 1` — are caught.

**Hand supertest a server that is already listening.** Given an app that is not, it binds
a **fresh ephemeral port for every request** (`lib/test.js`: `if (!addr) this._server =
app.listen(0)`) and closes it afterwards. That was **176 listener binds per run**, measured
by patching `http.Server.prototype.listen`. `createTestApp().serverWith()` returns a
listening server instead, so a spec file reuses one port: **10 binds per run**.

This was not cosmetic. The old fixture failed **3 times in 40 runs**, a different test each
time, at least one confirmed as `Test timed out in 5000ms` — a request that never got a
response. The new one failed **0 times in 40 runs**. That is ~96% confidence the rate
actually dropped rather than 40 lucky runs, which is as much as a rare fault allows without
catching one in the act.

Three plausible-sounding explanations were tested and **disproved** on the way, which is why
they are written down rather than left to be re-derived: TIME_WAIT counts do not measure
listener churn (they count one client socket per request, so ~150 either way); `address()`
is available synchronously after `listen(0)` in the simple case; and superagent opens a new
connection per request, so keep-alive reuse is not involved.

> **`serverWith` awaits the `listening` event, and must keep doing so.** Returning the
> server before it is listening reintroduces the bug in a worse form: supertest sees a null
> `address()`, decides the server is its own, and **closes it** when that request ends — so
> every later request in the file hangs. That cost 5 tests in one run while this was being
> written.

**Never run two test processes at once.** `supertest` binds an ephemeral port per
request, so two concurrent runs produce requests that land on each other's servers.
The failures look like real bugs but are impossible states — an `expected 401 to be
400` from an API with no auth, a `404` where the route exists. A different test fails
each time. If the suite is flaky, check nothing else is running it before debugging
the code.

### CI

`.github/workflows/ci.yml` runs `npm ci`, then `format:check`, `lint`, `typecheck`,
`db:check`, `test` and `build` on pushes to `master` and on pull requests, using the Node
version from `.nvmrc`. It sets `HUSKY=0`, as husky recommends, so `npm ci` doesn't install
git hooks on the runner. Superseded pull-request runs are cancelled; runs on `master`
always finish.

**No Postgres service container, and that is the decision** — pglite runs in process and
`createTestDb` applies the migrations itself, so there is nothing to wait for and nothing
to configure. `db:check` opens no connection either, so CI needs no `DATABASE_URL` at all.
