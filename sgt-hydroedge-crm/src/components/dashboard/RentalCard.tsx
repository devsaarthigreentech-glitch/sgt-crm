// RentalCard.tsx  (src/components/dashboard/RentalCard.tsx)
// Fuller DaaS engagement card for a dedicated Rentals tab / slide-over.
// Self-contained: consumes the `Rental` DTO from /erp/orders/outstanding, no shared
// rentalModel import. Rent read literally: monthlyNet = ₹8,268, periods = 24 invoices.


// The DTO the API sends in data.rentals. Move to src/types/index.ts and import in
// both OutstandingOrders and here if you want a single declaration.
export type Rental = {
  key: string;
  customer: string;
  machines: number | null;
  monthlyNet: number | null;
  monthlyGross: number | null;
  periods: number | null;
  recurringNet: number;
  upfrontGross: number;
  tcvNet: number;
  upfrontStatus: 'billed' | 'partial' | 'unbilled';
  nextInvoiceDate?: string | null;
  invoicesPaid?: number | null;
};

const T = {
  forest: '#1F4E2E', green2: '#2D7A4F', gold: '#C9A24E', paper: '#ECE8DA',
  red: '#C84A3A', ink: '#1c1c1a', muted: '#6b6b63', faint: '#9a9a90',
};

const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const inrShort = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e7) return '₹' + (n / 1e7).toFixed(2).replace(/\.00$/, '') + 'Cr';
  if (a >= 1e5) return '₹' + (n / 1e5).toFixed(1).replace(/\.0$/, '') + 'L';
  return inr(n);
};

const STATUS_CHIP: Record<Rental['upfrontStatus'], { bg: string; fg: string; label: string }> = {
  billed: { bg: '#E7F1EA', fg: T.forest, label: 'Upfront billed' },
  partial: { bg: '#FBF3E0', fg: '#8a6d1f', label: 'Upfront partial' },
  unbilled: { bg: '#F6E7E4', fg: T.red, label: 'Upfront unbilled' },
};

interface Props {
  rental: Rental;
  onOpen?: (key: string) => void;
}

export default function RentalCard({ rental: r, onOpen }: Props) {
  const periods = r.periods ?? 0;
  const paid = r.invoicesPaid ?? 0;
  const scheduleLabel = r.invoicesPaid != null
    ? `${paid} of ${periods} paid`
    : `${periods} monthly invoice${periods === 1 ? '' : 's'}`;
  const pct = periods ? Math.min(100, Math.round((paid / periods) * 100)) : 0;
  const chip = STATUS_CHIP[r.upfrontStatus];

  return (
    <div
      onClick={() => onOpen?.(r.key)}
      style={{
        background: '#fff', border: `1px solid ${T.paper}`,
        borderLeft: `4px solid ${T.gold}`, borderRadius: 12,
        padding: '16px 18px', cursor: onOpen ? 'pointer' : 'default',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 16, color: T.ink }}>{r.customer}</span>
            <span style={{
              fontSize: 11, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase',
              color: T.forest, background: '#E7F1EA', padding: '2px 8px', borderRadius: 999,
            }}>DaaS Rental</span>
          </div>
          <div style={{ fontSize: 13, color: T.muted, marginTop: 2 }}>
            {r.machines != null ? `${r.machines} machine${r.machines === 1 ? '' : 's'}` : 'Fleet'} · GreenX · {r.key}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: T.forest }}>
            {r.monthlyNet != null ? inr(r.monthlyNet) : '—'}
            <span style={{ fontSize: 12, fontWeight: 500, color: T.muted }}>/mo</span>
          </div>
          <div style={{ fontSize: 12, color: T.muted }}>monthly rent + GST</div>
        </div>
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.muted, marginBottom: 4 }}>
          <span>{scheduleLabel}</span>
          {r.nextInvoiceDate && <span>Next invoice {r.nextInvoiceDate}</span>}
        </div>
        <div style={{ height: 6, background: T.paper, borderRadius: 999, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: T.green2 }} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <Fact label="Upfront" value={inr(r.upfrontGross)} chip={chip} />
        <Fact label={`Recurring (${periods} mo)`} value={inr(r.recurringNet)} />
        <Fact label="TCV (net)" value={inrShort(r.tcvNet)} strong />
      </div>
    </div>
  );
}

function Fact({ label, value, chip, strong }: {
  label: string; value: string;
  chip?: { bg: string; fg: string; label: string }; strong?: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3, color: T.faint }}>{label}</span>
      <span style={{ fontSize: strong ? 16 : 14, fontWeight: strong ? 700 : 600, color: strong ? T.forest : T.ink }}>{value}</span>
      {chip && (
        <span style={{
          fontSize: 10, fontWeight: 700, color: chip.fg, background: chip.bg,
          padding: '1px 6px', borderRadius: 999, width: 'fit-content',
        }}>{chip.label}</span>
      )}
    </div>
  );
}