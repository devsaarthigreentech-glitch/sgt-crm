# P2 — GSTIN Phase A (structure, checksum, derivation)

Offline GSTIN validation wired into the registration form. **No external call,
no ERPNext call, no credentials, nothing metered.** Phase B (registry lookup for
legal name and address) remains deferred and is deliberately not started.

## What shipped

| File | Change |
|---|---|
| `src/domain/gstin.ts` | New — checksum, structure, derivation |
| `src/domain/partnerValidation.ts` | Now calls `inspectGstin()`; the ad-hoc regex is gone |
| `src/routes/partnerRegistration.routes.ts` | New `POST /partners/gstin/inspect` |
| `src/components/onboarding/onboardingApi.ts` | `inspectGstin()` client |
| `src/components/onboarding/PartnerOnboarding.tsx` | Live feedback + prefill |

## A correction to the spec

`SPEC_partner_onboarding.md` §4.1 states the entity-type character is at
**position 12**. It is not. The PAN occupies positions 3–12, so the PAN's 4th
character — the one encoding entity type — sits at GSTIN **position 6**.
Position 12 is the PAN's *last* character.

```
27 AAPFU0939F 1 Z V
^^ state
   ^^^^^^^^^^ PAN — 4th char 'F' = Firm/LLP   <- position 6
              ^ entity serial
                ^ 'Z'
                  ^ checksum
```

Implemented as the spec described, every partner would derive the wrong
constitution. Built to position 6, and there is a regression test asserting it.

## Behaviour

Typing a 15-character GSTIN triggers a debounced (450 ms) inspection. On success
the form shows `Checksum valid · Rajasthan · PAN AABCC1234D · Company` and
prefills **state, state code, PAN and constitution** — but only where the field
is still empty, so a deliberate override is never silently undone. On failure it
says what is wrong.

Constitution is only suggested where the PAN letter is unambiguous. `F` covers
both Partnership and LLP, so it prefills nothing rather than guessing. Same for
`A`, `B`, `L`, `J`, `G`.

## Verified

Real test runs, not assertions:

- **All 2,625 single-character mutations of 5 valid GSTINs rejected — 100%.**
  Every position, every substitution.
- **All 55 adjacent transpositions rejected — 100%.** This is the class of typo a
  length or regex check cannot catch.
- Three independently published GSTINs accepted: `27AAPFU0939F1ZV`,
  `29AAGCB7383J1Z4`, `24AAACC1206D1ZM`.
- Derivation: state, PAN, entity letter at position 6, entity type,
  constitution hint, ambiguity handled.
- Never throws — empty string, `null`, wrong charset, wrong shape all return a
  structured reason.
- Validator integration: a bad check digit flags **only** `gstin`, and the
  message names the checksum.
- Endpoint tested against a running server: `director` gets the derivation,
  `sales` gets **403**.

### Two things the testing caught

**My placeholder was not a valid GSTIN.** The form previously suggested
`08AABCC1234D1Z5`; its correct check character is `B`. Now `08AABCC1234D1ZB`, so
the example no longer teaches a value its own validator would reject.

**The endpoint 500'd when the database was unreachable.** The checksum needs no
database at all — only the state *name* lookup does. A DB blip taking down the
whole inspection defeats the point of Phase A being dependency-free. The lookup
is now wrapped: inspection returns the full derivation with `stateName: null` and
logs a warning. Confirmed against a deliberately unreachable database.

## Test checklist — after deploying

- [ ] Typing `27AAPFU0939F1ZV` shows the green checksum-valid strip
- [ ] State prefills to Maharashtra (27), PAN to `AAPFU0939F`, entity Firm/LLP
- [ ] Constitution stays empty for that one — `F` is ambiguous by design
- [ ] `08AABCC1234D1ZB` prefills Rajasthan and constitution Private Limited
- [ ] Changing the last character to `5` turns the strip red
- [ ] Prefill does not overwrite a state you already chose
- [ ] Submitting with a bad checksum flags only the GSTIN field

```bash
cd ~/sgt-hydroedge-crm && npm run build && cp -r dist/* /var/www/sgt-crm/ && pm2 restart sgt-api
```

No migration in this round.

## Open — raised from the live screenshot

**Continental Power System already exists as `EDINGX001`** but now also has a
draft registration. If approved as-is, P6 would mint `EDINGX002` and create a
second org for one company.

P6 therefore needs an **"attach to existing org"** path for grandfathered
partners — approval either mints a new code *or* links to an existing org and
backfills its details, never both. There should also be a duplicate check at
submit, keyed on GSTIN, mirroring the GSTIN-first dedup `ensureErpCustomer()`
already uses.

Also noted: the draft's legal name reads "Contiental Power System" — a typo that
would land on the org record and downstream documents.
