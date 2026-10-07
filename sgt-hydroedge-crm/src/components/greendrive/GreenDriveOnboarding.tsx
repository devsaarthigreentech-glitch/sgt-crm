// GreenDrive partner onboarding — PREVIEW. Same tiers as GreenX
// (distributor → dealer SS/SM → sub-dealer) with its own GD code series.
// A firm in both networks gets a separate partner record per product line
// (owner's choice, 2026-10-07). Nothing can be registered from here yet.

import { useState } from 'react'
import { Plus, Info } from 'lucide-react'
import { INK, MUTED, LINE, FAINT, PAPER, WARN_BG, WARN_FG } from '../quotes/theme'

const CODES: [string, string, string][] = [
  ['Distributor', 'EDINGD001', 'Exclusive Distributor · India · GreenDrive · serial'],
  ['Dealer — Sales & Service', 'EDINGD001-SS01', "Distributor's code · SS · serial"],
  ['Dealer — Sales & Marketing', 'EDINGD001-SM01', "Distributor's code · SM · serial"],
]

export default function GreenDriveOnboarding() {
  const [tab, setTab] = useState<'network' | 'applications'>('network')

  return (
    <div style={{ backgroundColor: PAPER, height: '100%', overflowY: 'auto', padding: '20px 18px 60px' }}>
      <h1 style={{ margin: '0 0 3px', fontSize: 20, fontWeight: 700, color: INK }}>GreenDrive partner onboarding</h1>
      <p style={{ margin: '0 0 18px', fontSize: 12.5, color: MUTED }}>
        Register a GreenDrive distributor or dealer. A firm already in the GreenX network
        gets a separate GreenDrive record and code.
      </p>

      <div style={{
        padding: '11px 13px', marginBottom: 16, borderRadius: 8,
        backgroundColor: WARN_BG, color: WARN_FG, fontSize: 12.5,
        display: 'flex', gap: 8, alignItems: 'flex-start',
      }}>
        <Info size={15} style={{ flexShrink: 0, marginTop: 1 }} />
        <span><strong>Preview.</strong> GreenDrive registrations open once the GreenDrive rate card and agreement are confirmed.</span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {(['distributor', 'dealer'] as const).map(t => (
          <button key={t} disabled title="Preview only" style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '9px 14px', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
            backgroundColor: INK, color: '#fff', border: 'none', borderRadius: 7,
            opacity: 0.4, cursor: 'not-allowed',
          }}>
            <Plus size={15} /> New {t}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 14, borderBottom: `1px solid ${LINE}` }}>
        {([['network', 'Partner network (0)'], ['applications', 'Applications (0)']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            padding: '8px 12px', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer',
            background: 'none', border: 'none', marginBottom: -1,
            fontWeight: tab === id ? 700 : 500, color: tab === id ? INK : MUTED,
            borderBottom: `2px solid ${tab === id ? INK : 'transparent'}`,
          }}>
            {label}
          </button>
        ))}
      </div>

      <p style={{ fontSize: 13, color: FAINT, margin: '0 0 22px' }}>
        {tab === 'network' ? 'No GreenDrive partners yet.' : 'No GreenDrive applications yet.'}
      </p>

      <h2 style={{ fontSize: 15, fontWeight: 700, color: INK, margin: '0 0 10px' }}>GreenDrive code scheme</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 760 }}>
        {CODES.map(([who, code, how]) => (
          <div key={code} style={{
            backgroundColor: '#fff', border: `1px solid ${LINE}`, borderRadius: 9,
            padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>{who}</div>
              <div style={{ fontSize: 12, color: MUTED }}>{how}</div>
            </div>
            <code style={{
              fontSize: 12.5, fontWeight: 700, padding: '5px 10px', borderRadius: 6,
              backgroundColor: PAPER, color: INK,
            }}>{code}</code>
          </div>
        ))}
      </div>
    </div>
  )
}
