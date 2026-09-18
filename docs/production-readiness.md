# Production readiness

What has to be true before this API handles real users: security, logging, error handling,
performance and deployment. It merges our own review with Express's official
[security](https://expressjs.com/en/advanced/best-practice-security/) and
[performance](https://expressjs.com/en/advanced/best-practice-performance/) best-practice
guides, and records the current state of each item so it's clear what's done and what isn't.

Status: ✅ in place · ⚠️ gap in the code today · 🔜 planned (needed once the related feature
lands)

State checked on 2026-09-18 against `master` at `7e3ac48`.

---

## 1. Current state

Findings from running the app and inspecting the repo:

| Item                                           | Status | Detail                                                                                         |
| ---------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------- |
| CORS                                           | ✅     | Allowlist from `CORS_ORIGINS`, empty by default, passed to `cors` as an array                  |
| Fingerprinting                                 | ✅     | `helmet()` removes `X-Powered-By`                                                              |
| `trust proxy`                                  | ⚠️     | Not set. Must match the deployment before rate limiting is added (§3)                          |
| `console.*` in production paths                | ⚠️     | `server.ts`, `shutdown.ts` and `errorHandler.ts` (5xx). Synchronous to a terminal or file (§5) |
| Storage                                        | ✅     | Postgres via Drizzle. Parameterized by construction — no string-built SQL anywhere             |
| Startup and shutdown                           | ✅     | Boot fails on an unreachable database; SIGTERM/SIGINT drain requests, then the pool            |
| Express version                                | ✅     | 5.2.1, the latest release                                                                      |
| `npm audit --omit=dev`                         | ✅     | 0 vulnerabilities                                                                              |
| Node.js                                        | ✅     | 24 is the newest LTS (v24.21.0 "Krypton"). Node 26 is not LTS yet                              |
| Synchronous APIs in request paths              | ✅     | None                                                                                           |
| `uncaughtException` listener                   | ✅     | None (§6 explains why that's correct)                                                          |
| JSON 404 + error handler, no stack traces sent | ✅     | `shared/middleware/notFound.ts`, `errorHandler.ts`                                             |
| Request body size limit                        | ✅     | `express.json()` default 100kb; over-limit bodies get 413 (tested)                             |
| Repeated query params (`?a=1&a=2`)             | ✅     | Validators take the last value (tested), so the `hpp` package isn't needed                     |
| GitHub secret scanning + push protection       | ✅     | Enabled                                                                                        |
| Dependabot alerts / security updates           | ⚠️     | Off, and no `.github/dependabot.yml`                                                           |
| CodeQL code scanning                           | ⚠️     | Never run                                                                                      |

---

## 2. HTTP layer

| Item                  | Status | What to do                                                                                                                                                                                                                                                                                             |
| --------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Helmet                | ✅     | `app.use(helmet())`, before every other middleware. Sets `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, the cross-origin policies, and removes `X-Powered-By`. It also disables `X-XSS-Protection`, which makes things worse. |
| CORS allowlist        | ✅     | Allowlist from `CORS_ORIGINS`, empty by default, passed to `cors` as an array. CORS only restricts **browsers**: curl and scripts ignore it, so it is never a substitute for auth.                                                                                                                     |
| TLS                   | 🔜     | Terminate HTTPS at the reverse proxy (§8). Free certificates from Let's Encrypt; follow the TLSRef recommended server configurations. HSTS from Helmet then tells browsers to stay on HTTPS.                                                                                                           |
| Reduce fingerprinting | ✅     | Custom 404 and error handlers, and Helmet removes `X-Powered-By`. Express notes this doesn't stop a determined attacker from identifying Express; it just removes the easy signal.                                                                                                                     |

---

## 3. Request abuse

| Item                      | Status | What to do                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `trust proxy`             | ⚠️     | `app.set("trust proxy", N)` where **N is the exact number of proxies** in front of the app. Unset behind a proxy, every client looks like the proxy's IP, so one user's traffic rate-limits everyone. `true` trusts the leftmost `X-Forwarded-For` entry, which a client can forge to dodge limits. express-rate-limit logs `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` / `ERR_ERL_PERMISSIVE_TRUST_PROXY` for these two cases. |
| Global rate limit         | 🔜     | `express-rate-limit`. The default store is in-memory: counters reset on restart and aren't shared across processes, so use `rate-limit-redis` once there's more than one instance (§8).                                                                                                                                                                                                                                  |
| Brute-force on login      | 🔜     | Express's guide recommends `rate-limiter-flexible` with two limits: **consecutive failures per username + IP**, and **total failures per IP over a long window** (e.g. block after 100 failed attempts in a day). `express-slow-down` (progressive delays) is a lighter alternative. Keep `/auth` limits stricter than the global one.                                                                                   |
| Generic credential errors | 🔜     | One "invalid credentials" message for unknown user and wrong password, so accounts can't be enumerated.                                                                                                                                                                                                                                                                                                                  |

---

## 4. Auth, authorization and sessions

Structure is in [`architecture.md` §3](architecture.md#3-auth): `modules/auth/` for the feature,
`shared/middleware/requireAuth.ts` for the guard, default-deny, authentication and authorization
kept separate.

**Packages settled 2026-09-18, nothing installed yet:** `pino` + `pino-http` for logging,
`@node-rs/argon2` for hashing, `jose` if and when something has to be verifiable without a
database lookup. Sessions live in Postgres — see the two rows below.

**Not `better-auth`**, despite it fitting the stack exactly (its peers name
`drizzle-orm ^0.45.2`, our version, plus `pg ^8` and Zod 4). It owns every route under its
mount path, so our conventions — validators throw, `errorHandler` formats, every error body
is `ErrorResponse` — would not apply there, and it has to be mounted **before**
`express.json()` because body parsers consume the stream. Two conventions in one app, at the
most security-sensitive seam. Revisit if OAuth, magic links or 2FA arrive, which is the work
it genuinely saves.

**Do not follow a 2024 tutorial here.** `lucia` was deprecated in June 2025 and now points
at a migration guide; `oslo`, its primitive library, is deprecated too. `passport` still has
7.4M weekly downloads but last shipped in January 2025.

| Item                              | Status | What to do                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Object-level authorization        | 🔜     | **#1 on the OWASP API Security Top 10** (Broken Object Level Authorization). A valid token proves who someone is, not that `GET /adoption-requests/17` is theirs. Every read and write of an adoption request checks ownership (`request.userId === req.user.id`) or a staff role.                                                                                                |
| Sessions, not JWT                 | 🔜     | An opaque token from `crypto.randomBytes(32)`, stored hashed in a `sessions` table. **This replaces the earlier plan to use JWTs.** A JWT's whole advantage is validating without a database lookup — but every request here already hits Postgres, so statelessness buys nothing while costing instant revocation, and the algorithm-confusion class of bug disappears entirely. |
| `jose`                            | 🔜     | Only where something must be verifiable **without** a lookup, or by someone else: password-reset and email-verification links that expire on their own, or external identity. Zero dependencies, built on WebCrypto, and it refuses to verify without naming the expected algorithm — which is what stops `alg: none` and RS256/HS256 confusion. Not needed for session auth.     |
| Password hashing                  | 🔜     | Argon2id (OWASP's first choice) via **`@node-rs/argon2`** rather than `argon2`: same algorithm, but it ships prebuilt binaries for 13 platforms including `darwin-arm64` and `linux-x64-gnu`, where `argon2` pulls `node-gyp-build` and compiles on every machine and CI runner.                                                                                                  |
| Cookies (refresh token / session) | 🔜     | `secure`, `httpOnly`, `sameSite`, plus scoped `domain`, `path` and `expires`. Don't use a library's default cookie name, which fingerprints the server the same way `X-Powered-By` does.                                                                                                                                                                                          |
| CSRF                              | 🔜     | Only needed where auth travels in a cookie. A token in the `Authorization` header isn't sent automatically by the browser; a refresh-token cookie is, so protect the refresh endpoint.                                                                                                                                                                                            |
| Secrets at startup                | 🔜     | `src/config/env.ts` already validates and throws at boot (hand-rolled; `loadDatabaseUrl` is required). Extend it for whatever secret the session cookie needs. `.env` is already gitignored.                                                                                                                                                                                      |

---

## 5. Logging

| Item                | Status | What to do                                                                                                                                                                                                                                                                                    |
| ------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Replace `console.*` | ⚠️     | Express's guide: `console.log()`/`console.error()` "are synchronous when the destination is a terminal or a file, so they are not suitable for production". Use `pino` for app logs, including `errorHandler`'s 5xx logging and `server.ts`'s startup line.                                   |
| Request logging     | 🔜     | `pino-http`. Generate a request ID with `genReqId` and return it as `X-Request-Id`. Log 4xx as `warn` and 5xx as `error` with `customLogLevel` — and 502/503/504 as `info`, so a flaky upstream stops reading as an application fault (n8n derives its level from the status range this way). |
| Redaction           | 🔜     | `redact` the `authorization` and `cookie` headers and any password fields. Logs are a common leak path once auth exists.                                                                                                                                                                      |
| Debug output        | 🔜     | Express suggests the `debug` module instead of ad-hoc `console.log`; pino's `debug` level works too. `pino-pretty` for readable local output, dev only.                                                                                                                                       |

---

## 6. Error handling

| Item                            | Status | Detail                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Central error handler           | ✅     | Honours `err.status` and `err.expose`, logs only 5xx, never sends stack traces ([`architecture.md` §2.4](architecture.md#24-errors)).                                                                                                                                                                                                     |
| Errors from `async` handlers    | ✅     | Express 5 forwards a thrown error or rejected promise in an `async` route handler to the error handler, as if `next(err)` were called. Tested here: a throw after `await` → 500 with the generic message; a rejected error with `status: 404, expose: true` → 404 with its message. Don't wrap handlers in try/catch just to call `next`. |
| No `uncaughtException` listener | ✅     | Express's guide: "continuing to run the app after an uncaught exception is a dangerous practice… the state of the process becomes unreliable". Let the process exit and have the process manager restart it (§8). Don't use `domain` either; it's deprecated.                                                                             |

---

## 7. Input and injection

| Item                    | Status  | What to do                                                                                                                                                                                     |
| ----------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema validation       | ✅      | Zod 4 on every write endpoint ([`architecture.md` §2.5](architecture.md#25-validation--zod)). `id` and `adoptionDate` are declared and rejected, which blocks mass assignment by construction. |
| SQL / NoSQL injection   | ✅      | Drizzle parameterizes every query, including the one `sql` template in `findPets`. No string-built SQL anywhere. `sqlmap` against a deployed instance is still worth doing.                    |
| XSS / command injection | 🔜      | Filter and sanitize input. The API returns JSON rather than HTML, which removes most reflected XSS, but anything later rendered by a front end still needs escaping there.                     |
| Open redirects          | ✅      | No `res.redirect` / `res.location` today. If one is added, validate the target host against an allowlist first.                                                                                |
| Regular expression DoS  | ✅ / 🔜 | Check new regexes with `safe-regex`. The one regex in the app, `/^\d+$/`, is safe (checked; `/^(a+)+$/` is correctly flagged as unsafe).                                                       |

---

## 8. Performance and deployment

These come from Express's performance guide. Several depend on the app being **stateless**,
and it isn't yet: pets live in memory (`pets.repositories.ts`), and an in-memory rate-limit
store would be per-process too. Moving that state to a database and Redis is what unlocks
clustering and multiple instances.

| Item                         | Status | What to do                                                                                                                                                                                                               |
| ---------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NODE_ENV=production`        | 🔜     | Set it in production. Express caches view templates and generates less verbose error messages; the guide cites tests showing up to a threefold performance improvement from this alone.                                  |
| Latest Node LTS              | ✅     | Node 24, pinned in `.nvmrc` and `engines` and used by CI. Move `.nvmrc`, `engines` and `@tsconfig/node24` together when Node 26 becomes LTS.                                                                             |
| Automatic restarts           | 🔜     | Express recommends the OS init system (systemd with `Restart=always` and `Environment=NODE_ENV=production`) over a process manager like PM2. On a container platform, the orchestrator's restart policy plays this role. |
| Cluster / multiple instances | 🔜     | Node's `cluster` module or PM2 (`pm2 start npm --name pet-shelter -i max -- start`). Requires statelessness: no in-process sessions or data. JWTs avoid server-side sessions, so no sticky sessions are needed.          |
| Reverse proxy                | 🔜     | Run behind Nginx or HAProxy for TLS, compression, caching, error pages and load balancing, and set `trust proxy` to match (§3).                                                                                          |
| Compression                  | 🔜     | Prefer gzip at the reverse proxy for high traffic, as the guide advises. Otherwise `app.use(compression())` (`compression` package, tested here).                                                                        |
| Caching                      | 🔜     | A caching server (Varnish or Nginx) in front for cacheable GETs such as the pet list.                                                                                                                                    |
| No synchronous functions     | ✅     | None in request paths. Run with `node --trace-sync-io` to catch any added later.                                                                                                                                         |
| CPU-bound work               | 🔜     | Nothing CPU-heavy today. If pet photo processing (resizing, thumbnails) is added, run it in `worker_threads` through a pool such as `piscina` rather than on the request thread.                                         |

---

## 9. Dependencies and supply chain

| Item                                 | Status   | What to do                                                                                                                                          |
| ------------------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supported Express version            | ✅       | 5.2.1 (latest). Express 2.x and 3.x are unmaintained; check Express's security updates page when upgrading.                                         |
| `npm audit` in CI                    | 🔜       | Add `npm audit --omit=dev --audit-level=high` to `.github/workflows/ci.yml`. Clean today.                                                           |
| Dependabot alerts + security updates | ⚠️       | Enable in the repository's security settings.                                                                                                       |
| `.github/dependabot.yml`             | ⚠️       | Weekly version-update PRs for npm and GitHub Actions.                                                                                               |
| CodeQL code scanning                 | ⚠️       | Free for public repositories; enable default setup.                                                                                                 |
| Secret scanning + push protection    | ✅       | Enabled.                                                                                                                                            |
| Snyk                                 | Optional | Express's guide suggests it alongside `npm audit`; largely overlaps with Dependabot + CodeQL.                                                       |
| Advisories                           | Ongoing  | Watch the GitHub Advisory Database for Express and dependencies.                                                                                    |
| Drizzle is pre-1.0                   | ⚠️       | 0.45.2 ships breaking changes between **minor** versions. Pin exactly and read the release notes before upgrading — a caret range is not safe here. |

---

## 10. API documentation

| Item       | Status | What to do                                                                                                                                                                                                                                  |
| ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Swagger UI | 🔜     | `swagger-ui-express`, with the OpenAPI document generated from the Zod schemas by `@asteasolutions/zod-to-openapi`, so the docs can't drift from the actual validation. Don't expose `/docs` publicly in production, or put it behind auth. |

---

## 11. Security testing

| Tool             | When                                                                        |
| ---------------- | --------------------------------------------------------------------------- |
| `sqlmap`         | Once a SQL database is in place, against a non-production environment       |
| `nmap`, `sslyze` | Once TLS is deployed: ciphers, keys, renegotiation and certificate validity |
| `safe-regex`     | Whenever a regular expression is added                                      |

---

## 12. Package compatibility

TypeScript 7 rules out some common tools (see `CLAUDE.md`), so every package above was checked
against this project's toolchain (TypeScript 7, `"type": "commonjs"`, Node 24): type-checked with
`tsc`, compiled, and loaded with `require()`.

| Package                          | Version | Result                                                     |
| -------------------------------- | ------- | ---------------------------------------------------------- |
| `helmet`                         | 8.3.0   | ✅                                                         |
| `express-rate-limit`             | 8.7.0   | ✅ (ESM-first package with a `require` entry)              |
| `express-slow-down`              | 3.1.1   | ✅                                                         |
| `rate-limiter-flexible`          | 11.2.0  | ✅ blocked the 3rd attempt after 2 allowed                 |
| `compression`                    | 1.8.2   | ✅                                                         |
| `pino`                           | 10.3.1  | ✅                                                         |
| `pino-http`                      | 11.0.0  | ✅                                                         |
| `swagger-ui-express`             | 5.0.1   | ✅                                                         |
| `@asteasolutions/zod-to-openapi` | 9.1.0   | ✅                                                         |
| `zod`                            | 4.6.5   | ✅                                                         |
| `jose`                           | 6.2.12  | ✅ ESM-only, yet a real sign + verify worked from CommonJS |
| `jsonwebtoken`                   | 9.0.3   | ✅ sign + verify                                           |
| `argon2`                         | 0.45.1  | Not tested (native module)                                 |
| `rate-limit-redis`               | 6.0.1   | Not tested (needs Redis)                                   |

---

## What to do when

Grouped by **the event that should trigger it**, not by severity. This project has no
production, no users and nothing deployed, so ordering by severity alone would build
protections for features that do not exist. The question that decides the order is:

> Is this **structural** — does it change how code gets written from here on? Or does it
> **protect something** that does not exist yet?

Structural work is cheap now and expensive later; protective work should land in the same
arc of commits as the thing it protects. That is why the highest-severity item in this
whole document — object-level authorization — is not near the top: it is a rule about who
may read which adoption request, and adoption requests do not exist yet.

**Done:** helmet, the `CORS_ORIGINS` allowlist, `config/env.ts`, `createApp(config, db)`,
Zod validation and rejecting a client-supplied `id`, Postgres with parameterized queries,
CI with a migration-drift guard, and graceful shutdown with a startup connectivity check.

| Trigger                       | Then do                                                                                                                                                                                                                 |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Starting auth**             | pino + pino-http **first** (§5), with redaction of `authorization`, `cookie` and password fields — retrofitting redaction after tokens are already in the logs is the bad version                                       |
| **The auth feature**          | Argon2id → database sessions → object-level authorization → brute-force limits and one generic credential error → cookie flags and CSRF, since the session travels in a cookie                                          |
| **A browser client**          | Set `CORS_ORIGINS` (one line in `.env`, no code change). Swagger UI from the Zod schemas, with a CSP exception for `/docs`                                                                                              |
| **The first real deployment** | Reverse proxy with TLS → `trust proxy` set to the exact proxy count → global rate limit → `NODE_ENV=production` → restart policy → compression at the proxy                                                             |
| **A second instance**         | Redis for shared state (rate-limit counters, sessions are per-process today), then clustering                                                                                                                           |
| **Only if it happens**        | `safe-regex` when a regex is added · sqlmap after a deploy · nmap/sslyze after TLS · output escaping only if an endpoint returns HTML · worker threads only if CPU-heavy work appears (photo resizing is the candidate) |

### Orderings that cannot be reshuffled

```
logging ──────► the whole auth arc            (so failures are visible)
Argon2id ─────► JWT ──► object-level authz
                   ├──► brute-force limits
                   └──► cookies + CSRF
proxy + TLS ──► trust proxy ──► rate limit
```

`trust proxy` has to be exact and the right value _is_ the deployment shape: wrong, and one
user rate-limits everyone, or a client forges its IP to escape the limit. That is why it is
not worth setting today.

---

## Assessed and accepted findings

Recorded so they are decisions rather than things rediscovered later.

### esbuild dev-server advisory (GHSA-67mh-4wv8-2f99) — accepted 2026-09-18

`npm audit` reports 4 moderate findings, all one chain:

```
drizzle-kit → @esbuild-kit/esm-loader → @esbuild-kit/core-utils → esbuild 0.18.x
```

**Decision: leave it.** The user's call, and the reasoning:

- The advisory is about **esbuild's dev server** (`esbuild --serve`) letting any website send
  it requests and read the responses. drizzle-kit uses esbuild to bundle its config file; the
  vulnerable path is never executed.
- `drizzle-kit` is a **devDependency** and nothing esbuild-related reaches `dist/` (verified).
- `npm audit fix --force` installs **drizzle-kit@0.18.1**, down from 0.31.10. That is not a
  patch; it would break the schema format, the config and the migrations.
- An `overrides` entry pinning esbuild inside `@esbuild-kit/core-utils` risks breaking the
  config loader, which is the only thing we use drizzle-kit for.

Resolution is upstream: drizzle-kit is migrating off `@esbuild-kit/*`. Re-check on upgrades.

It is also a concrete argument against adding `npm audit` to CI unconditionally: it would
fail every build over a finding whose only available remedy is destructive. Scope it with
`--omit=dev` if it goes in at all.

---

## Sources

- Express: [Security best practices](https://expressjs.com/en/advanced/best-practice-security/)
- Express: [Performance best practices](https://expressjs.com/en/advanced/best-practice-performance/)
- [OWASP API Security Top 10](https://owasp.org/API-Security/)
- express-rate-limit: [Troubleshooting proxy issues](https://express-rate-limit.mintlify.app/guides/troubleshooting-proxy-issues)
- [pino-http](https://github.com/pinojs/pino-http)
- [Node.js release index](https://nodejs.org/dist/index.json)
