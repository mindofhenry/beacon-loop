import type { Metadata } from 'next'
import './globals.css'
import Nav from '@/components/Nav'

export const metadata: Metadata = {
  title: 'Beacon Loop',
  description: 'Step-level sequence attribution dashboard',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="h-full">
      <body className="flex flex-row h-screen overflow-hidden bg-[#0a0a0a] text-slate-100 font-sans antialiased">
        <Nav />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </body>
    </html>
  )
}
