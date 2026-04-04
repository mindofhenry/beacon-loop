'use client'

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

export type Role = 'manager' | 'revops' | 'rep'

type RoleContextType = {
  role: Role
  setRole: (role: Role) => void
}

const RoleContext = createContext<RoleContextType>({
  role: 'manager',
  setRole: () => {},
})

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role>('manager')

  useEffect(() => {
    const stored = localStorage.getItem('beacon-loop-role')
    if (stored === 'manager' || stored === 'revops' || stored === 'rep') {
      setRoleState(stored)
    }
  }, [])

  function setRole(newRole: Role) {
    setRoleState(newRole)
    localStorage.setItem('beacon-loop-role', newRole)
  }

  return (
    <RoleContext.Provider value={{ role, setRole }}>
      {children}
    </RoleContext.Provider>
  )
}

export function useRole() {
  return useContext(RoleContext)
}
