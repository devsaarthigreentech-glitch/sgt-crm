# R2 — Org scoping and the distributor portal

The round the quote SPEC flagged as highest-risk. It gives an **external**
party a login into the CRM, so the access boundary had to be built before the
screen was.

## The finding that shaped this round

Before this change, these routes checked only `requireAuth` — "are you logged
in?" — and nothing else:

| Route file | Reachable by *any* authenticated user |
|---|---|
| `leads.ts` | `/leads`, `/pipeline` — the entire pipeline |
| `vault.ts` | customers, documents |
| `vaultPoc.routes.ts` | POCs |
| `outreach.routes.ts` | 14 outreach endpoints |
| `users.ts` | the staff roster |

Only `erp.ts`, `targets.ts` and the partner routes checked role.

That was survivable while every account belonged to SGT. It stops being
survivable the moment an account belongs to a distributor: they could have read
the whole pipeline and the customer vault by calling the API directly,
regardless of what the UI showed. **Hiding sidebar items is not access control.**

## What shipped

| File | Purpose |
|---|---|
| `src/auth/policy.ts` | Deny-by-default route access for external roles |
| `src/db/migrate_quote_03_user_org.ts` | `app_user.org_id` + `visible_org_ids()` |
| `src/routes/portal.routes.ts` | `/portal/me`, `/portal/dealers` |
| `src/db/create-partner-user.ts` | Creates an external login, safely |
| `src/index.ts` | Hook registration + portal routes (4 lines) |
| `src/components/portal/DistributorPortal.tsx` | The distributor's whole app |
| `src/components/portal/portalApi.ts` | Portal client |
| `src/App.tsx` | Branch to the portal shell for external roles |

## The access model

Roles split in two:

- **Internal** — `director`, `sales`, `accounts`, `supply_chain`,
  `pipeline_owner`. **Completely unchanged.** The hook does not touch them, so
  it cannot break the live CRM.
- **External** — everyone else. Denied by default; reaches only an explicit
  allowlist. `distributor` gets `/api/v1/portal` and nothing more.

Deny-by-default is the point. A route added next month is closed to external
users until someone opts it in. A blocklist would fail open, silently. An
unknown or mistyped role is treated as external and gets **nothing** — the safe
direction to fail.

## Scoping

`quote_service.visible_org_ids(org_id)` is a recursive CTE returning an org plus
every descendant. It walks **strictly downwards**, so a distributor sees its
dealers and their sub-dealers, never SGT and never a sibling distributor. The
migration asserts both properties against real rows before committing, including
an explicit check that the parent org does not leak.

Three rules `portal.routes.ts` obeys without exception:

1. **The caller's org is resolved from the database on every request**, keyed on
   the JWT subject — never read from the token. A token is a claim about
   identity, not scope. Moving or deactivating an account takes effect on the
   next request rather than whenever the token expires.
2. Every query is bounded by `visible_org_ids`.
3. **No route accepts an org id from the client** — not as param, query or body.
   There is nothing to tamper with.

No pricing is reachable from the portal. A distributor seeing `dealer_net` would
be a Clause 17 breach, so it simply is not exposed.

## Verified — tested adversarially against a running server

A minted `distributor` token against every sensitive route:

```
/api/v1/leads                    403      /api/v1/erp/customers            403
/api/v1/pipeline                 403      /api/v1/targets/income           403
/api/v1/users                    403      /api/v1/partners/registrations   403
/api/v1/vault/customers          403      /api/v1/partners/orgs            403
/api/v1/vault/documents/meta     403      /api/v1/partners/reference       403
/api/v1/outreach/contacts        403
/api/v1/portal/me                reaches the handler  ✓
```

Bypass attempts, all blocked:

| Attempt | Result |
|---|---|
| `/api/v1/portalsecret` (prefix confusion) | 403 |
| `/api/v1/portal-admin/x` | 403 |
| `/api/v1/leads?x=1` (query string) | 403 |
| `/api/v1/portal/../leads` | 404 |
| `/api/v1/PORTAL/me` (case) | 403 |
| `/api/v1/leads/` (trailing slash) | 403 |
| `//api/v1/leads` (double slash) | 403 |
| Unknown role `some_new_role`, on `/portal` too | 403 — fails closed |
| No token | 401, not 403 — existing behaviour intact |
| Garbage token | 401, hook does not crash |
| `POST /auth/login` | still public |

Director tokens reach everything they did before. Frontend `tsc` clean and
`vite build` succeeds; the only strict errors in the server are 4 pre-existing
implicit-`any`s in `erpnext.ts`, untouched by this round.

**Not verified:** anything needing a real database. The smoke test ran against an
unreachable connection string — which is precisely what proves the policy rejects
*before* any query runs.

## Deploy

```bash
cd ~/sgt-hydroedge-server && npx tsx src/db/migrate_quote_03_user_org.ts
```

Then create the login — note the **partner-specific** script, which refuses an
internal role, refuses a role with no allowlist, refuses a password under 10
characters, and refuses to attach a `distributor` login to an org that is not a
distributor:

```bash
cd ~/sgt-hydroedge-server && npx tsx src/db/create-partner-user.ts someone@continental.example "Their Name" 'a-long-password' EDINGX001 distributor
```

```bash
cd ~/sgt-hydroedge-crm && npm run build && cp -r dist/* /var/www/sgt-crm/ && pm2 restart sgt-api
```

## Test checklist

- [ ] Migration prints `visible_org_ids(EDINGX001) -> 1 org(s)` and confirms SGT is not visible
- [ ] The new login lands directly on "My view" — no sidebar, no director nav
- [ ] It shows Continental Power System · EDINGX001 · Rajasthan territory
- [ ] "Dealers I manage" reads *No dealers yet* — correct, none are approved
- [ ] Signing in as director still shows the full CRM unchanged
- [ ] With the distributor's token, `curl /api/v1/leads` returns 403

## Known limits

- **Continental has no dealers yet**, so the portal will look empty. Dealers
  appear once P6 approves a registration and allots a code. The empty state says
  so.
- **Read-only.** The distributor can see their network, not edit it.
- **Internal roles are still broadly permissive** — `accounts` and
  `supply_chain` can reach `/leads` and the vault. That is pre-existing, was not
  made worse here, and is deliberately out of scope: tightening internal roles
  risks breaking the live CRM and deserves its own round.
- The `EXTERNAL_ROLES` list in `App.tsx` must stay in sync with
  `EXTERNAL_ROLE_ALLOW` in `policy.ts`. The server is authoritative; the frontend
  copy only decides which shell renders.
