export default function LeadDetailLoading() {
  return (
    <div className="flex min-h-screen bg-[#F9FAFB] dark:bg-[#0F172A]">
      <div className="fixed top-0 left-0 h-full w-56 bg-white dark:bg-[#1E293B] border-r border-[#E5E7EB] dark:border-[#334155]" />
      <div className="flex-1 md:ml-56 px-6 pb-6 pt-16 animate-pulse">
        {/* Back link */}
        <div className="h-4 bg-gray-200 dark:bg-[#334155] rounded w-20 mb-6" />
        {/* Title + badge */}
        <div className="flex items-center gap-4 mb-6">
          <div className="h-8 bg-gray-200 dark:bg-[#334155] rounded w-32" />
          <div className="h-6 bg-gray-200 dark:bg-[#334155] rounded w-24" />
        </div>
        {/* Status pipeline */}
        <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6 mb-6">
          <div className="flex justify-between">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-2">
                <div className="w-8 h-8 bg-gray-200 dark:bg-[#334155] rounded-full" />
                <div className="h-3 bg-gray-200 dark:bg-[#334155] rounded w-20" />
              </div>
            ))}
          </div>
        </div>
        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6">
                <div className="h-5 bg-gray-200 dark:bg-[#334155] rounded w-32 mb-4" />
                {Array.from({ length: 5 }).map((_, j) => (
                  <div key={j} className="flex justify-between mb-3">
                    <div className="h-4 bg-gray-200 dark:bg-[#334155] rounded w-24" />
                    <div className="h-4 bg-gray-200 dark:bg-[#334155] rounded w-40" />
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="space-y-6">
            <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6">
              <div className="h-5 bg-gray-200 dark:bg-[#334155] rounded w-36 mb-4" />
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-10 bg-gray-200 dark:bg-[#334155] rounded mb-3" />
              ))}
            </div>
            <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6">
              <div className="h-5 bg-gray-200 dark:bg-[#334155] rounded w-24 mb-4" />
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="flex justify-between mb-3">
                  <div className="h-4 bg-gray-200 dark:bg-[#334155] rounded w-28" />
                  <div className="h-4 bg-gray-200 dark:bg-[#334155] rounded w-20" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
