// The GreenX | GreenDrive switch, and the frame that puts it above a screen.
//
// Wraps a screen rather than living inside it, so the GreenX screens are
// untouched: the frame renders one strip with the toggle, then whichever
// screen belongs to the chosen line.

import type { ReactNode } from 'react'
import { INK, MUTED, LINE, PAPER } from '../quotes/theme'
import { useProductLine, useQuoteMode, type ProductLine } from './productLine'

export function ProductLineToggle({ value, onChange }: {
  value: ProductLine; onChange: (p: ProductLine) => void
}) {
  return (
    <Segmented value={value} onChange={v => onChange(v as ProductLine)}
      options={[['GreenX', 'GreenX'], ['GreenDrive', 'GreenDrive']]} />
  )
}

function Segmented({ value, options, onChange }: {
  value: string; options: [string, string][]; onChange: (v: string) => void
}) {
  return (
    <div role="tablist" aria-label="Product line" style={{
      display: 'inline-flex', flexWrap: 'wrap', padding: 3, borderRadius: 8,
      backgroundColor: '#fff', border: `1px solid ${LINE}`,
    }}>
      {options.map(([v, label]) => {
        const on = value === v
        return (
          <button key={v} role="tab" aria-selected={on} onClick={() => onChange(v)} style={{
            padding: '6px 14px', fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer',
            border: 'none', borderRadius: 6,
            fontWeight: on ? 700 : 500,
            backgroundColor: on ? INK : 'transparent',
            color: on ? '#fff' : MUTED,
          }}>
            {label}
          </button>
        )
      })}
    </div>
  )
}

export function ProductLineFrame({ greenx, greendrive, daas }: {
  greenx: ReactNode; greendrive: ReactNode
  /**
   * The rental (DaaS) screens. When given, the switch has four positions —
   * GreenX · GreenX DaaS · GreenDrive · GreenDrive DaaS. Quotations only.
   */
  daas?: { greenx: ReactNode; greendrive: ReactNode }
}) {
  const [line, setLine] = useProductLine()
  const [mode, setMode] = useQuoteMode()
  const isDaas = !!daas && mode === 'daas'
  return (
    <div style={{ flex: 1, minHeight: 0, height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: PAPER }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        padding: '10px 18px', borderBottom: `1px solid ${LINE}`,
      }}>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: MUTED, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          Product line
        </span>
        {daas
          ? <Segmented
              value={`${line}|${isDaas ? 'daas' : 'sale'}`}
              options={[
                ['GreenX|sale', 'GreenX'], ['GreenX|daas', 'GreenX DaaS'],
                ['GreenDrive|sale', 'GreenDrive'], ['GreenDrive|daas', 'GreenDrive DaaS'],
              ]}
              onChange={v => {
                const [l, m] = v.split('|')
                setLine(l as ProductLine); setMode(m as 'sale' | 'daas')
              }} />
          : <ProductLineToggle value={line} onChange={setLine} />}
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {isDaas
          ? (line === 'GreenDrive' ? daas!.greendrive : daas!.greenx)
          : (line === 'GreenDrive' ? greendrive : greenx)}
      </div>
    </div>
  )
}
