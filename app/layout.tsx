import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Jobbly',
  description: 'Campaign tracking and commission dashboard by Omniside AI',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('jobbly-theme');if(t==='dark')document.documentElement.classList.add('dark');}catch(e){}` }} />
      </head>
      <body className={`${inter.className} min-h-screen`}>{children}</body>
    </html>
  )
}
