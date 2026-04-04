'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

type RewriteDrawerContextType = {
  isOpen: boolean
  stepId: string | null
  openDrawer: (stepId: string) => void
  closeDrawer: () => void
}

const RewriteDrawerContext = createContext<RewriteDrawerContextType>({
  isOpen: false,
  stepId: null,
  openDrawer: () => {},
  closeDrawer: () => {},
})

export function RewriteDrawerProvider({ children }: { children: ReactNode }) {
  const [stepId, setStepId] = useState<string | null>(null)

  const openDrawer = useCallback((id: string) => {
    setStepId(id)
  }, [])

  const closeDrawer = useCallback(() => {
    setStepId(null)
  }, [])

  return (
    <RewriteDrawerContext.Provider
      value={{ isOpen: stepId !== null, stepId, openDrawer, closeDrawer }}
    >
      {children}
    </RewriteDrawerContext.Provider>
  )
}

export function useRewriteDrawer() {
  return useContext(RewriteDrawerContext)
}
