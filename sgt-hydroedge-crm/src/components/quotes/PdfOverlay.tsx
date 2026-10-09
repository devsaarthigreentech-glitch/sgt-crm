// Full-screen PDF preview with Download and Close. The object URL is
// revoked by the host's onClose, which owns it.

export function PdfOverlay({ pdf, onClose }: {
  pdf: { name: string; url: string }
  onClose: () => void
}) {
  return (
    <div
      onClick={() => { onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 50, backgroundColor: 'rgba(22,22,20,0.55)',
        display: 'flex', flexDirection: 'column', padding: '3vh 3vw',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{ flex: 1, color: '#fff', fontSize: 13.5, fontWeight: 600 }}>{pdf.name}</div>
        <a href={pdf.url} download={`${pdf.name}.pdf`} onClick={e => e.stopPropagation()}
          style={{ color: '#fff', fontSize: 12.5, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.5)', borderRadius: 6, padding: '5px 11px' }}>
          Download
        </a>
        <button onClick={() => { onClose() }}
          style={{ background: 'none', border: '1px solid rgba(255,255,255,0.5)', color: '#fff', borderRadius: 6, padding: '5px 11px', cursor: 'pointer', fontSize: 12.5, fontFamily: 'inherit' }}>
          Close
        </button>
      </div>
      <iframe title={pdf.name} src={pdf.url} onClick={e => e.stopPropagation()}
        style={{ flex: 1, width: '100%', border: 'none', borderRadius: 8, backgroundColor: '#fff' }} />
    </div>
  )
}
