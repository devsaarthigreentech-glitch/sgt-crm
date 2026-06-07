import { useState, useEffect } from 'react'
import type { Lead } from './types'
import Sidebar from './components/Sidebar'
import KanbanBoard from './components/pipeline/KanbanBoard'
import LeadDetail from './components/lead/LeadDetail'
import CaptureForm from './components/capture/CaptureForm'
import PartnerPortal from './components/partner/PartnerPortal'
import { api } from './lib/api'
import { useIsMobile } from './hooks/useIsMobile'
import TriageQueue from './components/triage/TriageQueue'
import HomeDashboard from './components/dashboard/HomeDashboard'

type Page = 'home' | 'pipeline' | 'triage' | 'capture'

export default function App() {
  const [page, setPage] = useState<Page>('home')
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [partnerMode, setPartnerMode] = useState(false)

  const navigate = (p: Page) => { setPage(p); setSelectedLead(null) }

  const isMobile = useIsMobile();

  // Load leads from API
  useEffect(() => {
    loadLeads()
  }, [])

  const loadLeads = async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await api.getLeads()
      setLeads(result.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load leads')
    } finally {
      setLoading(false)
    }
  }

  if (partnerMode) {
    return (
      <div style={{ height: '100vh', display: 'flex', overflow: 'hidden' }}>
        <PartnerPortal onExit={() => setPartnerMode(false)} />
      </div>
    )
  }

  return (
    <div style={{ height: '100vh', display: 'flex', overflow: 'hidden' }}>
      <Sidebar
        current={page}
        navigate={navigate}
        onPartnerPortal={() => setPartnerMode(true)}
      />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {page === 'home' ? (
          <HomeDashboard
            leads={leads}
            onLeadClick={lead => { setSelectedLead(lead); setPage('pipeline') }}
            navigate={setPage}
          />
        ) : page === 'capture' ? (
          // <CaptureForm
          //   onCancel={() => navigate('pipeline')}
          //   onSubmit={async (data) => {
          //     try {
          //       await api.createLead({
          //         account: {
          //           name:     data.companyName,
          //           location: data.location,
          //         },
          //         primaryContact: data.contactName ? {
          //           name:  data.contactName,
          //           role:  data.contactRole,
          //           email: data.contactEmail,
          //           phone: data.contactPhone,
          //         } : undefined,
          //         leadType:        data.leadType,
          //         vertical:        data.vertical || undefined,
          //         commercialModel: data.model    || undefined,
          //         origin:          data.origin   || undefined,
          //         captureSource:   data.captureSource || 'INTERNAL',
          //         estimatedValue:  data.estimatedValue ? parseInt(data.estimatedValue) : undefined,
          //         estimatedCloseDate: data.estimatedCloseDate || undefined,
          //         initialNotes:    data.notes    || undefined,
          //         ownerName:       'Rohan Mehta',
          //         referredBy:      data.referredBy || undefined,
          //         metadata: {
          //           partnerArchetype: data.partnerArchetype,
          //           kolType:          data.kolType,
          //           distributorType:  data.distributorType,
          //           strategicType:    data.strategicType,
          //           networkSize:      data.networkSize,
          //           territory:        data.territory,
          //         },
          //       })
          //       await loadLeads()
          //       navigate('pipeline')
          //     } catch (err) {
          //       alert(err instanceof Error ? err.message : 'Failed to create lead')
          //     }
          //   }}
          // />
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
                captureSource: 'INTERNAL',
                initialNotes: data.notes || undefined,
                ownerName: undefined,
              })
              await loadLeads()
            }}
          />
        ) : page === 'triage' ? (
          <TriageQueue
            leads={leads}
            onLeadClick={setSelectedLead}
            onRefresh={loadLeads}
          />
        ) : selectedLead ? (
           <LeadDetail
          lead={selectedLead}
          onBack={() => setSelectedLead(null)}
        />
          // <LeadDetail
          //   lead={{
          //     // —— map your nested Lead -> flat shape. Confirm names against src/types.ts ——
          //     id: (selectedLead as any).code ?? selectedLead.id ?? '',
          //     company: (selectedLead as any).account?.name ?? '',
          //     contactName: (selectedLead as any).primaryContact?.name ?? '',
          //     stage: (selectedLead as any).stage ?? 'New',
          //     leadType: (selectedLead as any).leadType ?? '',
          //     owner: (selectedLead as any).ownerName ?? null,
          //     value: (selectedLead as any).estimatedValue ?? 0,
          //     estClose: (selectedLead as any).estimatedCloseDate ?? null,
          //     daysInStage: (selectedLead as any).daysInStage ?? 0,
          //     email: (selectedLead as any).primaryContact?.email ?? '',
          //     phone: (selectedLead as any).primaryContact?.phone ?? '',
          //     activities: ((selectedLead as any).activities ?? []).map((a: any) => ({
          //       id: a.id, author: a.author ?? a.ownerName ?? '',
          //       note: a.note ?? a.text ?? '', date: a.date ?? a.createdAt ?? '',
          //       channel: a.channel, sentiment: a.sentiment,
          //     })),
          //   }}
          //   stages={['New', 'Allocated', 'Qualifying', 'Discovery', 'Proposal', 'Negotiation']}
          //   onBack={() => setSelectedLead(null)}
          //   onAdvance={() => {/* TODO: call your stage-advance endpoint, then loadLeads() */ }}
          //   onLogActivity={() => {/* TODO: open your existing log-activity UI */ }}
          //   onSave={async (patch) => {
          //     await fetch(`${import.meta.env.VITE_API_URL}/leads/${selectedLead.id}`, {
          //       method: 'PATCH',
          //       headers: { 'Content-Type': 'application/json' },
          //       body: JSON.stringify(patch),
          //     })
          //     await loadLeads()
          //   }}
          // />
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

            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', paddingTop: 20 }}>
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
                <KanbanBoard leads={leads} onLeadClick={setSelectedLead} />
              )}
            </div>
          </>
        )}

      </main>
    </div>
  )
}