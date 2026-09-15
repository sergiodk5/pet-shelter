# Pet Shelter API

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
| Register / update pets   | 🔜 Planned   |
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

### Scripts

| Command                | What it does                                               |
| ---------------------- | ---------------------------------------------------------- |
| `npm run dev`          | Watch `src/`, rebuild and restart on change (nodemon)      |
| `npm run build`        | Clean `dist/` and compile with `tsc`                       |
| `npm start`            | Build, then run `dist/server.js`                           |
| `npm run lint`         | Lint `src/` with oxlint, including type-aware rules        |
| `npm run lint:fix`     | Lint and apply automatic fixes                             |
| `npm run format`       | Format the repo with Prettier                              |
| `npm run format:check` | Check formatting without changing files                    |
| `npm run typecheck`    | Type-check with `tsc --noEmit`                             |
| `npm run commit`       | Write a commit message with the guided prompt (commitizen) |

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
├─ app.ts              # builds the Express app (no listen, so tests can import it)
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

Git hooks check every commit:

| Hook         | Check                                                                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pre-commit` | lint-staged runs oxlint (with fixes) and Prettier on the staged files, then `tsc --noEmit` checks types. The commit is blocked on lint or type errors. |
| `commit-msg` | commitlint. The commit is blocked if the message doesn't follow the convention.                                                                        |

Run `npm run commit` for a guided prompt, or write the message yourself with
`git commit`. The hooks run either way.

---

## License

ISC
