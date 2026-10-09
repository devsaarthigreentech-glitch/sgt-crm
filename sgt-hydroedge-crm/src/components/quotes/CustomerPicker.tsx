// The Customer card's contents: search ERPNext, pick one, add a new one,
// or correct the picked one's GSTIN and address.
//
// Lifted out of QuoteScreen when GreenDrive got its own quotation screen,
// so both product lines find and create customers the same way — the
// customer master in ERPNext is shared, and so is the claim rule that
// stops two partners quoting the same customer.

import { useEffect, useRef, useState } from 'react'
import { Check, AlertCircle } from 'lucide-react'
import { INK, MUTED, LINE, FAINT, DANGER, OK, WARN_BG, WARN_FG, inputStyle, labelStyle } from './theme'
import { F } from './Field'
import type { ErpCustomer, QuoteApi } from './QuoteScreen'

export type CustomerApi = Pick<QuoteApi, 'searchCustomers' | 'createCustomer' | 'customerDetail' | 'updateCustomer'>

export function CustomerPicker({ api, picked, setPicked, setBanner }: {
  api: CustomerApi
  picked: ErpCustomer | null
  setPicked: React.Dispatch<React.SetStateAction<ErpCustomer | null>>
  /** The host screen's top-of-page error line. */
  setBanner: (msg: string | null) => void
}) {
  const [custQuery, setCustQuery] = useState('')
  const [custHits, setCustHits] = useState<ErpCustomer[]>([])
  const [custSearching, setCustSearching] = useState(false)
  const [addingCust, setAddingCust] = useState(false)
  const [editCust, setEditCust] = useState<{
    gstin: string; entityType: string
    line1: string; city: string; state: string; pincode: string
  } | null>(null)
  const [custNote, setCustNote] = useState<string | null>(null)
  const [newCust, setNewCust] = useState({
    name: '', gstin: '', entityType: 'Company',
    line1: '', city: '', state: '', pincode: '',
  })
  const [custErrors, setCustErrors] = useState<Record<string, string>>({})
  // Kept out of `banner` on purpose. This one is not a validation failure
  // — nothing they can retype fixes it — so it belongs at the button they
  // just pressed, where they are looking, rather than at the top of a
  // form they have scrolled past.
  const [custBlocked, setCustBlocked] = useState<string | null>(null)

  // The host can swap the customer from outside (clearing the form,
  // loading a draft to edit). Drop any half-done correction, and when
  // cleared, the old search with it.
  useEffect(() => {
    setEditCust(null)
    if (!picked) { setCustQuery(''); setCustHits([]) }
  }, [picked?.name])

  const custTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (custTimer.current) clearTimeout(custTimer.current)
    // Clears the spinner too: a search cancelled mid-flight (the form was
    // reset while it was pending) would otherwise say "Searching…" forever.
    if (picked || custQuery.trim().length < 2) { setCustHits([]); setCustSearching(false); return }
    setCustSearching(true)
    custTimer.current = setTimeout(async () => {
      try { setCustHits(await api.searchCustomers(custQuery)) }
      catch { setCustHits([]) }
      finally { setCustSearching(false) }
    }, 350)
    return () => { if (custTimer.current) clearTimeout(custTimer.current) }
  }, [custQuery, picked])

  const addCustomer = async () => {
    setCustErrors({}); setCustNote(null); setCustBlocked(null)
    try {
      const r = await api.createCustomer({
        name: newCust.name.trim(),
        gstin: newCust.gstin.trim(),
        entityType: newCust.entityType,
        // The address is a separate document in ERPNext. Sent at creation
        // so the quotation has something to print — without it the
        // address block on the PDF comes out blank.
        address: {
          line1: newCust.line1.trim(),
          city: newCust.city.trim(),
          state: newCust.state.trim(),
          pincode: newCust.pincode.trim(),
        },
      })
      setPicked({ name: r.erpName, customer_name: newCust.name.trim(), gstin: newCust.gstin.trim() || null })
      setAddingCust(false)
      setNewCust({ name: '', gstin: '', entityType: 'Company', line1: '', city: '', state: '', pincode: '' })
      setBanner(null)
      if (r.note) setCustNote(r.note)
    } catch (e: any) {
      // Three different failures, three different places. The customer
      // already belonging to another dealer is not something the top-of
      // -screen banner should swallow — it is the answer to the button.
      if (e?.code === 'customer_claimed') setCustBlocked(e.message)
      else if (e?.fields) setCustErrors(e.fields)
      else setBanner(e.message)
    }
  }

  return (
    <>
      {picked ? (
        <>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 13,
            padding: '10px 12px', borderRadius: 7,
            backgroundColor: '#F2F6F2', border: '1px solid #CFE0D4',
          }}>
            <Check size={15} style={{ color: OK, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>
                {picked.customer_name || picked.name}
              </div>
              <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>
                {picked.gstin ? `GSTIN ${picked.gstin}` : 'No GSTIN on record'}
              </div>
            </div>
            <button type="button"
              onClick={async () => {
                setCustErrors({}); setCustNote(null)
                if (editCust) { setEditCust(null); return }
                // Prefilled from ERPNext, so saving never blanks a
                // field the user could not see.
                const blank = {
                  gstin: picked.gstin ?? '', entityType: 'Company',
                  line1: '', city: '', state: '', pincode: '',
                }
                setEditCust(blank)
                try {
                  const d = await api.customerDetail(picked.name)
                  setEditCust({
                    gstin: d.gstin ?? picked.gstin ?? '',
                    entityType: 'Company',
                    line1: d.address?.line1 ?? '',
                    city: d.address?.city ?? '',
                    state: d.address?.state ?? '',
                    pincode: d.address?.pincode ?? '',
                  })
                  if (!d.address) {
                    setCustNote('This customer has no address in ERPNext — quotations for them print a blank address block. Add it here.')
                  }
                } catch { /* keep the blank form */ }
              }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, fontSize: 12, fontFamily: 'inherit' }}>
              {editCust ? 'Cancel' : 'Fix details'}
            </button>
            <button type="button" onClick={() => { setPicked(null); setCustQuery(''); setEditCust(null) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, fontSize: 12, fontFamily: 'inherit' }}>
              Change
            </button>
          </div>

          {/* Corrects the customer in ERPNext. The name is not editable
              here — on most setups the Customer is named BY it, so a
              change would rename the record and every document linked
              to it. That is an ERPNext admin job, not a typo fix. */}
          {editCust && (
            <div style={{ marginBottom: 13, padding: 12, borderRadius: 8, border: `1px dashed ${LINE}`, backgroundColor: '#FCFBF7' }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: INK, marginBottom: 10 }}>
                Correct {picked.customer_name || picked.name}
              </div>
              <F label="GSTIN" value={editCust.gstin} placeholder="27AAECC3132G1Z1"
                 onChange={v => setEditCust(c => c && { ...c, gstin: v.toUpperCase() })} />
              {custErrors.gstin && <div style={{ fontSize: 11.5, color: DANGER, marginTop: -8, marginBottom: 10 }}>{custErrors.gstin}</div>}

              <div style={{ marginBottom: 13 }}>
                <label style={labelStyle}>They are</label>
                <select value={editCust.entityType}
                  onChange={e => setEditCust(c => c && { ...c, entityType: e.target.value })}
                  style={{ ...inputStyle(), appearance: 'auto' }}>
                  <option value="Company">A company or firm</option>
                  <option value="Individual">An individual</option>
                </select>
              </div>

              <F label="Address" value={editCust.line1} placeholder="Plot / building, street, area"
                 onChange={v => setEditCust(c => c && { ...c, line1: v })} />
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 2 }}>
                  <F label="City" value={editCust.city}
                     onChange={v => setEditCust(c => c && { ...c, city: v })} />
                </div>
                <div style={{ flex: 2 }}>
                  <F label="State" value={editCust.state}
                     onChange={v => setEditCust(c => c && { ...c, state: v })} />
                </div>
                <div style={{ flex: 1 }}>
                  <F label="PIN" value={editCust.pincode}
                     onChange={v => setEditCust(c => c && { ...c, pincode: v })} />
                </div>
              </div>
              {custErrors.pincode && <div style={{ fontSize: 11.5, color: DANGER, marginTop: -8, marginBottom: 10 }}>{custErrors.pincode}</div>}

              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button"
                  onClick={async () => {
                    if (!editCust || !picked) return
                    setCustErrors({}); setBanner(null); setCustNote(null)
                    try {
                      const r = await api.updateCustomer(picked.name, {
                        name: picked.customer_name || picked.name,
                        gstin: editCust.gstin.trim(),
                        entityType: editCust.entityType,
                        address: {
                          line1: editCust.line1.trim(),
                          city: editCust.city.trim(),
                          state: editCust.state.trim(),
                          pincode: editCust.pincode.trim(),
                        },
                      })
                      setPicked(p => p && { ...p, gstin: editCust.gstin.trim() || null })
                      setEditCust(null)
                      setCustNote(r.note ?? 'Customer updated.')
                    } catch (e: any) {
                      if (e?.fields) setCustErrors(e.fields)
                      else setBanner(e.message)
                    }
                  }}
                  style={{
                    padding: '8px 14px', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
                    border: 'none', borderRadius: 6, cursor: 'pointer', backgroundColor: INK, color: '#fff',
                  }}>Save to ERPNext</button>
                <button type="button" onClick={() => { setEditCust(null); setCustErrors({}) }} style={{
                  padding: '8px 14px', fontSize: 12.5, fontFamily: 'inherit',
                  border: `1px solid ${LINE}`, borderRadius: 6, cursor: 'pointer',
                  background: '#fff', color: MUTED,
                }}>Cancel</button>
              </div>
            </div>
          )}

          {custNote && (
            <div style={{
              marginBottom: 13, padding: '9px 11px', borderRadius: 7, fontSize: 11.5,
              backgroundColor: WARN_BG, color: WARN_FG,
              display: 'flex', alignItems: 'flex-start', gap: 5,
            }}>
              <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{custNote}</span>
            </div>
          )}
        </>
      ) : addingCust ? (
        <div style={{ marginBottom: 13, padding: 12, borderRadius: 8, border: `1px dashed ${LINE}`, backgroundColor: '#FCFBF7' }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: INK, marginBottom: 10 }}>New customer</div>

          <div style={{ marginBottom: 13 }}>
            <label style={labelStyle}>They are</label>
            <select value={newCust.entityType}
              onChange={e => setNewCust(c => ({ ...c, entityType: e.target.value }))}
              style={{ ...inputStyle(), appearance: 'auto' }}>
              <option value="Company">A company or firm</option>
              <option value="Individual">An individual</option>
            </select>
            <div style={{ fontSize: 11, color: FAINT, marginTop: 3 }}>
              Recorded as the customer type in ERPNext.
            </div>
          </div>

          <F label={newCust.entityType === 'Individual' ? 'Full name' : 'Name'}
             value={newCust.name} onChange={v => setNewCust(c => ({ ...c, name: v }))} />
          {custErrors.name && <div style={{ fontSize: 11.5, color: DANGER, marginTop: -8, marginBottom: 10 }}>{custErrors.name}</div>}
          <F label="GSTIN" value={newCust.gstin} placeholder="27AAECC3132G1Z1"
             onChange={v => setNewCust(c => ({ ...c, gstin: v.toUpperCase() }))} />
          {custErrors.gstin && <div style={{ fontSize: 11.5, color: DANGER, marginTop: -8, marginBottom: 10 }}>{custErrors.gstin}</div>}

          <F label="Address" value={newCust.line1} placeholder="Plot / building, street, area"
             onChange={v => setNewCust(c => ({ ...c, line1: v }))} />
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 2 }}>
              <F label="City" value={newCust.city} onChange={v => setNewCust(c => ({ ...c, city: v }))} />
            </div>
            <div style={{ flex: 2 }}>
              <F label="State" value={newCust.state} onChange={v => setNewCust(c => ({ ...c, state: v }))} />
            </div>
            <div style={{ flex: 1 }}>
              <F label="PIN" value={newCust.pincode} onChange={v => setNewCust(c => ({ ...c, pincode: v }))} />
            </div>
          </div>
          {custErrors.state && <div style={{ fontSize: 11.5, color: DANGER, marginTop: -8, marginBottom: 10 }}>{custErrors.state}</div>}
          {custErrors.pincode && <div style={{ fontSize: 11.5, color: DANGER, marginTop: -8, marginBottom: 10 }}>{custErrors.pincode}</div>}
          <div style={{ fontSize: 11, color: FAINT, marginBottom: 10 }}>
            The address is saved to ERPNext as the customer's billing address
            and printed on the quotation — leave it blank and the address
            block comes out empty. Without a GSTIN, set the GST below by hand.
          </div>
          {custBlocked && (
            <div role="alert" style={{
              display: 'flex', gap: 9, alignItems: 'flex-start',
              padding: '10px 11px', marginBottom: 10, borderRadius: 6,
              border: `1px solid ${DANGER}`, backgroundColor: '#FDF3F1',
            }}>
              <span aria-hidden style={{ fontSize: 13, lineHeight: 1.4, color: DANGER }}>⊘</span>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: DANGER, lineHeight: 1.45 }}>
                  {custBlocked}
                </div>
                <div style={{ fontSize: 11, color: MUTED, marginTop: 3, lineHeight: 1.5 }}>
                  Nothing was saved. The customer stays with the dealer who registered them.
                </div>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={addCustomer} style={{
              padding: '8px 14px', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
              border: 'none', borderRadius: 6, cursor: 'pointer', backgroundColor: INK, color: '#fff',
            }}>Add customer</button>
            <button type="button"
              onClick={() => { setAddingCust(false); setCustErrors({}); setCustBlocked(null) }}
              style={{
                padding: '8px 14px', fontSize: 12.5, fontFamily: 'inherit',
                border: `1px solid ${LINE}`, borderRadius: 6, cursor: 'pointer',
                background: '#fff', color: MUTED,
              }}>Cancel</button>
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: 13 }}>
          <label style={labelStyle}>Search existing customers</label>
          <input value={custQuery} onChange={e => setCustQuery(e.target.value)}
            placeholder="Name or GSTIN — at least 2 characters" style={inputStyle()} />
          {custSearching && <div style={{ fontSize: 11.5, color: FAINT, marginTop: 5 }}>Searching…</div>}
          {custHits.length > 0 && (
            <div style={{ marginTop: 6, border: `1px solid ${LINE}`, borderRadius: 7, overflow: 'hidden' }}>
              {custHits.map(c => (
                <button key={c.name} type="button" onClick={() => { setPicked(c); setCustHits([]) }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                    padding: '9px 11px', background: '#fff', border: 'none',
                    borderBottom: `1px solid ${LINE}`, fontFamily: 'inherit',
                  }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: INK }}>{c.customer_name || c.name}</div>
                  <div style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>
                    {c.gstin ? `GSTIN ${c.gstin}` : 'No GSTIN'}
                  </div>
                </button>
              ))}
            </div>
          )}
          {custQuery.trim().length >= 2 && !custSearching && custHits.length === 0 && (
            <div style={{ fontSize: 12, color: MUTED, marginTop: 7 }}>No match.</div>
          )}
          <button type="button" onClick={() => {
            setAddingCust(true); setCustBlocked(null); setCustErrors({})
            setNewCust(c => ({ ...c, name: custQuery.trim() }))
          }}
            style={{
              marginTop: 9, display: 'flex', alignItems: 'center', gap: 5,
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              color: MUTED, fontSize: 12.5, fontFamily: 'inherit',
            }}>
            + Add a new customer
          </button>
          <div style={{ fontSize: 11, color: FAINT, marginTop: 6 }}>
            Quoting never creates a customer on its own — adding one is a separate step.
          </div>
        </div>
      )}
    </>
  )
}
