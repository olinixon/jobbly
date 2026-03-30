export default function JobsBookedLoading() {
  return (
    <div className="flex min-h-screen bg-[#F9FAFB] dark:bg-[#0F172A]">
      <div className="fixed top-0 left-0 h-full w-56 bg-white dark:bg-[#1E293B] border-r border-[#E5E7EB] dark:border-[#334155]" />
      <div className="flex-1 md:ml-56 px-6 pb-6 pt-16 animate-pulse">
        <div className="mb-6">
          <div className="h-7 bg-gray-200 dark:bg-[#334155] rounded w-32 mb-2" />
          <div className="h-4 bg-gray-200 dark:bg-[#334155] rounded w-72" />
        </div>
        <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl overflow-hidden">
          <div className="flex gap-4 p-4 border-b border-[#E5E7EB] dark:border-[#334155]">
            {[24, 80, 140, 200, 120, 80, 80, 72].map((w, i) => (
              <div key={i} className="h-4 bg-gray-200 dark:bg-[#334155] rounded" style={{ width: w }} />
            ))}
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-4 p-4 border-b border-[#F3F4F6] dark:border-[#334155]">
              <div className="w-2.5 h-2.5 bg-gray-200 dark:bg-[#334155] rounded-full mt-1" />
              <div className="h-4 bg-gray-200 dark:bg-[#334155] rounded w-24" />
              <div className="h-4 bg-gray-200 dark:bg-[#334155] rounded w-36" />
              <div className="h-4 bg-gray-200 dark:bg-[#334155] rounded w-48" />
              <div className="h-4 bg-gray-200 dark:bg-[#334155] rounded w-28" />
              <div className="h-4 bg-gray-200 dark:bg-[#334155] rounded w-20" />
              <div className="h-4 bg-gray-200 dark:bg-[#334155] rounded w-16" />
              <div className="h-4 bg-gray-200 dark:bg-[#334155] rounded w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
