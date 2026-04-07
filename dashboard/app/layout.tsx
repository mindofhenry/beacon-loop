import type { Metadata } from 'next'
import { Space_Grotesk, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { RoleProvider } from '@/context/RoleContext'
import { RewriteDrawerProvider } from '@/context/RewriteDrawerContext'
import Nav from '@/components/Nav'
import RewriteDrawer from '@/components/RewriteDrawer'
import AskBeaconModal from '@/components/AskBeaconModal'

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['700'],
  variable: '--font-heading',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
})

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
    <html lang="en" className={`h-full ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}>
      <body className="flex flex-row h-screen overflow-hidden bg-[#FAFAFA] text-gray-900 font-sans antialiased">
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
