import PipelineTabs from './components/pipeline/PipelineTabs'
import { useState, useEffect } from 'react'
import type { Lead } from './types'
import Sidebar from './components/Sidebar'
import LeadDetail from './components/lead/LeadDetail'
import CaptureForm from './components/capture/CaptureForm'
import { api } from './lib/api'
import { useIsMobile } from './hooks/useIsMobile'
import TriageQueue from './components/triage/TriageQueue'
import HomeDashboard from './components/dashboard/HomeDashboard'
import { me, clearToken, type User } from './lib/auth'
import Login from './components/auth/Login'
import CustomerList from './components/customer/CustomerList'
import OutreachDesk from './components/outreach/OutreachDesk';

type Page = 'home' | 'my-dashboard' | 'pipeline' | 'customers' | 'triage' | 'capture' | 'outreach'

export default function App() {
  const [page, setPage] = useState<Page>('home')
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const navigate = (p: Page) => { setPage(p); setSelectedLead(null) }

  const isMobile = useIsMobile()

  const [user, setUser] = useState<User | null>(null)
  const [authChecked, setAuthChecked] = useState(false)

  useEffect(() => {
    me().then(u => {
      setUser(u)
      if (u) setPage(u.role === 'director' ? 'home' : 'my-dashboard')
      setAuthChecked(true)
    })
  }, [])

  // Load leads from API
  useEffect(() => {
    loadLeads()
  }, [])

  const loadLeads = async (): Promise<Lead[]> => {
    try {
      setLoading(true)
      setError(null)
      const result = await api.getLeads()
      setLeads(result.data)
      return result.data
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load leads')
      return []
    } finally {
      setLoading(false)
    }
  }

  // Reload leads and refresh the currently open lead with fresh data
  const refreshSelectedLead = async (leadId: string) => {
    const data = await loadLeads()
    const fresh = data.find(l => l.id === leadId)
    if (fresh) setSelectedLead(fresh)
  }

  if (!authChecked) return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6A675F' }}>Loading…</div>
  if (!user) return <Login onSuccess={u => { setUser(u); setPage(u.role === 'director' ? 'home' : 'my-dashboard') }} />

  // Role guard: only directors get the director view. Anyone else who lands on
  // 'home' (stale state, deep link, etc.) sees their own dashboard instead.
  const effectivePage: Page = page === 'home' && user.role !== 'director' ? 'my-dashboard' : page

  return (
    <div style={{ height: '100vh', display: 'flex', overflow: 'hidden' }}>
      <Sidebar
        current={effectivePage}
        navigate={navigate}
        role={user.role}
        userName={user.name}
        onLogout={() => { clearToken(); setUser(null) }}
      />
      <main style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {effectivePage === 'outreach' ? (
            <OutreachDesk />
        ) : effectivePage === 'home' || effectivePage === 'my-dashboard' ? (
          <HomeDashboard
            leads={leads}
            view={effectivePage === 'home' ? 'director' : (user.role === 'supply_chain' ? 'supply' : user.role === 'accounts' ? 'accounts' : 'sales')}
            userName={user.name}
            role={user.role}
            onLeadClick={lead => { setSelectedLead(lead); setPage('pipeline') }}
            navigate={setPage}
          />
        ) : effectivePage === 'capture' ? (
          <CaptureForm
            onCancel={() => navigate('pipeline')}
            onSubmit={async (data) => {
              await api.createLead({
                account: {
                  name: data.companyName,
                  location: data.location,
                },
                primaryContact: {
                  name: data.contactName,
                  email: data.email,
                  phone: data.phone,
                },
                leadType: 'Prospect',
                vertical: data.vertical || undefined,
                captureSource: 'INTERNAL',
                initialNotes: data.notes || undefined,
                ownerName: undefined,
              })
              await loadLeads()
            }}
          />
        ) : effectivePage === 'customers' ? (
          <CustomerList />
        ) : effectivePage === 'triage' ? (
          <TriageQueue
            leads={leads}
            onLeadClick={setSelectedLead}
            onRefresh={loadLeads}
          />
        ) : selectedLead ? (
          <LeadDetail
            lead={selectedLead}
            currentUser={user.name}
            onBack={() => setSelectedLead(null)}
            onChanged={() => refreshSelectedLead(selectedLead.id)}
            onDeleted={async () => {
              await loadLeads()
              setSelectedLead(null)
            }}
          />
        ) : (
          <>
            <header style={{
              padding: isMobile ? '14px 16px 12px' : '18px 24px 14px',
              borderBottom: '1px solid #DDD7C6',
              backgroundColor: '#F4F0E5',
              flexShrink: 0,
            }}>
              <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.03em', margin: 0 }}>
                Pipeline
              </h1>
              <p style={{ fontSize: 12.5, color: '#6A675F', marginTop: 4 }}>
                {loading ? 'Loading…' : `${leads.length} active leads`}
              </p>
            </header>

            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', paddingTop: 20 }}>
              {loading ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ fontSize: 13, color: '#6A675F' }}>Loading leads…</div>
                </div>
              ) : error ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
                  <div style={{ fontSize: 13, color: '#A02B1F' }}>{error}</div>
                  <button
                    onClick={loadLeads}
                    style={{
                      padding: '8px 16px', backgroundColor: '#0E5550', color: '#fff',
                      border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                    }}
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <PipelineTabs leads={leads} onLeadClick={setSelectedLead} onMoved={loadLeads} />
              )}
            </div>
          </>
        )}

      </main>
    </div>
  )
}