// RentalCard.tsx
// SGT HydroEdge CRM — one engagement card for a DaaS rental deal (upfront + recurring),
// replacing the two stray "overdue" Sales Order rows. React 19, inline styles, no Tailwind.

import type { DaaSEngagement } from '../../lib/rentalModel';
import { formatINR, formatINRShort } from '../../lib/rentalModel';

const T = {
  forest: '#1F4E2E',
  green2: '#2D7A4F',
  gold: '#C9A24E',
  paper: '#ECE8DA',
  red: '#C84A3A',
  ink: '#1c1c1a',
  muted: '#6b6b63',
  faint: '#9a9a90',
};

interface Props {
  engagement: DaaSEngagement;
  nextInvoiceDate?: string; // from the Subscription, once /erp/subscriptions is wired
  onOpen?: (key: string) => void;
}

const STATUS_CHIP: Record<
  DaaSEngagement['upfrontStatus'],
  { bg: string; fg: string; label: string }
> = {
  billed: { bg: '#E7F1EA', fg: T.forest, label: 'Upfront billed' },
  partial: { bg: '#FBF3E0', fg: '#8a6d1f', label: 'Upfront partial' },
  unbilled: { bg: '#F6E7E4', fg: T.red, label: 'Upfront unbilled' },
};

export default function RentalCard({ engagement: e, nextInvoiceDate, onOpen }: Props) {
  const tenure = e.contractTenureMonths;
  const elapsed = e.bookedMonths ?? 0;
  const progressLabel = tenure
    ? `Month ${Math.min(elapsed, tenure)} of ${tenure}`
    : `${elapsed} mo booked`;
  const pct = tenure ? Math.min(100, Math.round((elapsed / tenure) * 100)) : 0;
  const recurringMonths = tenure ?? e.bookedMonths ?? 0;
  const chip = STATUS_CHIP[e.upfrontStatus];

  return (
    <div
      onClick={() => onOpen?.(e.key)}
      style={{
        background: '#fff',
        border: `1px solid ${T.paper}`,
        borderLeft: `4px solid ${T.gold}`,
        borderRadius: 12,
        padding: '16px 18px',
        cursor: onOpen ? 'pointer' : 'default',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      {/* header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 16, color: T.ink }}>
              {e.customerName}
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 0.3,
                textTransform: 'uppercase',
                color: T.forest,
                background: '#E7F1EA',
                padding: '2px 8px',
                borderRadius: 999,
              }}
            >
              DaaS Rental
            </span>
          </div>
          <div style={{ fontSize: 13, color: T.muted, marginTop: 2 }}>
            {e.machines != null
              ? `${e.machines} machine${e.machines === 1 ? '' : 's'}`
              : 'Fleet'}{' '}
            · GreenX · {e.key}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: T.forest }}>
            {e.monthlyGross != null ? formatINR(e.monthlyGross) : '—'}
            <span style={{ fontSize: 12, fontWeight: 500, color: T.muted }}>/mo</span>
          </div>
          <div style={{ fontSize: 12, color: T.muted }}>MRR (incl. GST)</div>
        </div>
      </div>

      {/* tenure progress */}
      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 12,
            color: T.muted,
            marginBottom: 4,
          }}
        >
          <span>{progressLabel}</span>
          {nextInvoiceDate && <span>Next invoice {nextInvoiceDate}</span>}
        </div>
        <div
          style={{
            height: 6,
            background: T.paper,
            borderRadius: 999,
            overflow: 'hidden',
          }}
        >
          <div style={{ width: `${pct}%`, height: '100%', background: T.green2 }} />
        </div>
      </div>

      {/* facts */}
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <Fact label="Upfront" value={formatINR(e.upfrontGross)} chip={chip} />
        <Fact
          label={`Recurring (${recurringMonths} mo)`}
          value={
            e.monthlyGross != null
              ? formatINR(e.monthlyGross * recurringMonths)
              : '—'
          }
        />
        <Fact label="TCV (net)" value={formatINRShort(e.tcvNet)} strong />
      </div>
    </div>
  );
}

function Fact({
  label,
  value,
  chip,
  strong,
}: {
  label: string;
  value: string;
  chip?: { bg: string; fg: string; label: string };
  strong?: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: 0.3,
          color: T.faint,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: strong ? 16 : 14,
          fontWeight: strong ? 700 : 600,
          color: strong ? T.forest : T.ink,
        }}
      >
        {value}
      </span>
      {chip && (
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: chip.fg,
            background: chip.bg,
            padding: '1px 6px',
            borderRadius: 999,
            width: 'fit-content',
          }}
        >
          {chip.label}
        </span>
      )}
    </div>
  );
}