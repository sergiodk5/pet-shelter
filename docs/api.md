# API reference

Every endpoint the shelter serves today, with the exact request and response shapes. For
why it is built this way, see [`architecture.md`](architecture.md); to run it, see the
[README](../README.md).

A generated OpenAPI document will replace this once Swagger UI lands — it is listed under
"a browser client" in [`production-readiness.md`](production-readiness.md).

---

All error responses share one shape:

```json
{ "message": "Human-readable description" }
```

## `GET /pets`

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

## `GET /pets/:id`

Fetches one pet.

```bash
curl http://localhost:8000/pets/1
```

| Status | When                           |
| ------ | ------------------------------ |
| `200`  | The pet                        |
| `400`  | `id` is not a positive integer |
| `404`  | No pet with that id            |

## `POST /pets`

Registers a pet. Send `Content-Type: application/json`.

| Field                        | Type             | Required | Notes                                                           |
| ---------------------------- | ---------------- | -------- | --------------------------------------------------------------- |
| `name`                       | string           | yes      | Non-empty; surrounding whitespace is trimmed                    |
| `species`                    | string           | yes      | Non-empty                                                       |
| `breed`                      | string           | yes      | Non-empty                                                       |
| `age`                        | integer          | yes      | `0` or more                                                     |
| `photo`                      | string           | yes      | Non-empty                                                       |
| `intakeDate`                 | date string      | no       | Defaults to now. Any format `Date` can parse, e.g. `2024-06-15` |
| `microchipId`                | string \| `null` | no       | Defaults to `null`. Must be unique across the shelter.          |
| `medicalRecord`              | object           | yes      | See below                                                       |
| `medicalRecord.vaccinations` | string[]         | yes      | May be empty                                                    |
| `medicalRecord.weightKg`     | number           | yes      | Greater than `0`                                                |

`id` is assigned by the shelter and `adoptionDate` is set when a pet is adopted —
sending either is a `400`. Any **other** field not listed above is ignored: it's
dropped from the request and never stored, and the response tells you what was
actually saved.

```bash
curl -i -X POST http://localhost:8000/pets \
  -H 'Content-Type: application/json' \
  -d '{"name":"Luna","species":"Dog","breed":"Beagle","age":2,"microchipId":null,
       "medicalRecord":{"vaccinations":["Rabies"],"weightKg":9.2},
       "photo":"https://picsum.photos/id/240/200/300"}'
```

| Status | When                                                              |
| ------ | ----------------------------------------------------------------- |
| `201`  | The stored pet, with a `Location` header pointing at `/pets/{id}` |
| `400`  | A field is missing, the wrong type, unknown, or server-owned      |
| `409`  | `microchipId` already belongs to another pet                      |

The response body is the pet as stored — the same shape `GET /pets/:id` returns —
so the server-assigned `id` and the normalized `intakeDate` come back without a
second request. Validation reports the **first** problem it finds, not every
problem.

## `PUT /pets/:id`

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
       "intakeDate":"2024-06-15","adoptionDate":"2026-09-17","microchipId":null,
       "medicalRecord":{"vaccinations":["Rabies"],"weightKg":18.4},
       "photo":"https://picsum.photos/id/237/200/300"}'

# ...and return it: same body with adoptionDate null
```

| Status | When                                                      |
| ------ | --------------------------------------------------------- |
| `200`  | The replaced pet                                          |
| `400`  | `id` is not a positive integer, or the body breaks a rule |
| `404`  | No pet with that id                                       |
| `409`  | `microchipId` already belongs to another pet              |

The body is validated **before** the id is looked up, so a bad body on a URL that
doesn't exist reports the body problem, not a `404`.

Because a client normally loads a pet, edits it and sends it back, the round trip is
`GET /pets/:id` → change what you want → `PUT`. Sending a field you didn't mean to
change is harmless; _omitting_ one is not.

## `DELETE /pets/:id`

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
link can't quietly start pointing at a different animal. That is the database's
identity column, not bookkeeping in the application.

## Other errors

| Status | When                                                                     |
| ------ | ------------------------------------------------------------------------ |
| `400`  | Request body is not valid JSON                                           |
| `404`  | Unknown route                                                            |
| `409`  | A value that must be unique is already taken                             |
| `413`  | Request body is over the 100kb limit                                     |
| `500`  | Unexpected server error. Details are logged server-side, never returned. |
