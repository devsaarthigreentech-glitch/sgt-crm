// =====================================================================
// migrate_quote_01.ts
// Round 1 of the quotation module: the `quote_service` schema, the org
// tree, the GreenX catalogue, and the two v1.1 price books.
//
// Self-contained by design — no routes, no UI, no app_user changes. It
// touches nothing currently deployed, so it can land on its own.
//
// The whole "enter kVA, get a price" behaviour is a ceiling match on
// covers_upto_kva. The price list says intermediate ratings are covered
// by the next-higher model, so the lookup is `covers_upto_kva >= $kva`
// ordered ascending, limit 1 — not a band with an upper bound. That
// resolver lands in src/domain/quotePricing.ts in Round 4; this round
// only has to make it expressible.
//
// Money is NUMERIC(14,2) throughout and is seeded from string literals,
// never JS numbers, so nothing round-trips through a float.
//
// Run:  npx tsx src/db/migrate_quote_01.ts
// =====================================================================

import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ---------------------------------------------------------------------
// Schema
//
// org_type's CHECK is deliberately left as an inline column constraint so
// Postgres names it `org_org_type_check` — the partner-onboarding module
// drops it by that name to add 'distributor'. Don't rename it.
// ---------------------------------------------------------------------

const ddl = /* sql */ `
create schema if not exists quote_service;

create table if not exists quote_service.org (
  id          serial      primary key,
  code        text        not null unique,
  legal_name  text        not null,
  trade_name  text,
  org_type    text        not null check (org_type in ('sgt','dealer','sub_dealer')),
  parent_id   integer     references quote_service.org(id),
  territory   text,
  gstin       text,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists org_parent_idx on quote_service.org (parent_id);

create table if not exists quote_service.product_model (
  id               serial        primary key,
  product_code     text          not null,
  model_code       text          not null unique,
  rating_label     text          not null,
  covers_upto_kva  numeric(10,2) not null,
  sort_order       integer       not null default 0,
  hsn_code         text,
  default_gst_rate numeric(5,2)  not null default 18.00,
  is_active        boolean       not null default true
);

-- One active model per (family, ceiling). Guarantees the resolver's
-- "order by covers_upto_kva asc limit 1" is deterministic rather than
-- picking arbitrarily between two models with the same ceiling.
create unique index if not exists uq_model_product_ceiling
  on quote_service.product_model (product_code, covers_upto_kva)
  where is_active;

create table if not exists quote_service.price_book (
  id              serial      primary key,
  code            text        not null unique,
  name            text        not null,
  tier            text        not null check (tier in ('mrp','dealer_net','sub_dealer','customer')),
  owner_org_id    integer     not null references quote_service.org(id),
  audience_org_id integer     references quote_service.org(id),
  is_public       boolean     not null default false,
  is_confidential boolean     not null default false,
  currency        text        not null default 'INR',
  version         text,
  effective_from  date,
  effective_to    date,
  status          text        not null default 'draft' check (status in ('draft','active','archived')),
  source_document text,
  notes           text,
  created_at      timestamptz not null default now(),
  created_by      text
);

-- At most one active book per (tier, owner, audience). This is the
-- constraint that stops a second active dealer_net book quietly
-- shadowing the first and making "which price?" ambiguous.
create unique index if not exists uq_pricebook_active
  on quote_service.price_book (tier, owner_org_id, coalesce(audience_org_id, 0))
  where status = 'active';

create table if not exists quote_service.price_line (
  id            serial        primary key,
  price_book_id integer       not null references quote_service.price_book(id) on delete cascade,
  model_id      integer       not null references quote_service.product_model(id),
  unit_price    numeric(14,2) not null,
  floor_price   numeric(14,2),
  gst_rate      numeric(5,2),
  notes         text,
  unique (price_book_id, model_id)
);

create index if not exists price_line_book_idx on quote_service.price_line (price_book_id);
`;

// ---------------------------------------------------------------------
// GreenX catalogue v1.1, effective 2026-07-01.
//
// Dealer net is derived as MRP / 1.68 (the ~40.5% margin note in the
// price list). Every value lands on a round rupee figure, which is what
// makes the derivation safe to rely on — but see the note logged at the
// end of this run: the document itself does not publish the column.
//
// Values are strings so they reach NUMERIC untouched by IEEE-754.
// ---------------------------------------------------------------------

type CatalogueRow = {
  modelCode: string;
  ratingLabel: string;
  coversUptoKva: string;
  mrp: string;
  dealerNet: string;
};

