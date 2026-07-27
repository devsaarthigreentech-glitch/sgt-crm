# Round 1 — Quotation module foundations (`quote_service`)

Schema + GreenX catalogue + tiered price books. No routes, no UI, no `app_user`
changes. Nothing currently deployed is touched.

> This note supersedes the `ROUND_QUOTE_01.md` that shipped with the handoff.
> That version described a file layout and import path this repo does not use —
> see **Corrections** below.

## Corrections to the handoff docs

The handoff assumed Round 1 was already built. It was not — there was no
`migrate_quote_01.ts` and no `quote_service` schema anywhere in the repo. Four
further points were wrong against the deployed code:

| Handoff said | Actually |
|---|---|
| `src/db/migrations/migrate_quote_01.ts` | No `migrations/` subdir exists. Migrations sit flat in `src/db/`. |
| `import { pool } from '../pool.js'`, "matching `migrate_outreach_09.ts`" | `migrate_outreach_09.ts` doesn't import the shared pool at all. House style is a local `new Pool({ connectionString: process.env.DATABASE_URL })`. |
| `lead_id -> lead_service.<leads table>(id)` | The table is `lead_service.leads` and its `id` is **UUID**, not integer. (`lead_service.accounts` is the *company* it hangs off, also UUID — don't confuse them.) Matters in R5. |
| `ROLES_SEE_ALL` is in `src/auth/guard.ts` | It's in `src/routes/leads.ts:21`, value `['director']`. `guard.ts` only has `requireAuth` / `requireRole`. Matters in R2 and P3. |

Also worth knowing: `sgt-hydroedge-server/tconfig.json` is misspelled (missing
the `s`), so `npm run build` has never worked. That is consistent with "runtime
is tsx, no compile step" and is left alone — but it means nothing type-checks on
save. This migration was type-checked explicitly under `strict` before shipping.

## Run

```bash
cd ~/sgt-hydroedge-server && npx tsx src/db/migrate_quote_01.ts
```

Expected tail:

```
✔ migrate_quote_01 complete: { orgs: '2', models: '23', books: '2', lines: '46' }
```

## What it creates

```
quote_service.org            SGT -> EDINGX001 (Continental Power System)
quote_service.product_model  23 GreenX models, keyed on covers_upto_kva
quote_service.price_book     GREENX_MRP_V1_1 (public, active)
                             GREENX_DEALERNET_EDINGX001_V1_1 (confidential, active)
quote_service.price_line     23 MRP + 23 dealer net
```

`org_type`'s CHECK is left as an inline column constraint so Postgres names it
`org_org_type_check` — the partner-onboarding module (P1) drops it by that exact
name to add `'distributor'`. Don't rename it.

## Verification status — read this

I could not run this against PostgreSQL. The local `.env` is empty (0 bytes) and
there is no local Postgres or Docker on this machine, so the DB is only reachable
from the droplet. **The DB-side checks below have not been executed and must be
run on the box.**

What *was* verified here, for real:

- Type-checks clean under `strict` (`target ES2022`, `module CommonJS`).
- All eight data-dependent checklist rows, by simulating the R4 resolver
  (`covers_upto_kva >= $kva order by covers_upto_kva asc limit 1`) against the
  seeded catalogue. All pass.
- `covers_upto_kva` is unique across the 23 models, so `uq_model_product_ceiling`
  will not reject the seed and the resolver's `limit 1` is deterministic.
- `sort_order` matches ascending ceiling.
- **Dealer net equals `MRP / 1.68` exactly, on all 23 rows, in integer
  arithmetic** — no rounding anywhere. See open question 2.

## Test checklist — run on the droplet after migrating

The resolver cases are already confirmed against the seed data; re-running them
in SQL confirms the DDL executed as intended.

```sql
-- Resolver: MRP book. Expect GreenX-25, -30, -80, -100, -1000, then zero rows.
select $kva as asked, pm.model_code, pm.rating_label, pm.covers_upto_kva, pl.unit_price
  from quote_service.product_model pm
  join quote_service.price_line pl on pl.model_id = pm.id
  join quote_service.price_book pb on pb.id = pl.price_book_id
 where pm.is_active and pm.product_code = 'GreenX'
   and pm.covers_upto_kva >= $kva
   and pb.code = 'GREENX_MRP_V1_1' and pb.status = 'active'
 order by pm.covers_upto_kva asc limit 1;
```

- [ ] `25` → GreenX-25 (exact boundary hits its own model, not the next one)
- [ ] `26` → GreenX-30
- [ ] `70` → GreenX-80 (covers_upto 82.5)
- [ ] `83` → GreenX-100
- [ ] `1000` → GreenX-1000, `rating_label` reads `1010`
- [ ] `2501` → zero rows
- [ ] MRP book returns `310800.00` for `100`
- [ ] Dealer net book (`GREENX_DEALERNET_EDINGX001_V1_1`) returns `185000.00` for `100`

Then the two structural checks:

```sql
-- Idempotency: re-run the migration, counts must not move.
-- Expect (2, 23, 2, 46) both times.
select (select count(*) from quote_service.org) orgs,
       (select count(*) from quote_service.product_model) models,
       (select count(*) from quote_service.price_book) books,
       (select count(*) from quote_service.price_line) lines;

-- uq_pricebook_active must reject a second active dealer_net book for EDINGX001.
-- Expect: ERROR duplicate key value violates unique constraint "uq_pricebook_active"
begin;
insert into quote_service.price_book
  (code, name, tier, owner_org_id, audience_org_id, status)
select 'TMP_DUPE', 'should fail', 'dealer_net', owner_org_id, audience_org_id, 'active'
  from quote_service.price_book where code = 'GREENX_DEALERNET_EDINGX001_V1_1';
rollback;
```

- [ ] Re-running the migration is a no-op
- [ ] `uq_pricebook_active` rejects the duplicate

## Two decisions still open before Round 4

1. **GreenX-2000 price inversion.** MRP ₹13,86,000 sits below GreenX-1800's
   ₹15,72,648. Seeded as published, so the resolver will quote an 1,850 kVA DG
   *more* than a 1,950 kVA one. The migration prints a warning on every run.
   Intentional, or a typo in v1.1?

2. **Dealer net absent from the PDF.** Section 2 is titled "Special Exclusive
   Dealer Pricing" but publishes only MRP; the dealer price exists only via the
   40.5% margin note. I verified the derivation holds exactly — `MRP / 1.68`
   reproduces all 23 seeded figures on whole rupees with zero remainder, which
   is not something that happens by accident. The values are almost certainly
   right, but v1.2 should carry the column explicitly since this is what the
   dealer countersigns.

## Round 2 preview

Org scoping and the confidentiality guarantee: `org_id` on `lead_service.app_user`
(note: `id` is `bigserial`, so the FK to `quote_service.org.id` crosses
`bigint`→`integer` — pick one and be deliberate), plus `visibleOrgIds(userId)` as
a recursive CTE that every price and quotation query routes through.

Highest-risk piece in the module: a leak there is a Clause 17 breach, not a bug.
It gets its own round with nothing else in it. Note that the role gate to imitate
lives in `src/routes/leads.ts`, not `guard.ts`, and there is currently no
route-whitelist mechanism — R2 will need to add one rather than extend one.
