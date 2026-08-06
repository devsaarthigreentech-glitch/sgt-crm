// A labelled input. Shared by the quote screen, the line editor and the
// PO negotiation dialog — it was defined inside QuoteScreen until the
// line editor was pulled out and needed it too.

import { FAINT, inputStyle, labelStyle } from './theme'

export function F({ label, value, onChange, placeholder, type = 'text', hint }: {
  label: string; value: any; onChange: (v: string) => void
  placeholder?: string; type?: string; hint?: string
}) {
  return (
    <div style={{ marginBottom: 13 }}>
      <label style={labelStyle}>{label}</label>
      <input type={type} value={value ?? ''} placeholder={placeholder}
        onChange={e => onChange(e.target.value)} style={inputStyle()} />
      {hint && <div style={{ fontSize: 11, color: FAINT, marginTop: 3 }}>{hint}</div>}
    </div>
  )
}
