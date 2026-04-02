'use client'

interface ModalProps {
  title: string
  onClose: () => void
  children: React.ReactNode
}

export default function Modal({ title, onClose, children }: ModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white dark:bg-[#1E293B] rounded-xl shadow-xl w-full max-w-md p-6 z-10 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[#111827] dark:text-[#F1F5F9]">{title}</h2>
          <button
            onClick={onClose}
            className="text-[#6B7280] hover:text-[#111827] dark:hover:text-[#F1F5F9] text-xl leading-none"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
