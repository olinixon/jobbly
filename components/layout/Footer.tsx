import pkg from '@/package.json'

export default function Footer() {
  return (
    <footer className="mt-auto py-4 px-6 text-right text-xs text-[#9CA3AF] dark:text-[#475569]">
      Jobbly by Omniside AI &nbsp;·&nbsp; v{pkg.version}
    </footer>
  )
}
