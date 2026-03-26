import { SelectHTMLAttributes } from 'react'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options: { value: string; label: string }[]
}

export default function Select({ label, error, options, className = '', ...props }: SelectProps) {
  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-[#374151] dark:text-[#CBD5E1] mb-1">
          {label}
        </label>
      )}
      <select
        className={`w-full px-3 py-2 text-sm bg-white dark:bg-[#0F172A] border rounded-lg text-[#111827] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#2563EB] transition ${
          error
            ? 'border-[#DC2626]'
            : 'border-[#E5E7EB] dark:border-[#334155]'
        } ${className}`}
        {...props}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-xs text-[#DC2626]">{error}</p>}
    </div>
  )
}
