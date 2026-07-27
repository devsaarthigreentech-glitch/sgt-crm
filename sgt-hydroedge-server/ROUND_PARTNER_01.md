# P1 — `partner_service` schema

Schema round for partner onboarding. No routes, no UI. Depends on
`migrate_quote_02_org_tiers.ts` and refuses to run without it.

## Run

```bash
cd ~/sgt-hydroedge-server && npx tsx src/db/migrate_partner_01_schema.ts
```

Expected tail:

```
✔ migrate_partner_01_schema complete: { states: '40', series: '3', codes: '1', registrations: '0' }
  next distributor code: EDINGX002   next dealer: EDINGX001-SS01 / -SM01
```

## Tables

```
partner_service.state_code              40 GST state codes (25 and 28 retired but kept)
partner_service.registration            one row per application, both tiers
partner_service.registration_address    warehouse / service centre / branch
partner_service.registration_document   upload checklist
partner_service.code_series             per-series counters, locked FOR UPDATE
partner_service.allotted_code           append-only ledger of every code ever minted
partner_service.gstin_cache             P7
partner_service.registration_event      append-only audit
```

## Deviations from the spec — both deliberate

**1. `registration_document` uses `storage_bucket` + `storage_key`, not
`file_path`.** That is what `document_service.document_version` already does, and
it is what makes the LocalDisk → MinIO swap a config change.

Worth being precise about "reuse the existing document provider": the *provider*
(`StorageProvider` in `src/services/storage.ts`) is reused — there is no second
upload path. The *table* cannot be: `document_service.document` has
`account_id UUID NOT NULL REFERENCES lead_service.accounts(id)`, and an applicant
has no account until approval. Registration documents therefore need their own
table, pointing at the same storage.

**2. `dealer_type` is `'SS'` / `'SM'`,** matching the code tokens and
`quote_service.org.dealer_type`, not the spec's three-value enum. Service-only was
dropped per the owner's confirmation, which also removes the "Dealer: Service"
column from the spec's §5.3 required-fields matrix.

## One design point the spec's two rules collide on

The spec says *enforce `dealer_type` with a check constraint, not application
code*, and also says *draft saves bypass validation entirely*. Taken together
those conflict: a draft dealer who hasn't picked a type yet would be rejected by
the constraint.

Resolved by having the constraint enforce **shape, not completeness**:

```sql
check (partner_type = 'dealer' or dealer_type is null)   -- a distributor may never carry one
check (dealer_type in ('SS','SM'))                       -- allows NULL
```

So a draft dealer with no type saves fine; "a dealer must have a type" is a
submit-time validation in `partnerValidation.ts` (P4). This differs from
`quote_service.org`, where the row only exists post-approval and the type is
genuinely mandatory — that constraint stays strict.

`parent_org_id` is nullable for the same reason.

## Codes

```
Distributor   ED|IN|GX        prefix EDINGX         padding 3   next 002
Dealer        EDINGX001|SS    prefix EDINGX001-SS   padding 2   next 01
              EDINGX001|SM    prefix EDINGX001-SM   padding 2   next 01
```

`prefix + serial.padStart(padding,'0')` reproduces the format exactly, verified
including the grandfathered case (`EDINGX` + serial 1 → `EDINGX001`), which
confirms the series definition is consistent with the code already in the field.

Dealer series are pre-seeded only for EDINGX001, the sole distributor today.
**P6 must create the series row on demand** for any future distributor —
`insert … on conflict do nothing`, then `select … for update` inside the approval
transaction — rather than assume it was pre-seeded.

### Why `allotted_code` exists

The owner chose "mint a new code on type upgrade, retire the old". Two things
follow and neither is optional:

- **Codes change over a partner's life**, so `quote_service.org.code` is not a
  stable key. Nothing may foreign-key to it. Reference `quote_service.org.id`,
  which survives the upgrade — the org keeps its identity, only `code` and
  `dealer_type` change.
- **Uniqueness cannot be checked by scanning live orgs**, because a retired code
  has no live org row to find. `allotted_code`'s primary key is what makes reuse
  structurally impossible. `EDINGX001` is backfilled before any allotment can run.

Capacity: a 2-digit dealer serial caps at 99 per type per distributor.

## Test checklist — run on the droplet

Not executed here (no DB reachable from the dev machine). Type-checks clean under
`strict`; state-code list and code-format generation verified locally.

- [ ] Running without `quote_02` applied fails with the explicit "run
      migrate_quote_02_org_tiers.ts first" error and creates nothing
- [ ] `40` state codes, `08` = Rajasthan, `25` and `28` present but `is_active = false`
- [ ] `code_series` has 3 rows; `ED|IN|GX` sits at `next_serial = 2`
- [ ] `allotted_code` contains exactly `EDINGX001`, linked to its org id
- [ ] Re-running is a no-op and does **not** wind `next_serial` backwards
- [ ] Draft dealer with `dealer_type` null inserts fine
- [ ] `partner_type='distributor'` with `dealer_type='SS'` is rejected
- [ ] `dealer_type='XX'` is rejected

```sql
begin;
-- expect: violates registration_dealer_type_shape
insert into partner_service.registration (partner_type, dealer_type, legal_name)
  values ('distributor','SS','should fail');
rollback;

begin;
-- expect: succeeds (draft dealer, type not chosen yet)
insert into partner_service.registration (partner_type, legal_name)
  values ('dealer','draft ok');
rollback;
```

## Next — P2

GSTIN Phase A: the 15-character derivation and checksum in `src/domain/gstin.ts`,
plus `/partners/gstin/inspect`. Pure logic, no external calls, unit-testable
without a database — so unlike P1 it can be verified properly on the dev machine
before it ships.