const GREENX: CatalogueRow[] = [
  { modelCode: 'GreenX-25',   ratingLabel: '25',               coversUptoKva: '25',   mrp: '170016',  dealerNet: '101200'  },
  { modelCode: 'GreenX-30',   ratingLabel: '30',               coversUptoKva: '30',   mrp: '186816',  dealerNet: '111200'  },
  { modelCode: 'GreenX-40',   ratingLabel: '40',               coversUptoKva: '40',   mrp: '203616',  dealerNet: '121200'  },
  { modelCode: 'GreenX-50',   ratingLabel: '50',               coversUptoKva: '50',   mrp: '220416',  dealerNet: '131200'  },
  { modelCode: 'GreenX-60',   ratingLabel: '58.5 / 60',        coversUptoKva: '60',   mrp: '277200',  dealerNet: '165000'  },
  { modelCode: 'GreenX-80',   ratingLabel: '82.5',             coversUptoKva: '82.5', mrp: '294000',  dealerNet: '175000'  },
  { modelCode: 'GreenX-100',  ratingLabel: '100',              coversUptoKva: '100',  mrp: '310800',  dealerNet: '185000'  },
  { modelCode: 'GreenX-125',  ratingLabel: '125',              coversUptoKva: '125',  mrp: '327600',  dealerNet: '195000'  },
  { modelCode: 'GreenX-160',  ratingLabel: '160',              coversUptoKva: '160',  mrp: '388080',  dealerNet: '231000'  },
  { modelCode: 'GreenX-180',  ratingLabel: '180',              coversUptoKva: '180',  mrp: '404880',  dealerNet: '241000'  },
  { modelCode: 'GreenX-200',  ratingLabel: '200',              coversUptoKva: '200',  mrp: '421680',  dealerNet: '251000'  },
  { modelCode: 'GreenX-250',  ratingLabel: '250',              coversUptoKva: '250',  mrp: '438480',  dealerNet: '261000'  },
  { modelCode: 'GreenX-320',  ratingLabel: '320',              coversUptoKva: '320',  mrp: '680064',  dealerNet: '404800'  },
  { modelCode: 'GreenX-400',  ratingLabel: '380 / 400',        coversUptoKva: '400',  mrp: '699384',  dealerNet: '416300'  },
  { modelCode: 'GreenX-500',  ratingLabel: '500',              coversUptoKva: '500',  mrp: '871332',  dealerNet: '518650'  },
  { modelCode: 'GreenX-650',  ratingLabel: '625 / 650',        coversUptoKva: '650',  mrp: '890652',  dealerNet: '530150'  },
  { modelCode: 'GreenX-750',  ratingLabel: '750',              coversUptoKva: '750',  mrp: '909972',  dealerNet: '541650'  },
  { modelCode: 'GreenX-1000', ratingLabel: '1010',             coversUptoKva: '1010', mrp: '1105104', dealerNet: '657800'  },
  { modelCode: 'GreenX-1250', ratingLabel: '1250',             coversUptoKva: '1250', mrp: '1190112', dealerNet: '708400'  },
  { modelCode: 'GreenX-1500', ratingLabel: '1500',             coversUptoKva: '1500', mrp: '1317624', dealerNet: '784300'  },
  { modelCode: 'GreenX-1800', ratingLabel: '1700 / 1750 / 1800', coversUptoKva: '1800', mrp: '1572648', dealerNet: '936100' },
  // ⚠ Price inversion, seeded as published — see the warning logged below.
  { modelCode: 'GreenX-2000', ratingLabel: '2000',             coversUptoKva: '2000', mrp: '1386000', dealerNet: '825000'  },
  { modelCode: 'GreenX-2500', ratingLabel: '2500',             coversUptoKva: '2500', mrp: '2040192', dealerNet: '1214400' },
];

const MRP_BOOK = 'GREENX_MRP_V1_1';
const DEALER_BOOK = 'GREENX_DEALERNET_EDINGX001_V1_1';
const SOURCE_DOC = 'GreenX Exclusive Dealer Price List v1.1 (effective 2026-07-01)';

