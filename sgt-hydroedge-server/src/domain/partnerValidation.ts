// =====================================================================
// domain/partnerValidation.ts
// Submit-time validation for partner registrations.
//
// Two rules from the spec that shape this whole file:
//
//   1. Draft saves bypass validation ENTIRELY. A half-filled form must
//      always be saveable. Nothing here runs on PATCH — only on submit.
//   2. Errors come back as a field-level map, never a thrown string, so
//      the form can mark individual inputs rather than showing one
//      opaque banner.
//
// Required-field matrix, adapted for the two dealer types that actually
// exist (the spec's service-only column is gone):
//
//   Section                  Distributor   Dealer SM   Dealer SS
//   business identity             y            y           y
//   GSTIN + PAN                   y            y           y
//   banking                       y            y           y
//   territory                     y            y           y
//   sales team size               y            y           y
//   customer segments             y            y           y
//   service engineers             -            -           y
//   workshop / tooling            -            -           y
//   service area coverage         -            -           y
//   DG / electrical experience    -            -           y
//   warehouse address             y            -           -
//
// SM sells only; SS sells and services. Type-specific answers live in
// the `profile` JSONB rather than as nullable columns per type, so this
// matrix can grow without a migration.
//
// Cutting ACROSS that matrix is entity_type. An individual is asked for
// their name, contact and address; the firm-shaped questions are not put
// to them at all. It changes what is ASKED, never what is ALLOWED.
// =====================================================================

import { inspectGstin } from './gstin.js';

export type PartnerType = 'distributor' | 'dealer';
export type DealerType = 'SS' | 'SM';
/**
 * A firm, or a person trading as themselves.
 *
 * Plenty of dealers are individuals — a proprietor with a mobile number
 * and an address and no company behind them. For them `legal_name` is a
 * person's name, there is no trade name or constitution to give, and the
 * address is a home address. What they are asked for changes; what they
 * may do does not.
 */
export type EntityType = 'company' | 'individual';

/** Field path -> human-readable problem. Empty object means valid. */
export type FieldErrors = Record<string, string>;

export interface RegistrationInput {
  partner_type?: string | null;
  dealer_type?: string | null;
  entity_type?: string | null;
  parent_org_id?: number | null;

  legal_name?: string | null;
  constitution?: string | null;

  gstin?: string | null;
  pan?: string | null;
  state_code?: string | null;

  address_line1?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;

  contact_name?: string | null;
  contact_mobile?: string | null;
  contact_email?: string | null;

  bank_account_name?: string | null;
  bank_account_number?: string | null;
  bank_ifsc?: string | null;
  bank_name?: string | null;

  proposed_territory?: string | null;
  customer_segments?: string[] | null;
  product_lines?: string[] | null;

  profile?: Record<string, unknown> | null;
}

// ---- Small helpers ---------------------------------------------------

const blank = (v: unknown): boolean =>
  v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

const emptyList = (v: unknown): boolean =>
  !Array.isArray(v) || v.length === 0;

const PAN_SHAPE = /^[A-Z]{5}\d{4}[A-Z]$/;
const IFSC_SHAPE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const PINCODE_SHAPE = /^\d{6}$/;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_SHAPE = /^[6-9]\d{9}$/;

const req = (
  errs: FieldErrors, field: string, value: unknown, label: string,
) => { if (blank(value)) errs[field] = `${label} is required`; };

/** Capability helpers — the single canonical answer to "what may they do". */
export const canSell = (t: DealerType | null | undefined): boolean =>
  t === 'SS' || t === 'SM';
export const canService = (t: DealerType | null | undefined): boolean =>
  t === 'SS';

// ---- The validator ---------------------------------------------------

