export default function CalendarLoading() {
  return (
    <div className="flex min-h-screen bg-[#F9FAFB] dark:bg-[#0F172A]">
      <div className="fixed top-0 left-0 h-full w-56 bg-white dark:bg-[#1E293B] border-r border-[#E5E7EB] dark:border-[#334155]" />
      <div className="flex-1 md:ml-56 px-6 pb-6 pt-16 animate-pulse">
        <div className="mb-6">
          <div className="h-7 bg-gray-200 dark:bg-[#334155] rounded w-28 mb-2" />
        </div>
        <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6">
          {/* Calendar header */}
          <div className="flex justify-between items-center mb-6">
            <div className="h-6 bg-gray-200 dark:bg-[#334155] rounded w-40" />
            <div className="flex gap-2">
              <div className="h-8 bg-gray-200 dark:bg-[#334155] rounded w-20" />
              <div className="h-8 bg-gray-200 dark:bg-[#334155] rounded w-20" />
            </div>
          </div>
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="h-4 bg-gray-200 dark:bg-[#334155] rounded" />
            ))}
          </div>
          {/* Calendar cells */}
          {Array.from({ length: 5 }).map((_, row) => (
            <div key={row} className="grid grid-cols-7 gap-1 mb-1">
              {Array.from({ length: 7 }).map((_, col) => (
                <div key={col} className="h-20 bg-gray-100 dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
