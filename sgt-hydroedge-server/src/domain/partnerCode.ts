// =====================================================================
// domain/partnerCode.ts — allotting a partner code.
//
// The single canonical place a code is minted. Nothing else may build one
// by string concatenation, because the counter, the collision check and
// the ledger write have to happen together or not at all.
//
// Scheme, confirmed by the owner 2026-07-27:
//
//   Distributor   ED|IN|GX        prefix EDINGX         padding 3   EDINGX002
//   Dealer        EDINGX001|SS    prefix EDINGX001-SS   padding 2   EDINGX001-SS01
//
// Serials are counted per distributor per type, so EDINGX001-SS01 and
// EDINGX001-SM01 can both exist.
//
// Three rules this file exists to enforce:
//
//  1. NEVER `max(serial) + 1`. The counter row is locked with
//     SELECT … FOR UPDATE inside the caller's transaction, so two
//     concurrent approvals cannot mint the same code.
//
//  2. Codes are never reused. The owner chose "new code on upgrade,
//     retire the old", so a retired code has no live org row to collide
//     with — scanning quote_service.org would happily reissue it. The
//     check is against partner_service.allotted_code, which holds every
//     code ever minted, retired or not.
//
//  3. The series row is created on demand. Only EDINGX001's dealer series
//     were pre-seeded; a future distributor's series must appear the
//     first time someone approves a dealer under them.
// =====================================================================

import type { PoolClient } from 'pg';

export interface AllotArgs {
  partnerType: 'distributor' | 'dealer';
  /** Required when partnerType is 'dealer'. */
  dealerType?: 'SS' | 'SM' | null;
  /** The distributor's code, e.g. EDINGX001. Required for a dealer. */
  parentCode?: string | null;
  country?: string;
  product?: string;
}

export interface AllotResult {
  code: string;
  seriesKey: string;
  serial: number;
}

/** Build the counter identity for a partner. */
export function seriesFor(args: AllotArgs): { seriesKey: string; prefix: string; padding: number } {
  const country = args.country ?? 'IN';
  const product = args.product ?? 'GX';

  if (args.partnerType === 'distributor') {
    return {
      seriesKey: `ED|${country}|${product}`,
      prefix: `ED${country}${product}`,
      padding: 3,
    };
  }

  if (!args.parentCode) throw new Error('a dealer code needs its distributor code');
  if (args.dealerType !== 'SS' && args.dealerType !== 'SM') {
    throw new Error('a dealer code needs dealer_type SS or SM');
  }
  return {
    seriesKey: `${args.parentCode}|${args.dealerType}`,
    prefix: `${args.parentCode}-${args.dealerType}`,
    padding: 2,
  };
}

/**
 * Mint the next code. MUST be called inside an open transaction on
 * `client` — the FOR UPDATE lock is only meaningful until commit.
 */
export async function allotCode(client: PoolClient, args: AllotArgs): Promise<AllotResult> {
  const { seriesKey, prefix, padding } = seriesFor(args);

  // Create the series if this is the first partner in it, then lock it.
  await client.query(
    `insert into partner_service.code_series (series_key, prefix, next_serial, padding)
     values ($1, $2, 1, $3)
     on conflict (series_key) do nothing`,
    [seriesKey, prefix, padding],
  );
  const { rows } = await client.query<{ next_serial: number; prefix: string; padding: number }>(
    `select next_serial, prefix, padding
       from partner_service.code_series
      where series_key = $1
      for update`,
    [seriesKey],
  );
  if (!rows.length) throw new Error(`code series '${seriesKey}' vanished after insert`);

  let serial = rows[0].next_serial;
  const pad = rows[0].padding;
  const pfx = rows[0].prefix;

  // Skip anything already minted. Guards against a hand-created code and
  // against the grandfathered EDINGX001 sitting at serial 1.
  let code = '';
  for (let attempt = 0; ; attempt++) {
    if (attempt > 999) throw new Error(`could not find a free serial in '${seriesKey}'`);
    code = `${pfx}${String(serial).padStart(pad, '0')}`;
    const { rowCount } = await client.query(
      `select 1 from partner_service.allotted_code where code = $1`, [code]);
    if (!rowCount) break;
    serial++;
  }

  if (String(serial).length > pad) {
    throw new Error(
      `series '${seriesKey}' is exhausted at ${pad} digits (serial ${serial}) — widen the padding`);
  }

  await client.query(
    `update partner_service.code_series set next_serial = $2 where series_key = $1`,
    [seriesKey, serial + 1],
  );

  return { code, seriesKey, serial };
}
