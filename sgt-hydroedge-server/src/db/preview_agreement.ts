/// <reference types="node" />
// =====================================================================
// preview_agreement.ts
// See exactly what a dealer agreement will look like — with names you
// type — WITHOUT onboarding anyone.
//
//   PRODUCT=GreenDrive DEALER="Test Motors" DISTRIBUTOR="Test Distributors" \
//     npx tsx src/db/preview_agreement.ts
//
// What it does, in order:
//   1. creates ONE draft "SGT Dealer Agreement" in ERPNext from the names
//      below and the current default body for that product line
//   2. downloads ERPNext's rendered PDF to a file
//   3. DELETES the draft again — always, even if step 2 failed
//
// What it does NOT touch: no partner record, no code (EDINGD001 stays
// unused), no login, no CRM agreement row, no email. Nothing appears in
// any CRM list. The draft's number comes back too, because Frappe reverts
// a naming series when the newest document in it is deleted.
//
// The PDF is real ERPNext output from the live print format, so what you
// see is what a dealer would receive. For the GreenDrive wording in the
// subtitle, appointment paragraph and sticker, the print format must
// already be updated:  CONFIRM_CREATE=1 npx tsx src/db/erp_create_agreement_doctype.ts
// The script checks and warns if it is not.
//
// Every value is optional; anything left out gets a placeholder:
//
//   PRODUCT          GreenDrive (default) or GreenX
//   DEALER           dealer legal name
//   DEALER_TYPE      SS (default) or SM
//   DEALER_CODE      default EDINGD001-SS01 / EDINGX001-SS01
//   DEALER_ADDRESS, DEALER_GSTIN, DEALER_SIGNATORY, DEALER_EMAIL,
//   DEALER_MOBILE, DEALER_AREA
//   DISTRIBUTOR      distributor legal name
//   DISTRIBUTOR_CODE default EDINGD001 / EDINGX001
//   DISTRIBUTOR_REGION, DISTRIBUTOR_ADDRESS, DISTRIBUTOR_SIGNATORY
//   OUT              where to write the PDF (default ./agreement-preview.pdf)
//   KEEP=1           leave the draft in ERPNext to inspect it there
// =====================================================================

import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createAgreementDoc, fetchAgreementPdf, deleteAgreementDoc, getAgreementDoc,
  type AgreementFields,
} from '../services/erpAgreement.js';
import { defaultAgreementBody } from '../domain/agreementBody.js';
import { shortFiscalYear } from '../domain/fiscalYear.js';

const env = (k: string, fallback: string | null = null) => {
  const v = String(process.env[k] ?? '').trim();
  return v || fallback;
};

const PRODUCT = env('PRODUCT', 'GreenDrive') === 'GreenX' ? 'GreenX' : 'GreenDrive';
const SEG = PRODUCT === 'GreenDrive' ? 'GD' : 'GX';
const DEALER_TYPE = env('DEALER_TYPE', 'SS') === 'SM' ? 'SM' : 'SS';
const DIST_CODE = env('DISTRIBUTOR_CODE', `EDIN${SEG}001`)!;
const DEALER_CODE = env('DEALER_CODE', `${DIST_CODE}-${DEALER_TYPE}01`)!;
const OUT = resolve(env('OUT', 'agreement-preview.pdf')!);
const KEEP = process.env.KEEP === '1';

if (!process.env.ERPNEXT_URL || !process.env.ERPNEXT_API_KEY || !process.env.ERPNEXT_API_SECRET) {
  console.error('✗ ERPNEXT_URL / ERPNEXT_API_KEY / ERPNEXT_API_SECRET must be set — run this on the server.');
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);

const fields: AgreementFields = {
  agreement_status: 'Draft',
  effective_date: today,
  custom_short_fiscal_year: shortFiscalYear(today),
  product_line: PRODUCT,
  raised_by: 'preview',
  raised_via: 'preview script — not a real agreement',

  distributor_name: env('DISTRIBUTOR', 'Sample Distributor Pvt Ltd'),
  distributor_code: DIST_CODE,
  distributor_region: env('DISTRIBUTOR_REGION', 'Rajasthan'),
  distributor_address: env('DISTRIBUTOR_ADDRESS', 'Distributor address, City 000000'),
  distributor_signatory: env('DISTRIBUTOR_SIGNATORY', 'Authorised Signatory Name'),
  distributor_signatory_designation: 'Director',
  distributor_sign_name: env('DISTRIBUTOR_SIGNATORY', 'Authorised Signatory Name'),
  distributor_sign_designation: 'Authorised Signatory',

  dealer_name: env('DEALER', 'Sample Dealer'),
  dealer_code: DEALER_CODE,
  dealer_type: DEALER_TYPE,
  dealer_constitution: 'a proprietorship concern',
  dealer_gstin: env('DEALER_GSTIN'),
  dealer_operating_area: env('DEALER_AREA', 'Jaipur, Rajasthan'),
  dealer_address: env('DEALER_ADDRESS', 'Dealer address, City 000000'),
  dealer_signatory: env('DEALER_SIGNATORY', 'Proprietor Name'),
  dealer_signatory_designation: 'Proprietor',
  dealer_email: env('DEALER_EMAIL', 'dealer@example.com'),
  dealer_mobile: env('DEALER_MOBILE', '+91-00000 00000'),

  // SGT's real signatory, as seeded by migrate_agreement_01.ts, so the
  // signature block renders the way it will on a real agreement.
  sgt_signatory: 'Alok Kumar',
  sgt_signatory_designation: 'Managing Director',
  sgt_signature_url: '/files/sign.jpg',

  agreement_body: defaultAgreementBody(
    { distributorCode: DIST_CODE, dealerCode: DEALER_CODE, dealerType: DEALER_TYPE },
    PRODUCT),
};

async function main() {
  console.log(`▶ Previewing a ${PRODUCT} agreement: ${fields.dealer_name} (${DEALER_CODE}) ` +
              `under ${fields.distributor_name} (${DIST_CODE})`);

  const name = await createAgreementDoc(fields);
  console.log(`  draft ${name} created in ERPNext`);
  try {
    // Did the print format's doctype take the product_line field? If not,
    // the PDF still renders, but with the GreenX subtitle and sticker.
    const doc = await getAgreementDoc(name);
    if (PRODUCT === 'GreenDrive' && doc && doc.product_line !== 'GreenDrive') {
      console.log('  ⚠ ERPNext has no product_line on this doctype yet, so the subtitle, appointment');
      console.log('    paragraph and sticker will still say GreenX. Update it first with:');
      console.log('    CONFIRM_CREATE=1 npx tsx src/db/erp_create_agreement_doctype.ts');
    }

    const pdf = await fetchAgreementPdf(name);
    writeFileSync(OUT, Buffer.from(pdf));
    console.log(`  ✓ PDF saved: ${OUT} (${Math.round(pdf.byteLength / 1024)} KB)`);
  } finally {
    if (KEEP) {
      console.log(`  KEEP=1 — ${name} left in ERPNext. Delete it there when done.`);
    } else {
      await deleteAgreementDoc(name);
      console.log(`  draft ${name} deleted — nothing is left behind`);
    }
  }
}

main().catch(e => { console.error('✗', e.message ?? e); process.exitCode = 1; });
