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
// =====================================================================

export type PartnerType = 'distributor' | 'dealer';
export type DealerType = 'SS' | 'SM';

/** Field path -> human-readable problem. Empty object means valid. */
export type FieldErrors = Record<string, string>;

export interface RegistrationInput {
  partner_type?: string | null;
  dealer_type?: string | null;
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

/**
 * Structural GSTIN shape only — 2 digits, 10-char PAN, entity digit, a
 * letter (normally Z), then the check character.
 *
 * The CHECKSUM is deliberately not verified here. That lands in
 * src/domain/gstin.ts (P2) and this function will call it, so that the
 * arithmetic lives in exactly one place.
 */
const GSTIN_SHAPE = /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z]\d$|^\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z][A-Z0-9]$/;
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

  // ---- Business identity (all types) ---------------------------------
  req(errs, 'legal_name', input.legal_name, 'Legal name');
  req(errs, 'constitution', input.constitution, 'Constitution');

  // ---- Tax identity (all types) --------------------------------------
  req(errs, 'gstin', input.gstin, 'GSTIN');
  if (!blank(input.gstin)) {
    const g = String(input.gstin).toUpperCase().trim();
    if (g.length !== 15) errs.gstin = 'GSTIN must be exactly 15 characters';
    else if (!GSTIN_SHAPE.test(g)) errs.gstin = 'GSTIN format looks wrong';
  }
  req(errs, 'pan', input.pan, 'PAN');
  if (!blank(input.pan) && !PAN_SHAPE.test(String(input.pan).toUpperCase().trim())) {
    errs.pan = 'PAN should look like AAAAA9999A';
  }

  // ---- Address (all types) -------------------------------------------
  req(errs, 'address_line1', input.address_line1, 'Address');
  req(errs, 'city', input.city, 'City');
  req(errs, 'state', input.state, 'State');
  req(errs, 'pincode', input.pincode, 'PIN code');
  if (!blank(input.pincode) && !PINCODE_SHAPE.test(String(input.pincode).trim())) {
    errs.pincode = 'PIN code must be 6 digits';
  }

  // ---- Contact (all types) -------------------------------------------
  req(errs, 'contact_name', input.contact_name, 'Contact name');
  req(errs, 'contact_mobile', input.contact_mobile, 'Contact mobile');
  if (!blank(input.contact_mobile) &&
      !MOBILE_SHAPE.test(String(input.contact_mobile).replace(/\D/g, '').slice(-10))) {
    errs.contact_mobile = 'Enter a valid 10-digit Indian mobile number';
  }
  req(errs, 'contact_email', input.contact_email, 'Contact email');
  if (!blank(input.contact_email) && !EMAIL_SHAPE.test(String(input.contact_email).trim())) {
    errs.contact_email = 'Enter a valid email address';
  }

  // ---- Banking (all types) -------------------------------------------
  req(errs, 'bank_account_name', input.bank_account_name, 'Account holder name');
  req(errs, 'bank_account_number', input.bank_account_number, 'Account number');
  req(errs, 'bank_name', input.bank_name, 'Bank name');
  req(errs, 'bank_ifsc', input.bank_ifsc, 'IFSC');
  if (!blank(input.bank_ifsc) && !IFSC_SHAPE.test(String(input.bank_ifsc).toUpperCase().trim())) {
    errs.bank_ifsc = 'IFSC should look like HDFC0001234';
  }

  // ---- Commercial ----------------------------------------------------
  if (emptyList(input.product_lines)) {
    errs.product_lines = 'Select at least one product line';
  }

  const profile = input.profile ?? {};
  const sells = partnerType === 'distributor' || canSell(dealerType);
  const services = partnerType === 'dealer' && canService(dealerType);

  if (sells) {
    req(errs, 'proposed_territory', input.proposed_territory, 'Proposed territory');
    if (emptyList(input.customer_segments)) {
      errs.customer_segments = 'Select at least one customer segment';
    }
    req(errs, 'profile.sales_team_size', profile.sales_team_size, 'Sales team size');
  }

  if (services) {
    req(errs, 'profile.service_engineers_count', profile.service_engineers_count,
        'Number of service engineers');
    req(errs, 'profile.workshop_details', profile.workshop_details,
        'Workshop and tooling details');
    req(errs, 'profile.service_area_coverage', profile.service_area_coverage,
        'Service area coverage');
    req(errs, 'profile.dg_experience', profile.dg_experience,
        'DG / electrical experience');
  }

  // Distributors hold stock; dealers do not.
  if (partnerType === 'distributor') {
    req(errs, 'profile.warehouse_address', profile.warehouse_address,
        'Warehouse address');
  }

  return errs;
}

/** Convenience for callers that only need a yes/no. */
export const isSubmittable = (input: RegistrationInput): boolean =>
  Object.keys(validateForSubmit(input)).length === 0;
