'use client'

import { useState, useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { Sparkles, X } from 'lucide-react'
import AskBeacon, { type PageKey } from './AskBeacon'

function pathnameToPage(pathname: string): PageKey {
  if (pathname === '/') return 'overview'
  if (pathname.startsWith('/insights')) return 'insights'
  if (pathname.startsWith('/reps')) return 'reps'
  if (pathname.startsWith('/sequences')) return 'sequences'
  return 'overview'
}

export default function AskBeaconModal() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const page = pathnameToPage(pathname)

  // Hide FAB on insights page (Ask Beacon is already prominent there)
  const isInsightsPage = pathname.startsWith('/insights')

  // Body scroll lock
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    }
  }, [open])

  // Close on Escape
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') setOpen(false)
  }, [])

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, handleKeyDown])

  if (isInsightsPage) return null

  return (
    <>
      {/* FAB */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Ask Beacon"
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          width: '52px',
          height: '52px',
          borderRadius: '50%',
          border: '1px solid #252525',
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
          color: '#3b82f6',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 40,
          boxShadow: '0 4px 20px rgba(59, 130, 246, 0.15)',
          transition: 'transform 150ms ease, box-shadow 150ms ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.08)'
          e.currentTarget.style.boxShadow = '0 6px 28px rgba(59, 130, 246, 0.25)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)'
          e.currentTarget.style.boxShadow = '0 4px 20px rgba(59, 130, 246, 0.15)'
        }}
      >
        <Sparkles size={22} />
      </button>

      {/* Modal overlay */}
      {open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Scrim */}
          <div
            onClick={() => setOpen(false)}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.6)',
              backdropFilter: 'blur(4px)',
            }}
          />

          {/* Modal content */}
          <div
            style={{
              position: 'relative',
              width: '520px',
              maxWidth: 'calc(100vw - 48px)',
              maxHeight: 'calc(100vh - 96px)',
              background: '#0c0c0c',
              border: '1px solid #1c1c1c',
              borderRadius: '12px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
              animation: 'modalSlideUp 200ms ease-out',
            }}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                borderBottom: '1px solid #1c1c1c',
              }}
            >
              <div className="flex items-center gap-2">
                <Sparkles size={16} style={{ color: '#3b82f6' }} />
                <span className="font-sans text-[17px] font-medium" style={{ color: '#e5e5e5' }}>
                  Ask Beacon
                </span>
              </div>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#555',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '4px',
                  borderRadius: '4px',
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
              <AskBeacon page={page} variant="modal" />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