async function main() {
  console.log('▶ quote_01: creating quote_service schema and seeding GreenX v1.1…');
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(ddl);

    // ---- Orgs --------------------------------------------------------
    // `do nothing` rather than `do update`: these rows carry GSTIN and
    // legal-name edits the owner may make by hand, and a re-run of a seed
    // migration has no business reverting them.
    const sgt = await client.query<{ id: number }>(/* sql */ `
      insert into quote_service.org (code, legal_name, trade_name, org_type, territory, is_active)
      values ('SGT', 'SGT HydroEdge', 'SGT HydroEdge', 'sgt', 'India', true)
      on conflict (code) do nothing
      returning id;
    `);
    const sgtId = sgt.rows[0]?.id ?? (
      await client.query<{ id: number }>(`select id from quote_service.org where code = 'SGT'`)
    ).rows[0].id;

    const dealer = await client.query<{ id: number }>(/* sql */ `
      insert into quote_service.org (code, legal_name, trade_name, org_type, parent_id, territory, is_active)
      values ('EDINGX001', 'Continental Power System', 'Continental Power System', 'dealer', $1,
              'Rajasthan + sub-dealers across India', true)
      on conflict (code) do nothing
      returning id;
    `, [sgtId]);
    const dealerId = dealer.rows[0]?.id ?? (
      await client.query<{ id: number }>(`select id from quote_service.org where code = 'EDINGX001'`)
    ).rows[0].id;

    // ---- Catalogue ---------------------------------------------------
    // `do update` here: the catalogue is authoritative in this file, so a
    // re-run should correct drift rather than leave a stale ceiling behind.
    const modelIds = new Map<string, number>();
    for (const [i, m] of GREENX.entries()) {
      const { rows } = await client.query<{ id: number }>(/* sql */ `
        insert into quote_service.product_model
          (product_code, model_code, rating_label, covers_upto_kva, sort_order, default_gst_rate, is_active)
        values ('GreenX', $1, $2, $3, $4, 18.00, true)
        on conflict (model_code) do update
          set rating_label    = excluded.rating_label,
              covers_upto_kva = excluded.covers_upto_kva,
              sort_order      = excluded.sort_order,
              is_active       = true
        returning id;
      `, [m.modelCode, m.ratingLabel, m.coversUptoKva, i + 1]);
      modelIds.set(m.modelCode, rows[0].id);
    }

    // ---- Price books -------------------------------------------------
    async function upsertBook(args: {
      code: string; name: string; tier: string; ownerId: number;
      audienceId: number | null; isPublic: boolean; isConfidential: boolean; notes: string;
    }) {
      const { rows } = await client.query<{ id: number }>(/* sql */ `
        insert into quote_service.price_book
          (code, name, tier, owner_org_id, audience_org_id, is_public, is_confidential,
           currency, version, effective_from, status, source_document, notes, created_by)
        values ($1, $2, $3, $4, $5, $6, $7, 'INR', 'v1.1', date '2026-07-01',
                'active', $8, $9, 'migrate_quote_01')
        on conflict (code) do update set status = 'active'
        returning id;
      `, [args.code, args.name, args.tier, args.ownerId, args.audienceId,
          args.isPublic, args.isConfidential, SOURCE_DOC, args.notes]);
      return rows[0].id;
    }

    const mrpBookId = await upsertBook({
      code: MRP_BOOK,
      name: 'GreenX Suggested List / MRP v1.1',
      tier: 'mrp',
      ownerId: sgtId,
      audienceId: null,
      isPublic: true,
      isConfidential: false,
      notes: 'Clause 17: the only SGT-published figure that may reach an end customer.',
    });

    const dealerBookId = await upsertBook({
      code: DEALER_BOOK,
      name: 'GreenX Dealer Net — EDINGX001 v1.1',
      tier: 'dealer_net',
      ownerId: sgtId,
      audienceId: dealerId,
      isPublic: false,
      isConfidential: true,
      notes: 'Confidential per Clause 17. Derived as MRP / 1.68; not printed in the source PDF.',
    });

    // ---- Price lines -------------------------------------------------
    let lineCount = 0;
    for (const m of GREENX) {
      const modelId = modelIds.get(m.modelCode)!;
      for (const [bookId, price] of [[mrpBookId, m.mrp], [dealerBookId, m.dealerNet]] as const) {
        await client.query(/* sql */ `
          insert into quote_service.price_line (price_book_id, model_id, unit_price, gst_rate)
          values ($1, $2, $3, 18.00)
          on conflict (price_book_id, model_id) do update
            set unit_price = excluded.unit_price,
                gst_rate   = excluded.gst_rate;
        `, [bookId, modelId, price]);
        lineCount++;
      }
    }

    // ---- Verify against reality, not against intent --------------------
    const { rows: [counts] } = await client.query(/* sql */ `
      select (select count(*) from quote_service.org)                                    as orgs,
             (select count(*) from quote_service.product_model where product_code = 'GreenX') as models,
             (select count(*) from quote_service.price_book)                             as books,
             (select count(*) from quote_service.price_line)                             as lines;
    `);

    await client.query('commit');

    console.log('✔ migrate_quote_01 complete:', counts);
    console.log(`  (seeded ${lineCount} price lines this run)`);
    console.log('');
    console.log('  ⚠ GreenX-2000 is seeded as published and inverts the curve:');
    console.log('    GreenX-2000 MRP ₹13,86,000 < GreenX-1800 MRP ₹15,72,648.');
    console.log('    The resolver will therefore quote an 1,850 kVA DG MORE than a 1,950 kVA one.');
    console.log('    Confirm this is intentional in price list v1.1 before Round 4 goes live.');
  } catch (err) {
    await client.query('rollback');
    console.error('✗ migrate_quote_01: failed —', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
