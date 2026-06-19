// src/components/dashboard/AccountsDashboard.tsx
// Accountant view — reuses the exact ErpInsights financials block (clickable
// income/expense drill-downs) plus the existing OutstandingOrders widget.

import ErpInsights from './ErpInsights'
import OutstandingOrders from './OutstandingOrders'

export default function AccountsDashboard() {
  return (
    <div style={{ maxWidth: 900, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <ErpInsights/>
      <OutstandingOrders />
    </div>
  )
}