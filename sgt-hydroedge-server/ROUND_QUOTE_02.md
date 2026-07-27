# Round 2 — Org tier correction (`quote_service.org`)

Small, self-contained migration that fixes the tier model Round 1 got wrong,
following the owner's confirmation of the partner code scheme on 2026-07-27.

## Decisions confirmed (2026-07-27)

| Question | Answer |
|---|---|
| GreenX-2000 inversion | **Final as published.** The rate card reissued 2026-07-27 still carries MRP ₹13,86,000 below GreenX-1800's ₹15,72,648. |
| Dealer net derivation | **Resolved.** The card now publishes the Dealer Unit Price column explicitly, at 40.48% margin on MRP / 68% markup on dealer price. Matches `MRP ÷ 1.68` on all 23 rows. |
| Is Distributor a new tier or a rename? | **A rename.** `ED` in `EDINGX001` = Exclusive Distributor. Continental Power System is the Distributor, not a Dealer. |
| Billing route | **`sgt_direct` only.** SGT bills the customer and settles the partner's share afterwards. `via_dealer` does not exist. |
| Dealer code on type upgrade | **Issue a new code, retire the old.** Retired codes are never reused. |
| Dealer serial scope | **Per distributor per type.** `EDINGX001-SS01` and `EDINGX001-SM01` may coexist. |

## Rate card verification

The screenshot starts at SR NO 2, so GreenX-25 is not visible — but the card's own
`AVERAGE / TOTAL` row reconciles **only** over 23 rows including GreenX-25 at
₹1,01,200 (dealer avg ₹4,22,015.22, MRP avg ₹7,08,985.57; over 22 rows they come
out ₹4,36,597.73 / ₹7,33,484.18). Row 1 is cropped, not deleted.

All 22 visible dealer/MRP pairs match the Round 1 seed exactly.
**`migrate_quote_01.ts` needs no change.**

## The tier model

```
sgt  ->  distributor  ->  dealer  ->  sub_dealer
SGT      EDINGX001        EDINGX001-SS01
```

## Codes

```
Distributor   {ED}{IN}{GX}{NNN}                 ED|IN|GX|001      -> EDINGX001
Dealer        {distributor}-{SS|SM}{NN}         EDINGX001|SS|01   -> EDINGX001-SS01
```

`SS` = Sales & Service (sells, services). `SM` = Sales & Marketing (sells only).
The handoff spec's third type — service-only — is **not** created; the owner's
list was exhaustive. Add it if a service-only partner ever needs onboarding.
Note this drops the "Dealer: Service" column from the spec's §5.3 required-fields
matrix.

`dealer_type` stores the code token itself (`'SS'` / `'SM'`) so the column and the
code can never disagree.

### Consequences for code allotment (P1/P6)

The owner chose "new code on upgrade", which means the code encodes a *mutable*
attribute and therefore **changes over a partner's life**. Two things follow, and
neither is optional:

1. **`org.code` is not a stable key.** Nothing may foreign-key to it. Every
   reference — price books, quotations, ERPNext links — must point at
   `quote_service.org.id`, which does not change on upgrade. The org row keeps its
   identity; only its `code` and `dealer_type` change.
2. **Reuse must be structurally impossible.** A single append-only ledger, rather
   than scanning live orgs:

   ```
   partner_service.allotted_code
     code text primary key      -- every code ever minted, active or retired
     org_id, series_key, allotted_at, retired_at, reason
   ```

   Allotment inserts here inside the approval transaction; the primary key alone
   guarantees no code is ever reissued. Backfill `EDINGX001` before the first
   allotment so the new series cannot collide with it.

`code_series` then keys on `'ED|IN|GX'` (padding 3) and `'EDINGX001|SS'`
(padding 2), seeded with `next_serial = 2` for the distributor series.

Capacity note: a 2-digit dealer serial caps at 99 dealers per type per
distributor. Fine now; worth knowing.

## Run

```bash
cd ~/sgt-hydroedge-server && npx tsx src/db/migrate_quote_02_org_tiers.ts
```

Widens `org_org_type_check` to include `'distributor'`, adds `dealer_type` with a
CHECK that makes it required for dealers and forbidden for everyone else, re-types
`EDINGX001`, then asserts the code still parses as `ED|IN|GX|001` under parent
`SGT` before committing.

## Test checklist — run on the droplet

Not executed here: the local `.env` is empty and there is no local Postgres or
Docker, so nothing DB-side has been run. Type-checks clean under `strict`.

- [ ] `EDINGX001` reports `org_type = 'distributor'`, `parent = SGT`, `dealer_type` null
- [ ] Re-running the migration prints "already correct" and changes nothing
- [ ] `insert … ('X','X','dealer', null)` is **rejected** (dealer without a type)
- [ ] `insert … ('X','X','distributor', 'SS')` is **rejected** (non-dealer with a type)
- [ ] `insert … ('X','X','dealer', 'ZZ')` is **rejected** (unknown type token)
- [ ] A valid dealer insert with `dealer_type='SS'` and `parent_id` = EDINGX001 succeeds
- [ ] Round 1's counts are untouched: 23 models, 2 books, 46 lines

```sql
-- All five constraint cases in one transaction, rolled back.
begin;
insert into quote_service.org (code, legal_name, org_type, dealer_type)
  values ('T1','t','dealer', null);          -- expect: violates org_dealer_type_check
rollback;
```

## What SGT-direct billing invalidates

Billing via SGT only is not a small flag — it removes the module's original
premise. Recorded here so the next round is not built against a dead spec:

| `SPEC_quote_module.md` | Status |
|---|---|
| §1 mission — white-labelled PDF carrying only the sub-dealer's branding | **Void.** The PDF is SGT-branded. |
| §3.2 ERPNext boundary — never create ERPNext records | **Inverted.** SGT is supplier of record, so Customer + Sales Order are required on acceptance. |
| §3.3 white-labelling absolute | **Void.** |
| §8 PDF test — assert `SGT`/`HydroEdge`/`Continental` absent | **Inverted.** SGT must now *appear*; the test should assert the partner is not presented as the seller. |
| §7.2 book visibility matrix | Collapses. Every customer-facing quote is MRP (Clause 17). `dealer_net` stops being a transacting price and becomes the **commission basis** — still Clause 17 confidential. |
| R3 `selling_entity` | Shrinks to a "prepared by" contact block. Keep the table; drop the branding work. |
| R5 | Much smaller — one branding path, not two. |

`billing_route` is still worth adding to `quotation` with its two-value CHECK, as
the addendum specified: it is cheap and it records intent per quotation. Only
`sgt_direct` gets an implementation.

Tax follows SGT's state code, not the partner's.

## Still open — not blocking the next round

1. **Commission terms.** "Later we will give them their share" fixes the *route*
   but not the *terms*: rate, and whether it accrues on invoice or on collection.
   Needed before any commission accrual is modelled, not before R2–R5.
2. **The rate card is written as a reseller document** — "Dealer price is NET
   (without GST)", "Dealer Margin per Unit" — but under SGT-direct billing the
   partner never buys the goods, so that column is a commission basis, not a
   purchase price. The figures are unaffected. The *document* should probably be
   relabelled, and per the addendum this shifts the partner from trading margin to
   commission income, which changes their GST position and may bring TDS under
   s.194H into play. **Flagged, not resolved — this needs the CA, not this module.**
3. **Do sub-dealers still exist?** `'sub_dealer'` is kept in the enum. The owner's
   tier logic stopped at Dealer. If sub-dealers are gone, say so and the enum can
   be tightened.
