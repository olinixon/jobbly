import { InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export default function Input({ label, error, className = '', ...props }: InputProps) {
  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-[#374151] dark:text-[#CBD5E1] mb-1">
          {label}
        </label>
      )}
      <input
        className={`w-full px-3 py-2 text-sm bg-white dark:bg-[#0F172A] border rounded-lg text-[#111827] dark:text-[#F1F5F9] placeholder-[#9CA3AF] dark:placeholder-[#475569] focus:outline-none focus:ring-2 focus:ring-[#2563EB] transition ${
          error
            ? 'border-[#DC2626] focus:ring-[#DC2626]'
            : 'border-[#E5E7EB] dark:border-[#334155]'
        } ${className}`}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-[#DC2626]">{error}</p>}
    </div>
  )
}
