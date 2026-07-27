# P4 — Partner registration form

The deliverable the owner asked for: a working multi-section registration form
for distributors and dealers, with draft autosave and submit-time validation.

**Director-only for now.** The `partner_ops` role and its route whitelist are P3,
deliberately not invented here — a half-built role is worse than no role.

## What shipped

| File | Purpose |
|---|---|
| `src/domain/partnerValidation.ts` | Required-field matrix, `canSell()` / `canService()` |
| `src/routes/partnerRegistration.routes.ts` | The API |
| `src/index.ts` | Two lines: import + register at `/api/v1/partners` |
| `src/components/onboarding/onboardingApi.ts` | Frontend client |
| `src/components/onboarding/PartnerOnboarding.tsx` | List + form screen |
| `src/App.tsx` | Import, `Page` union, render branch |
| `src/components/Sidebar.tsx` | Nav item, director-only |

## API

```
GET   /api/v1/partners/reference                  constitutions, states, dealer types,
                                                  doc types, product lines, distributors
POST  /api/v1/partners/registrations              create draft (legal_name only)
GET   /api/v1/partners/registrations[?status=]    list
GET   /api/v1/partners/registrations/:id          detail + documents
PATCH /api/v1/partners/registrations/:id          save draft — NO validation
POST  /api/v1/partners/registrations/:id/submit   validate, then submit
```

`/api/v1/partners` was freed when the legacy Partner Portal was removed. Unrelated
module, same word.

## Design decisions worth knowing

**Validation exists in exactly one place — the server.** The form does not carry
a second copy of the required-field matrix; it renders whatever field map the
server returns from a 422. Change the rules in `partnerValidation.ts` and the UI
follows with no edit.

**Submit returns 422, not 400.** The request is well-formed; the *record* is not
ready. The body carries `{ error, fields: { field: message } }` and the form marks
each input individually rather than showing one opaque banner.

**PATCH takes a column whitelist.** Keys outside `WRITABLE` are ignored rather
than rejected, so a client cannot reach `status`, `allotted_code`, `approved_by`
or `created_org_id` by adding a key to the body.

**Submit locks the row (`select … for update`) before checking status**, so two
concurrent submits cannot both pass the guard. The status check happens inside
the transaction, not before it.

**Editing is refused once status leaves `draft`** — PATCH returns 409, and the
form renders read-only.

**Autosave debounces at 700ms**, and submit flushes any pending save first so the
server validates what is actually on screen.

## Verified

Real checks, not assumed:

- Frontend `tsc --noEmit` clean; `vite build` succeeds
- Server: every import resolves; boots and listens
- Validation matrix unit-tested, 12/12 pass — distributor requires a warehouse,
  SS requires the four service fields, **SM must not**, a distributor carrying a
  dealer type is rejected, and every format check fires
- Route auth, tested against a running server with minted tokens:

  | Caller | `GET /partners/reference` |
  |---|---|
  | no token | **401** |
  | `sales` | **403** |
  | `accounts` | **403** |
  | `pipeline_owner` | **403** |
  | `director` | passes the guard (reaches DB) |

- `GET /partners/me` with an `X-Partner-Id` header → **404**. The legacy portal's
  header-trust bypass is gone.
- `GET /users` → **401**. Previously unauthenticated.

**Not verified:** anything requiring a real database. The smoke test ran against a
deliberately unreachable connection string, which is what proves the role gate
rejects *before* any query runs — but it means no query in this round has executed
against real data.

## Test checklist — run after deploying

- [ ] Sidebar shows "Partner onboarding" for a director, and for nobody else
- [ ] "New distributor" creates a draft from just a legal name
- [ ] Typing shows "Saving…" then "Saved"; reload restores the draft
- [ ] Choosing Dealer reveals dealer type + distributor dropdown; the dropdown
      lists Continental Power System (EDINGX001)
- [ ] Choosing **SS** reveals the Service capability section; **SM** does not
- [ ] Distributor shows the Warehouse section; dealer does not
- [ ] Submitting an incomplete form marks individual fields, does not save a status change
- [ ] Completing every marked field then submitting flips status to `submitted`
- [ ] A submitted registration is read-only and PATCH returns 409
- [ ] `partner_service.registration_event` has a `created` and a `submitted` row

## Next

- **P5** — document upload against the existing `StorageProvider`, checklist
  driven by dealer type
- **P2** — GSTIN checksum in `src/domain/gstin.ts`; `partnerValidation.ts` already
  has the call site marked, so the arithmetic lands in one place
- **P3** — `partner_ops` role and the route whitelist. Note the audit surface:
  `users.ts` was unauthenticated until this round, so the whitelist needs to be
  deny-by-default rather than a list of exceptions
- **P6** — director review queue, approve/reject, code allotment transaction
