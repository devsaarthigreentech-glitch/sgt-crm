// Which product line the partner screens are showing: GreenX or GreenDrive.
//
// One choice shared by Quotations, Agreements and Partner onboarding, so
// switching on one screen carries to the next. Remembered per browser only
// — it is a viewing preference, not data.

import { useEffect, useState } from 'react'

export type ProductLine = 'GreenX' | 'GreenDrive'

const KEY = 'sgt.productLine'
const EVENT = 'sgt:product-line'

function read(): ProductLine {
  try {
    return localStorage.getItem(KEY) === 'GreenDrive' ? 'GreenDrive' : 'GreenX'
  } catch {
    return 'GreenX'
  }
}

export function useProductLine(): [ProductLine, (p: ProductLine) => void] {
  const [line, setLine] = useState<ProductLine>(read)

  useEffect(() => {
    const sync = () => setLine(read())
    window.addEventListener(EVENT, sync)
    return () => window.removeEventListener(EVENT, sync)
  }, [])

  const set = (p: ProductLine) => {
    try { localStorage.setItem(KEY, p) } catch { /* private window: keep it in memory */ }
    setLine(p)
    window.dispatchEvent(new Event(EVENT))
  }

  return [line, set]
}
