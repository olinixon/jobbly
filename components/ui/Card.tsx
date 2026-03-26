interface StatCardProps {
  label: string
  value: string | number
  prefix?: string
}

export function StatCard({ label, value, prefix }: StatCardProps) {
  return (
    <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-5 shadow-sm">
      <p className="text-sm text-[#6B7280] dark:text-[#94A3B8]">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-[#111827] dark:text-[#F1F5F9]">
        {prefix}{value}
      </p>
    </div>
  )
}

interface CardProps {
  children: React.ReactNode
  className?: string
}

export function Card({ children, className = '' }: CardProps) {
  return (
    <div className={`bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl shadow-sm ${className}`}>
      {children}
    </div>
  )
}
