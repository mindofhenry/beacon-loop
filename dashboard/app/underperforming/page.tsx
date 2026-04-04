'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function UnderperformingRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/insights')
  }, [router])
  return null
}
