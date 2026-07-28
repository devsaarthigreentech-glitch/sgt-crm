// =====================================================================
// domain/quotePricing.ts — "enter kVA, get a model".
//
// THE single canonical location for pricing resolution. Do not
// reimplement this in a route, a service, or the frontend. If a screen
// needs a live preview it calls the endpoint.
//
// Why this exists at all when ERPNext owns quotations: ERPNext has no
// concept of "this model covers DG ratings up to 82.5 kVA". Its Item
// master is a flat list. The ceiling match is ours; the RATE is
// ERPNext's, read from Item Price at resolve time so the number a user
// sees is the number the quotation will carry.
//
// The price list says "intermediate ratings are covered by the
// next-higher model", so this is a ceiling match, not a band:
//
//   covers_upto_kva >= asked   order by covers_upto_kva asc   limit 1
//
// Boundaries: 25 -> GreenX-25 (an exact rating hits its own model),
// 26 -> GreenX-30, 70 -> GreenX-80 (covers 82.5), 83 -> GreenX-100.
// Above 2500 kVA there is no model: that returns a structured
// `resolved: false`, NOT an error, because "route this to SGT for a
// special quote" is a normal business outcome and the UI should say so.
// =====================================================================

import { query } from '../db/pool.js';

export interface ResolvedModel {
  resolved: true;
  modelId: number;
  modelCode: string;
  ratingLabel: string;
  coversUptoKva: string;
  /** Rate ERPNext will actually use. Null when ERPNext has no Item Price. */
  rate: string | null;
  rateSource: 'erpnext' | 'price_book' | 'none';
  /** Our seeded MRP, kept for comparison. */
  priceBookMrp: string | null;
  /**
   * True when ERPNext's Item Price and our price book disagree. Not an
   * error — but it means the two have drifted and someone should look.
   */
  rateMismatch: boolean;
  gstRate: string;
  hsnCode: string | null;
}

export interface UnresolvedModel {
  resolved: false;
  reason: 'above_catalogue' | 'invalid_input';
  message: string;
  maxKva?: string;
}

export type Resolution = ResolvedModel | UnresolvedModel;

/** Fetches the ERPNext Item Price for a code. Never throws — returns null. */
type RateLookup = (itemCode: string) => Promise<string | null>;

export async function resolveForKva(
  kvaInput: unknown,
  opts: { productCode?: string; priceBookCode?: string; erpRate?: RateLookup } = {},
): Promise<Resolution> {
  const productCode = opts.productCode ?? 'GreenX';
  const priceBookCode = opts.priceBookCode ?? 'GREENX_MRP_V1_1';

  const kva = Number(kvaInput);
  if (!Number.isFinite(kva) || kva <= 0) {
    return {
      resolved: false,
      reason: 'invalid_input',
      message: 'Enter the DG rating in kVA as a positive number.',
    };
  }

  const { rows } = await query(
    `select pm.id, pm.model_code, pm.rating_label, pm.covers_upto_kva::text as covers_upto_kva,
            pm.hsn_code, coalesce(pl.gst_rate, pm.default_gst_rate)::text as gst_rate,
            pl.unit_price::text as mrp
       from quote_service.product_model pm
       left join quote_service.price_line pl on pl.model_id = pm.id
       left join quote_service.price_book pb
              on pb.id = pl.price_book_id and pb.code = $3 and pb.status = 'active'
      where pm.is_active
        and pm.product_code = $1
        and pm.covers_upto_kva >= $2
      order by pm.covers_upto_kva asc
      limit 1`,
    [productCode, kva, priceBookCode],
  );

  if (!rows.length) {
    const { rows: max } = await query(
      `select max(covers_upto_kva)::text as m
         from quote_service.product_model
        where is_active and product_code = $1`, [productCode]);
    return {
      resolved: false,
      reason: 'above_catalogue',
      message:
        `No ${productCode} model covers ${kva} kVA — the catalogue tops out at ` +
        `${max[0]?.m ?? '2500'} kVA. Route this to SGT for a special quote.`,
      maxKva: max[0]?.m ?? undefined,
    };
  }

  const r = rows[0];
  const priceBookMrp: string | null = r.mrp ?? null;

  // ERPNext owns the rate. Ask it; fall back to our book only if it has none.
  let rate: string | null = null;
  let rateSource: ResolvedModel['rateSource'] = 'none';
  if (opts.erpRate) {
    try {
      const erp = await opts.erpRate(r.model_code);
      if (erp !== null) { rate = erp; rateSource = 'erpnext'; }
    } catch {
      // A pricing lookup failure must not break resolution — the model is
      // still correct and the UI can show it without a number.
    }
  }
  if (rate === null && priceBookMrp !== null) {
    rate = priceBookMrp;
    rateSource = 'price_book';
  }

  const mismatch =
    rateSource === 'erpnext' && priceBookMrp !== null &&
    Math.abs(Number(rate) - Number(priceBookMrp)) > 0.005;

  return {
    resolved: true,
    modelId: r.id,
    modelCode: r.model_code,
    ratingLabel: r.rating_label,
    coversUptoKva: r.covers_upto_kva,
    rate,
    rateSource,
    priceBookMrp,
    rateMismatch: mismatch,
    gstRate: r.gst_rate ?? '18.00',
    hsnCode: r.hsn_code ?? null,
  };
}
