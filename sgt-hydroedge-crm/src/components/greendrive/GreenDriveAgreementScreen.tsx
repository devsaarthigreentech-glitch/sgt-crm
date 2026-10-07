// GreenDrive agreements — PREVIEW. Same tripartite shape as GreenX
// (SGT · distributor · dealer); there are no GreenDrive dealers yet, so the
// lists are empty. The outline below is a DRAFT for the owner to review:
// every clause that is product-specific is marked [REVIEW].

import { useState } from 'react'
import { Info } from 'lucide-react'
import { INK, MUTED, LINE, FAINT, PAPER, WARN_BG, WARN_FG } from '../quotes/theme'
import { MAX_MARKUP_PCT } from './pricing'

const OUTLINE: { title: string; body: string; review?: boolean }[] = [
  { title: 'Appointment', body: 'SGT, through the Distributor, appoints the Dealer to sell, install and support GreenDrive products in the operating area in Annexure A.' },
  { title: 'Dealer code', body: 'The Dealer is identified by a code in the form EDINGD001-SS01 (Sales & Service) or -SM01 (Sales & Marketing).' },
  { title: 'Products', body: 'GreenDrive One, Neo and Pro. Product description, patents and certifications to be supplied.', review: true },
  { title: 'Pricing', body: `Customers are quoted from MRP. A Dealer responsible for sales, installation and support may mark up to MRP + ${MAX_MARKUP_PCT}%.`, review: true },
  { title: 'Billing and earnings', body: 'SGT invoices the customer directly. The Dealer earns a base margin on MRP plus the full markup, settled by SGT. Base margin % to be confirmed.', review: true },
  { title: 'Installation and support', body: 'Dealer obligations for installation, commissioning, warranty handling and service response times.', review: true },
  { title: 'Training and branding', body: 'Mandatory product training, use of the GreenDrive name and marks, and the authorised-dealer sticker in Annexure B.' },
  { title: 'Intellectual property and non-compete', body: 'The GreenX clauses cite CHFA™ and Indian Patent No. 582824; the GreenDrive equivalents are needed.', review: true },
  { title: 'Term and termination', body: 'Carried over from the GreenX agreement unchanged.' },
  { title: 'Governing law', body: 'Jaipur jurisdiction, carried over from the GreenX agreement.' },
]

export default function GreenDriveAgreementScreen() {
  const [tab, setTab] = useState<'appoint' | 'list'>('appoint')

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, backgroundColor: PAPER }}>
      <header style={{ padding: '18px 24px 0', borderBottom: `1px solid ${LINE}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.03em', margin: 0 }}>
            GreenDrive agreements
          </h1>
          <span style={{ fontSize: 12.5, color: MUTED }}>0 raised · 0 dealers awaiting appointment</span>
        </div>
        <div style={{ display: 'flex', gap: 2, marginTop: 12 }}>
          {(['appoint', 'list'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '9px 14px', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer',
              background: 'none', border: 'none', marginBottom: -1,
              fontWeight: tab === t ? 700 : 500, color: tab === t ? INK : MUTED,
              borderBottom: `2px solid ${tab === t ? INK : 'transparent'}`,
            }}>
              {t === 'appoint' ? 'Appoint a dealer' : 'All agreements'}
            </button>
          ))}
        </div>
      </header>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px 60px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{
            padding: '11px 13px', marginBottom: 16, borderRadius: 8,
            backgroundColor: WARN_BG, color: WARN_FG, fontSize: 12.5,
            display: 'flex', gap: 8, alignItems: 'flex-start',
          }}>
            <Info size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              <strong>Preview.</strong> GreenDrive dealers appear here once a GreenDrive
              application is approved in Partner onboarding.
            </span>
          </div>

          <div style={{
            backgroundColor: '#fff', border: `1px solid ${LINE}`, borderRadius: 10,
            padding: '26px 18px', textAlign: 'center', fontSize: 13, color: FAINT, marginBottom: 22,
          }}>
            {tab === 'appoint' ? 'No GreenDrive dealers awaiting appointment.' : 'No GreenDrive agreements raised yet.'}
          </div>

          <h2 style={{ fontSize: 15, fontWeight: 700, color: INK, margin: '0 0 4px' }}>
            Draft agreement outline
          </h2>
          <p style={{ fontSize: 12, color: MUTED, margin: '0 0 12px' }}>
            Same three-party layout as the GreenX agreement: SGT, the distributor and the
            dealer. Clauses marked REVIEW need wording from SGT or legal before the first one is issued.
          </p>
          <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {OUTLINE.map((s, i) => (
              <li key={s.title} style={{
                backgroundColor: '#fff', border: `1px solid ${LINE}`, borderRadius: 9, padding: '11px 14px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 650, color: INK }}>{i + 1}. {s.title}</span>
                  {s.review && (
                    <span style={{
                      fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', padding: '2px 7px',
                      borderRadius: 4, backgroundColor: WARN_BG, color: WARN_FG,
                    }}>REVIEW</span>
                  )}
                </div>
                <div style={{ fontSize: 12.5, color: MUTED }}>{s.body}</div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  )
}
