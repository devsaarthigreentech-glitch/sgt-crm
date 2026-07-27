// =====================================================================
// domain/gstin.ts — GSTIN Phase A: structure, checksum, derivation.
//
// Entirely offline. No network call, no credentials, no cost, no
// dependency. A GSTIN is self-describing, so most data-entry errors can
// be caught the moment they are typed.
//
//   position (1-based)  content
//   1-2                 state code
//   3-12                PAN
//   13                  entity serial for that PAN in that state
//   14                  usually 'Z'
//   15                  checksum
//
// NOTE — the handoff spec's table says the entity-type character is at
// position 12. It is not. The PAN occupies positions 3-12, so the PAN's
// 4th character (which encodes entity type) sits at GSTIN position 6,
// i.e. index 5. Position 12 is the PAN's LAST character. Implemented as
// the spec described it, every partner would derive the wrong
// constitution.
//
//   27 AAPFU0939F 1 Z V
//   ^^ state      ^ serial
//      ^^^^^^^^^^ PAN, 4th char 'F' = Firm/LLP  <- position 6
//                   ^ 'Z'
//                     ^ checksum
//
// Phase B (registry lookup for legal name and address) is a separate
// concern and deliberately not here — it needs an external GSP via
// ERPNext, and this module must stay free of that.
// =====================================================================

/** '0'-'9' -> 0..9, 'A'-'Z' -> 10..35. Returns -1 for anything else. */
function charValue(ch: string): number {
  const c = ch.charCodeAt(0);
  if (c >= 48 && c <= 57) return c - 48;        // '0'-'9'
  if (c >= 65 && c <= 90) return c - 65 + 10;   // 'A'-'Z'
  return -1;
}

function valueChar(v: number): string {
  return v < 10
    ? String.fromCharCode(48 + v)
    : String.fromCharCode(65 + v - 10);
}

/**
 * The GSTIN check character, computed from the first 14 characters.
 * Luhn-style over base 36: alternating weights 1 and 2, summing the
 * quotient and remainder of each product against 36.
 */
export function computeCheckChar(first14: string): string | null {
  if (first14.length < 14) return null;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = charValue(first14[i]);
    if (v < 0) return null;
    const product = v * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return valueChar((36 - (sum % 36)) % 36);
}

/** PAN 4th-character -> constitution. */
const ENTITY_TYPE: Record<string, string> = {
  C: 'Company',
  P: 'Individual',
  H: 'HUF',
  F: 'Firm/LLP',
  A: 'AOP',
  T: 'Trust',
  B: 'BOI',
  L: 'Local authority',
  J: 'Artificial juridical person',
  G: 'Government',
};

/**
 * Best-effort mapping from the PAN entity letter to the constitution
 * values the registration form offers. Firm/LLP and a few others are
 * genuinely ambiguous, so those return null rather than guess — the
 * form prefills only when the answer is unambiguous.
 */
const CONSTITUTION_HINT: Record<string, string | null> = {
  C: 'Private Limited',   // could be Public Limited; user can change it
  P: 'Proprietorship',
  H: 'HUF',
  F: null,                // Partnership or LLP — cannot tell from PAN alone
  A: null,
  T: 'Trust',
  B: null,
  L: null,
  J: null,
  G: null,
};

export interface GstinInspection {
  input: string;
  normalized: string;
  valid: boolean;
  /** Populated when valid === false. */
  reason?: 'length' | 'charset' | 'shape' | 'checksum';
  message?: string;
  stateCode?: string;
  pan?: string;
  entityLetter?: string;
  entityType?: string;
  /** Suggested `constitution` value, or null when PAN cannot disambiguate. */
  constitutionHint?: string | null;
  entitySerial?: string;
  expectedCheckChar?: string;
}

const SHAPE = /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z][A-Z0-9]$/;

/**
 * Inspect a GSTIN. Never throws — returns a structured result so callers
 * can decide how loudly to complain.
 */
export function inspectGstin(raw: string): GstinInspection {
  const input = raw ?? '';
  const normalized = String(input).toUpperCase().replace(/\s/g, '');
  const base: GstinInspection = { input, normalized, valid: false };

  if (normalized.length !== 15) {
    return { ...base, reason: 'length', message: 'GSTIN must be exactly 15 characters' };
  }
  for (const ch of normalized) {
    if (charValue(ch) < 0) {
      return { ...base, reason: 'charset', message: 'GSTIN may only contain A-Z and 0-9' };
    }
  }
  if (!SHAPE.test(normalized)) {
    return {
      ...base, reason: 'shape',
      message: 'GSTIN structure is wrong — expected 2 digits, 10-character PAN, then 3 more',
    };
  }

  const stateCode = normalized.slice(0, 2);
  const pan = normalized.slice(2, 12);
  // PAN's 4th char -> GSTIN index 5. See the header note.
  const entityLetter = normalized[5];
  const entitySerial = normalized[12];
  const expected = computeCheckChar(normalized.slice(0, 14));

  const derived = {
    stateCode,
    pan,
    entityLetter,
    entityType: ENTITY_TYPE[entityLetter],
    constitutionHint: CONSTITUTION_HINT[entityLetter] ?? null,
    entitySerial,
    expectedCheckChar: expected ?? undefined,
  };

  if (expected === null || normalized[14] !== expected) {
    return {
      ...base, ...derived,
      reason: 'checksum',
      message: 'Checksum does not match — check for a typo',
    };
  }

  return { ...base, ...derived, valid: true };
}

/** Convenience predicate. */
export const isValidGstin = (raw: string): boolean => inspectGstin(raw).valid;
