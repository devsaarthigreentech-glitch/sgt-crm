// =====================================================================
// domain/fiscalYear.ts — the Indian financial year, in the short form
// the document series use.
//
// One copy, because there are three places that must agree on what
// "202627" means and they are in different languages:
//
//   · erp_create_agreement_doctype.ts, stamping the sample
//   · services/agreements.ts, stamping every agreement the CRM raises
//   · the onload Client Script, for anyone creating one in the ERPNext
//     desk (that one is JavaScript running inside Frappe, so it cannot
//     import this — it is generated FROM this file's rule instead)
//
// When these disagreed, the CRM path left the field empty and the
// document was named "SGT-AG--0313": the series resolved the fiscal-year
// segment to nothing. A naming bug is worth a shared module.
// =====================================================================

/** 1 April. Changing this changes every series that uses the short year. */
export const FY_START_MONTH = 4;

/**
 * The short financial year for a date: 2026-08-03 and 2027-02-10 are both
 * "202627".
 *
 * UTC throughout, deliberately. The server runs in one timezone and the
 * browser in another; a document raised late on 31 March must not land in
 * a different financial year depending on which machine asked.
 */
export function shortFiscalYear(on: string | Date = new Date()): string {
  const d = typeof on === 'string' ? new Date(`${on}T00:00:00Z`) : on;
  const startYear = d.getUTCMonth() + 1 >= FY_START_MONTH
    ? d.getUTCFullYear()
    : d.getUTCFullYear() - 1;
  return `${startYear}${String((startYear + 1) % 100).padStart(2, '0')}`;
}
