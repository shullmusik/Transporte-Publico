import { useEffect, useMemo } from 'react'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { useFleetStore } from '@/store/useFleetStore'
import type { FleetBackend } from '@/services/backend'
import { MockBackend } from '@/mock/simulator'
import { ChecadorPage } from '@/pages/ChecadorPage'
import { FichaPage } from '@/pages/FichaPage'
import { ChoferPage } from '@/pages/ChoferPage'

async function createBackend(): Promise<FleetBackend> {
  if (import.meta.env.VITE_BACKEND === 'supabase') {
    const { SupabaseBackend } = await import('@/services/supabase')
    return new SupabaseBackend()
  }
  return new MockBackend()
}

export default function App() {
  const connect = useFleetStore((s) => s.connect)
  const backendPromise = useMemo(createBackend, [])

  useEffect(() => {
    let dispose: (() => void) | undefined
    let cancelled = false
    void backendPromise.then((b) => {
      // Si el efecto ya se limpió (StrictMode / navegación) no dejamos una suscripción huérfana
      if (cancelled) return
      dispose = connect(b)
    })
    return () => {
      cancelled = true
      dispose?.()
    }
  }, [backendPromise, connect])

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/" element={<ChecadorPage />} />
        <Route path="/ficha/:ecoId" element={<FichaPage />} />
        <Route path="/chofer" element={<ChoferPage />} />
        <Route
          path="*"
          element={
            <div className="p-6 text-center">
              <Link to="/" className="btn-ghost inline-flex">← Inicio</Link>
            </div>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
