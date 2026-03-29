'use client'

interface StatEntry {
  label: string
  value: string
}

interface DashboardExportButtonProps {
  stats: StatEntry[]
  dateLabel: string
}

export default function DashboardExportButton({ stats, dateLabel }: DashboardExportButtonProps) {
  return (
    <>
      {/* Print-only header — hidden on screen, visible when printing */}
      <div className="print-only mb-6">
        <div style={{ borderBottom: '2px solid #111', paddingBottom: '12px', marginBottom: '16px' }}>
          <div style={{ fontSize: '20px', fontWeight: 700 }}>Jobbly — Dashboard Summary</div>
          <div style={{ fontSize: '13px', color: '#555', marginTop: '4px' }}>
            Period: {dateLabel} · Generated: {new Date().toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          {stats.map((s) => (
            <div key={s.label} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', marginBottom: '4px' }}>{s.label}</div>
              <div style={{ fontSize: '18px', fontWeight: 700 }}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Export button — hidden when printing */}
      <button
        onClick={() => window.print()}
        className="no-print px-4 py-2 text-sm font-medium border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1E293B] text-[#374151] dark:text-[#CBD5E1] hover:bg-[#F3F4F6] dark:hover:bg-[#334155] transition-colors"
      >
        Export PDF
      </button>
    </>
  )
}
