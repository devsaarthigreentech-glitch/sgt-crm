// The GreenX | GreenDrive switch, and the frame that puts it above a screen.
//
// Wraps a screen rather than living inside it, so the GreenX screens are
// untouched: the frame renders one strip with the toggle, then whichever
// screen belongs to the chosen line.

import type { ReactNode } from 'react'
import { INK, MUTED, LINE, PAPER } from '../quotes/theme'
import { useProductLine, type ProductLine } from './productLine'

export function ProductLineToggle({ value, onChange }: {
  value: ProductLine; onChange: (p: ProductLine) => void
}) {
  return (
    <div role="tablist" aria-label="Product line" style={{
      display: 'inline-flex', padding: 3, borderRadius: 8,
      backgroundColor: '#fff', border: `1px solid ${LINE}`,
    }}>
      {(['GreenX', 'GreenDrive'] as const).map(p => {
        const on = value === p
        return (
          <button key={p} role="tab" aria-selected={on} onClick={() => onChange(p)} style={{
            padding: '6px 14px', fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer',
            border: 'none', borderRadius: 6,
            fontWeight: on ? 700 : 500,
            backgroundColor: on ? INK : 'transparent',
            color: on ? '#fff' : MUTED,
          }}>
            {p}
          </button>
        )
      })}
    </div>
  )
}

export function ProductLineFrame({ greenx, greendrive }: {
  greenx: ReactNode; greendrive: ReactNode
}) {
  const [line, setLine] = useProductLine()
  return (
    <div style={{ flex: 1, minHeight: 0, height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: PAPER }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        padding: '10px 18px', borderBottom: `1px solid ${LINE}`,
      }}>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: MUTED, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          Product line
        </span>
        <ProductLineToggle value={line} onChange={setLine} />
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {line === 'GreenDrive' ? greendrive : greenx}
      </div>
    </div>
  )
}
