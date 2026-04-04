import type { Metadata } from 'next'
import './globals.css'
import { RoleProvider } from '@/context/RoleContext'
import { RewriteDrawerProvider } from '@/context/RewriteDrawerContext'
import Nav from '@/components/Nav'
import RewriteDrawer from '@/components/RewriteDrawer'
import AskBeaconModal from '@/components/AskBeaconModal'

export const metadata: Metadata = {
  title: 'Beacon',
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
        <RoleProvider>
          <RewriteDrawerProvider>
            <Nav />
            <main className="flex-1 overflow-y-auto">{children}</main>
            <RewriteDrawer />
            <AskBeaconModal />
          </RewriteDrawerProvider>
        </RoleProvider>
      </body>
    </html>
  )
}
