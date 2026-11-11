// Which network a partner login is working in, for a firm that is in both
// GreenX and GreenDrive. Sent to the server as X-Product-Line on every call;
// the server resolves it to one of the two orgs linked to this login (see
// server src/auth/partnerOrg.ts) and ignores it for everyone else, so it is
// harmless on staff requests and for single-network partners.

export type PortalLine = 'GreenX' | 'GreenDrive'

const KEY = 'portal_product_line'

export function getPortalLine(): PortalLine | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'GreenX' || v === 'GreenDrive' ? v : null
  } catch {
    return null
  }
}

export function setPortalLine(line: PortalLine | null) {
  try {
    if (line) localStorage.setItem(KEY, line)
    else localStorage.removeItem(KEY)
  } catch { /* storage unavailable — the server falls back to the home org */ }
}

/** Spread into fetch headers. */
export function lineHeader(): Record<string, string> {
  const line = getPortalLine()
  return line ? { 'X-Product-Line': line } : {}
}