export function validateForSubmit(input: RegistrationInput): FieldErrors {
  const errs: FieldErrors = {};

  // ---- Type ----------------------------------------------------------
  const partnerType = input.partner_type as PartnerType | undefined;
  if (partnerType !== 'distributor' && partnerType !== 'dealer') {
    errs.partner_type = 'Choose Distributor or Dealer';
    return errs; // everything below branches on this; stop here.
  }

  const dealerType = (input.dealer_type ?? null) as DealerType | null;
  if (partnerType === 'dealer') {
    // The DB constraint allows NULL so drafts can save; completeness is
    // enforced here, at submit, exactly as the schema comment promises.
    if (dealerType !== 'SS' && dealerType !== 'SM') {
      errs.dealer_type = 'Choose Sales & Service (SS) or Sales & Marketing (SM)';
    }
    if (input.parent_org_id === null || input.parent_org_id === undefined) {
      errs.parent_org_id = 'Select the distributor this dealer applies under';
    }
  } else if (dealerType !== null) {
    errs.dealer_type = 'A distributor cannot have a dealer type';
  }

  // ---- Company or person ---------------------------------------------
  const entityType = (input.entity_type ?? 'company') as EntityType;
  if (entityType !== 'company' && entityType !== 'individual') {
    errs.entity_type = 'Choose Company or Individual';
  }
  const individual = entityType === 'individual';

  // ---- The genuinely required things ---------------------------------
  // Owner's instruction, 2026-07-27: only name, contact details and
  // industry of operations are mandatory. A small dealer may not be GST-
  // registered, may not have a company bank account, and may not have a
  // constitution worth naming yet. Blocking them at submit means they
  // never get onboarded at all.
  //
  // Owner's instruction, 2026-07-30: an INDIVIDUAL needs contact and
  // address details and nothing more. So the address becomes required
  // for a person — it is the only thing locating them — while the
  // industry list, which is a question about a firm's book of business,
  // is not asked of them at all.
  req(errs, 'legal_name', input.legal_name,
      individual ? 'Full name' : 'Legal name');
  req(errs, 'contact_name', input.contact_name, 'Contact name');
  req(errs, 'contact_mobile', input.contact_mobile, 'Contact mobile');
  if (individual) {
    req(errs, 'address_line1', input.address_line1, 'Address');
    req(errs, 'city', input.city, 'City');
    req(errs, 'state', input.state, 'State');
  } else if (emptyList(input.customer_segments)) {
    errs.customer_segments = 'Select at least one industry of operation';
  }

  // ---- Everything else is optional, but must be VALID if supplied ----
  // Optional is not the same as "accept anything". A wrong GSTIN or IFSC
  // is worse than a blank one, because it looks like data.
  if (!blank(input.gstin)) {
    // Structure AND checksum — the arithmetic lives only in gstin.ts.
    const g = inspectGstin(String(input.gstin));
    if (!g.valid) errs.gstin = g.message ?? 'GSTIN is not valid';
  }
  if (!blank(input.pan) && !PAN_SHAPE.test(String(input.pan).toUpperCase().trim())) {
    errs.pan = 'PAN should look like AAAAA9999A';
  }
  if (!blank(input.pincode) && !PINCODE_SHAPE.test(String(input.pincode).trim())) {
    errs.pincode = 'PIN code must be 6 digits';
  }
  if (!blank(input.contact_mobile) &&
      !MOBILE_SHAPE.test(String(input.contact_mobile).replace(/\D/g, '').slice(-10))) {
    errs.contact_mobile = 'Enter a valid 10-digit Indian mobile number';
  }
  if (!blank(input.contact_email) && !EMAIL_SHAPE.test(String(input.contact_email).trim())) {
    errs.contact_email = 'Enter a valid email address';
  }
  if (!blank(input.bank_ifsc) && !IFSC_SHAPE.test(String(input.bank_ifsc).toUpperCase().trim())) {
    errs.bank_ifsc = 'IFSC should look like HDFC0001234';
  }

  return errs;
}

/** Convenience for callers that only need a yes/no. */
export const isSubmittable = (input: RegistrationInput): boolean =>
  Object.keys(validateForSubmit(input)).length === 0;
