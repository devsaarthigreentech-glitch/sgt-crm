// Shared look for the quote and PO screens.
//
// Extracted from QuoteScreen when the dealer PO gained its own line
// editor: both screens draw the same controls, and two copies of these
// values is how two screens stop matching without anyone deciding to.

export const INK = '#161614'
export const MUTED = '#6A675F'
export const LINE = '#DDD7C6'
export const FAINT = '#A39F94'
export const DANGER = '#A6301C'
export const OK = '#2F6B4F'
export const PAPER = '#ECE8DA'
export const WARN_BG = '#FBF0DA'
export const WARN_FG = '#6F2F0E'

export const rupees = (v: string | number | null | undefined) =>
  v === null || v === undefined || v === ''
    ? '—'
    : '₹' + Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })

export const inputStyle = (bad?: boolean): React.CSSProperties => ({
  width: '100%', boxSizing: 'border-box', padding: '9px 10px', fontSize: 13.5,
  color: INK, backgroundColor: '#fff', border: `1px solid ${bad ? DANGER : LINE}`,
  borderRadius: 6, outline: 'none', fontFamily: 'inherit',
})

export const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11.5, fontWeight: 600, color: MUTED, marginBottom: 5,
}
