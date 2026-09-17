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

The pets served today are **demo data** for development. They live in memory and
reset every time the server restarts. A database is planned for real data.

---

## Requirements

- **Node.js 24**. The version is pinned in `.nvmrc`, so `nvm use` picks it up. The
  project uses the TypeScript 7 native compiler and `@tsconfig/node24`.
- npm

## Getting started

```bash
npm install      # also installs the git hooks (via the "prepare" script)
npm run dev      # start the server; rebuilds and restarts when you save
```

The API listens on **http://localhost:8000**.

### Configuration

All settings are optional; the defaults below are what you get with no `.env` at all. Copy
`.env.example` to `.env` (gitignored) to override them. Invalid values stop the server at
startup rather than failing later.

| Variable       | Default       | Meaning                                                                                                                                                         |
| -------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
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

### Tests

Specs live next to the code as `*.spec.ts` and use [vitest](https://vitest.dev/) with
[supertest](https://github.com/forwardemail/supertest), which drives the Express app
directly without starting a server.

```bash
npx vitest run src/modules/pets/pets.spec.ts            # one file
npx vitest run src/modules/pets/pets.spec.ts -t "rejects id"  # one test by name
```

Endpoints that write have their own spec file — `pets.post.spec.ts`,
`pets.put.spec.ts`, `pets.delete.spec.ts`. The demo data is module state, so a write
test would otherwise mutate the array the `GET` tests assert against; Vitest isolates
module state per file, not per `describe`. Shared request bodies live in
`pets.fixtures.ts`.

Run the suite **one process at a time**: `supertest` binds an ephemeral port per
request, so two concurrent runs cross-talk and fail random tests for no real reason.

---

## API

All error responses share one shape:

```json
{ "message": "Human-readable description" }
```

### `GET /pets`

Lists pets. Every filter is optional, and filters can be combined.

| Query param | Type              | Notes                                                             |
| ----------- | ----------------- | ----------------------------------------------------------------- |
| `species`   | string            | Case-insensitive, e.g. `dog`, `Cat`                               |
| `adopted`   | `true` \| `false` | Case-insensitive. A pet is adopted when it has an `adoptionDate`. |
| `minAge`    | number            | Inclusive                                                         |
| `maxAge`    | number            | Inclusive                                                         |

```bash
curl "http://localhost:8000/pets?species=cat&adopted=true"
```

| Status | When                                                 |
| ------ | ---------------------------------------------------- |
| `200`  | Array of pets (empty if nothing matches)             |
| `400`  | Invalid filter, e.g. `adopted=maybe` or `minAge=abc` |

### `GET /pets/:id`

Fetches one pet.

```bash
curl http://localhost:8000/pets/1
```

| Status | When                           |
| ------ | ------------------------------ |
| `200`  | The pet                        |
| `400`  | `id` is not a positive integer |
| `404`  | No pet with that id            |

### `POST /pets`

Registers a pet. Send `Content-Type: application/json`.

| Field                        | Type             | Required | Notes                                                           |
| ---------------------------- | ---------------- | -------- | --------------------------------------------------------------- |
| `name`                       | string           | yes      | Non-empty; surrounding whitespace is trimmed                    |
| `species`                    | string           | yes      | Non-empty                                                       |
| `breed`                      | string           | yes      | Non-empty                                                       |
| `age`                        | integer          | yes      | `0` or more                                                     |
| `photo`                      | string           | yes      | Non-empty                                                       |
| `intakeDate`                 | date string      | no       | Defaults to now. Any format `Date` can parse, e.g. `2024-06-15` |
| `medicalRecord`              | object           | yes      | See below                                                       |
| `medicalRecord.vaccinations` | string[]         | yes      | May be empty                                                    |
| `medicalRecord.weightKg`     | number           | yes      | Greater than `0`                                                |
| `medicalRecord.microchipId`  | string \| `null` | no       | Defaults to `null`                                              |

`id` is assigned by the shelter and `adoptionDate` is set when a pet is adopted —
sending either is a `400`. Any **other** field not listed above is ignored: it's
dropped from the request and never stored, and the response tells you what was
actually saved.

```bash
curl -i -X POST http://localhost:8000/pets \
  -H 'Content-Type: application/json' \
  -d '{"name":"Luna","species":"Dog","breed":"Beagle","age":2,
       "medicalRecord":{"vaccinations":["Rabies"],"weightKg":9.2,"microchipId":null},
       "photo":"https://picsum.photos/id/240/200/300"}'
```

| Status | When                                                              |
| ------ | ----------------------------------------------------------------- |
| `201`  | The stored pet, with a `Location` header pointing at `/pets/{id}` |
| `400`  | A field is missing, the wrong type, unknown, or server-owned      |

The response body is the pet as stored — the same shape `GET /pets/:id` returns —
so the server-assigned `id` and the normalized `intakeDate` come back without a
second request. Validation reports the **first** problem it finds, not every
problem.

### `PUT /pets/:id`

Replaces a pet. **The body is the pet** — every field you send becomes its new state,
and every optional field you leave out is cleared. Same fields and same rules as
`POST /pets`, with two differences:

| Field          | Difference from create                                                                          |
| -------------- | ----------------------------------------------------------------------------------------------- |
| `intakeDate`   | **Required.** Create defaults it to now; doing that here would silently reset it on every edit. |
| `adoptionDate` | **Writable.** Send a date to adopt; send `null` or omit it to return the pet to the shelter.    |

`id` is still assigned by the shelter — it belongs in the URL, so sending it in the
body is a `400`. Unknown fields are ignored, as on create.

```bash
# adopt a pet
curl -X PUT http://localhost:8000/pets/1 \
  -H 'Content-Type: application/json' \
  -d '{"name":"Bella","species":"Dog","breed":"Border Collie","age":3,
       "intakeDate":"2024-06-15","adoptionDate":"2026-09-17",
       "medicalRecord":{"vaccinations":["Rabies"],"weightKg":18.4,"microchipId":null},
       "photo":"https://picsum.photos/id/237/200/300"}'

# ...and return it: same body with adoptionDate null
```

| Status | When                                                      |
| ------ | --------------------------------------------------------- |
| `200`  | The replaced pet                                          |
| `400`  | `id` is not a positive integer, or the body breaks a rule |
| `404`  | No pet with that id                                       |

The body is validated **before** the id is looked up, so a bad body on a URL that
doesn't exist reports the body problem, not a `404`.

Because a client normally loads a pet, edits it and sends it back, the round trip is
`GET /pets/:id` → change what you want → `PUT`. Sending a field you didn't mean to
change is harmless; _omitting_ one is not.

### `DELETE /pets/:id`

Removes a pet permanently.

```bash
curl -i -X DELETE http://localhost:8000/pets/1
```

| Status | When                           |
| ------ | ------------------------------ |
| `204`  | Removed. No response body.     |
| `400`  | `id` is not a positive integer |
| `404`  | No pet with that id            |

Ids are **never reused**. Delete pet `4` and the next pet created is `5`, so a stored
link can't quietly start pointing at a different animal.

### Other errors

| Status | When                                                                     |
| ------ | ------------------------------------------------------------------------ |
| `400`  | Request body is not valid JSON                                           |
| `404`  | Unknown route                                                            |
| `413`  | Request body is over the 100kb limit                                     |
| `500`  | Unexpected server error. Details are logged server-side, never returned. |

---

## Project structure

```
src/
├─ modules/            # one folder per business area
│  └─ pets/            # routes, controllers, validators, middleware, repositories, types
├─ shared/             # cross-cutting code: error handling, shared types
├─ config/             # validated env vars (PORT, NODE_ENV, CORS_ORIGINS)
├─ app.ts              # createApp(config): builds the app, never listens
└─ server.ts           # starts the server
```

The reasoning behind this layout, and the conventions for adding a new module, are
in [`docs/architecture.md`](docs/architecture.md).

---

## Commits

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add adoption requests
fix(pets): reject non-numeric ids
docs: document the pets endpoints
```

Git hooks check every commit and push:

| Hook         | Check                                                                                                                                                                        |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pre-commit` | lint-staged runs oxlint (with fixes) and Prettier on the staged files, then `tsc --noEmit` checks types. The commit is blocked on lint errors, lint warnings or type errors. |
| `commit-msg` | commitlint. The commit is blocked if the message doesn't follow the convention.                                                                                              |
| `pre-push`   | `npm test`. The push is blocked if any test fails.                                                                                                                           |

Run `npm run commit` for a guided prompt, or write the message yourself with
`git commit`. The hooks run either way.

GitHub Actions also runs `format:check`, `lint`, `typecheck`, `test` and `build` on every push to
`master` and on pull requests ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)).

---

## License

ISC
