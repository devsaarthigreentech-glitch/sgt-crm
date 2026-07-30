// =====================================================================
// domain/quoteSpec.ts — the optional product specification on a line.
//
// A GreenX quotation names a model and a rate. What it has never carried
// is what the customer is actually buying: whose engine, whose
// alternator, which controller, how big the thing is and what it weighs.
// That lives today in a separate PDF spec sheet, which means the
// quotation and the specification are two documents that can disagree.
//
// This module is the ONE definition of those fields. The form is
// generated from SPEC_FIELDS (served by GET /quotes/spec-fields), the
// printed block is rendered from SPEC_FIELDS, and the stored snapshot is
// keyed by SPEC_FIELDS. Adding a field is a single edit here — which
// matters, because these fields WILL be revised.
//
// Every field is optional, always. A spec is a courtesy to the reader,
// never a gate on raising a quotation.
//
// HOW IT REACHES THE CUSTOMER
// The block is appended to the ERPNext Quotation Item's `description`.
// That is the field every stock print format already renders under the
// item name, so the specification prints without a custom print format
// and without a second document to keep in step.
// =====================================================================

export type SpecGroup = 'Machine' | 'Engine' | 'Alternator' | 'Controls' | 'Dimensions';

export interface SpecField {
  /** Key in the stored object, and the name the form input carries. */
  key: string;
  label: string;
  group: SpecGroup;
  /** Shown greyed in the input. Taken from a real Cummins spec sheet. */
  placeholder?: string;
  /** Rendered after the value on the printed line, e.g. "mm". */
  unit?: string;
  /** Numeric fields get a number input and are formatted with a unit. */
  numeric?: boolean;
}

// Vocabulary follows the manufacturer's own spec sheets, so a sales
// person copying from one is not translating as they go.
export const SPEC_FIELDS: SpecField[] = [
  { key: 'gensetModel',     label: 'Genset model',      group: 'Machine',    placeholder: 'CI 250D5P' },
  { key: 'ratingLabel',     label: 'Rating',            group: 'Machine',    placeholder: '250 kVA / 200 kWe Prime' },
  { key: 'supply',          label: 'Supply',            group: 'Machine',    placeholder: '3 Phase, 415 V, 50 Hz, 0.8 PF (lagging)' },
  { key: 'emissionNorm',    label: 'Emission norm',     group: 'Machine',    placeholder: 'CPCB IV+' },
  { key: 'enclosure',       label: 'Enclosure',         group: 'Machine',    placeholder: 'Acoustic canopy, weatherproof' },

  { key: 'engineMake',      label: 'Engine make',       group: 'Engine',     placeholder: 'Cummins' },
  { key: 'engineModel',     label: 'Engine model',      group: 'Engine',     placeholder: 'QSB6.7 series' },
  { key: 'engineDetail',    label: 'Engine detail',     group: 'Engine',     placeholder: '6 cylinder, in-line, 4 stroke, radiator cooled' },

  { key: 'alternatorMake',  label: 'Alternator make',   group: 'Alternator', placeholder: 'Stamford' },
  { key: 'alternatorModel', label: 'Alternator model',  group: 'Alternator', placeholder: 'S3L1D' },
  { key: 'alternatorDetail',label: 'Alternator detail', group: 'Alternator', placeholder: 'Brushless, self-excited, IS/IEC 60034-1' },

  { key: 'controller',      label: 'Controller',        group: 'Controls',   placeholder: 'PowerStart PS0602' },
  { key: 'soundLevel',      label: 'Sound level',       group: 'Controls',   placeholder: '75', unit: 'dBA @ 1 m', numeric: true },

  { key: 'lengthMm',        label: 'Length',            group: 'Dimensions', placeholder: '4050', unit: 'mm', numeric: true },
  { key: 'widthMm',         label: 'Width',             group: 'Dimensions', placeholder: '1350', unit: 'mm', numeric: true },
  { key: 'heightMm',        label: 'Height',            group: 'Dimensions', placeholder: '2000', unit: 'mm', numeric: true },
  { key: 'weightKg',        label: 'Weight',            group: 'Dimensions', placeholder: '3180', unit: 'kg', numeric: true },
  { key: 'fuelTankL',       label: 'Fuel tank',         group: 'Dimensions', placeholder: '395', unit: 'litre', numeric: true },
  { key: 'defTankL',        label: 'DEF tank',          group: 'Dimensions', placeholder: '60', unit: 'litre', numeric: true },

  { key: 'notes',           label: 'Additional notes',  group: 'Machine',    placeholder: 'Anything else this customer should see on the line' },
];

const BY_KEY = new Map(SPEC_FIELDS.map(f => [f.key, f]));

export type ProductSpec = Record<string, string>;

/**
 * Keep the known keys, drop blanks, trim, and cap length.
 *
 * Unknown keys are DISCARDED rather than rejected: this object is typed
 * by hand into a form that will grow fields, and an old client sending a
 * retired key must not fail to create a quotation over it.
 */
export function cleanSpec(input: unknown): ProductSpec | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const out: ProductSpec = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!BY_KEY.has(k)) continue;
    const s = String(v ?? '').trim();
    if (!s) continue;
    out[k] = s.slice(0, 300);
  }
  return Object.keys(out).length ? out : null;
}

/** "4050 × 1350 × 2000 mm" when all three are present, else null. */
function dimensionLine(spec: ProductSpec): string | null {
  const { lengthMm, widthMm, heightMm } = spec;
  if (!lengthMm || !widthMm || !heightMm) return null;
  return `${lengthMm} × ${widthMm} × ${heightMm} mm`;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The specification block for an ERPNext Quotation Item description.
 *
 * Rendered as a definition list of "Label: value" lines rather than a
 * table: item descriptions land inside a print format's own table cell,
 * and a nested table breaks the column widths on every stock format.
 *
 * Returns null when nothing was filled in, so the caller can leave
 * `description` untouched and let ERPNext use the Item master's own.
 */
export function renderSpecHtml(spec: ProductSpec | null | undefined): string | null {
  if (!spec || !Object.keys(spec).length) return null;

  const dims = dimensionLine(spec);
  const rows: string[] = [];

  for (const f of SPEC_FIELDS) {
    // The three dimensions collapse into one line when complete.
    if (dims && (f.key === 'lengthMm' || f.key === 'widthMm' || f.key === 'heightMm')) {
      if (f.key === 'lengthMm') rows.push(`<div><b>Dimensions (L × W × H):</b> ${esc(dims)}</div>`);
      continue;
    }
    const v = spec[f.key];
    if (!v) continue;
    const unit = f.unit ? ` ${f.unit}` : '';
    rows.push(`<div><b>${esc(f.label)}:</b> ${esc(v)}${esc(unit)}</div>`);
  }

  if (!rows.length) return null;
  return `<div class="sgt-spec">${rows.join('')}</div>`;
}

/** A one-line summary for our own list screens. Never printed. */
export function specSummary(spec: ProductSpec | null | undefined): string | null {
  if (!spec) return null;
  const bits = [
    spec.gensetModel,
    [spec.engineMake, spec.engineModel].filter(Boolean).join(' '),
    [spec.alternatorMake, spec.alternatorModel].filter(Boolean).join(' '),
  ].map(x => String(x ?? '').trim()).filter(Boolean);
  return bits.length ? bits.join(' · ') : null;
}
