import { Link } from 'react-router-dom'
import type { LiveUnit } from '@/types'
import { fmtAgo } from '@/lib/time'
import { ecoLabel } from '@/components/ui/StatusBadge'

/**
 * Banner fijo superior: visible en cualquier pestaña del checador mientras
 * exista una unidad con pánico activo o desvío. Un toque abre la ficha.
 */
export function PanicBanner({ units }: { units: LiveUnit[] }) {
  // Pánico primero; máximo 2 banners para no tapar el tablero (el resto se ve en Monitor)
  const criticas = units
    .filter((u) => u.estado === 'EMERGENCIA_PANICO' || u.estado === 'DESVIO')
    .sort((a, b) => (a.estado === 'EMERGENCIA_PANICO' ? 0 : 1) - (b.estado === 'EMERGENCIA_PANICO' ? 0 : 1))
  if (criticas.length === 0) return null
  const visibles = criticas.slice(0, 2)
  const resto = criticas.length - visibles.length
  return (
    <div className="sticky top-0 z-[1000] space-y-1 p-2 bg-slate-950/95 backdrop-blur" role="alert" aria-live="assertive">
      {resto > 0 && <p className="text-xs font-bold text-danger text-center">+{resto} unidad(es) más en estado crítico · ver Monitor</p>}
      {visibles.map((u) => (
        <Link
          key={u.unidad.id}
          to={`/ficha/${u.unidad.id}`}
          className={`flex items-center justify-between gap-3 rounded-xl bg-danger px-4 py-2.5 ${u.estado === 'EMERGENCIA_PANICO' ? 'pulse-danger' : ''}`}
        >
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-widest">
              {u.estado === 'EMERGENCIA_PANICO' ? `🚨 Pánico ${u.despacho?.panicoDesde ? fmtAgo(u.despacho.panicoDesde) : ''}` : '⚠ Desvío de ruta'}
            </p>
            <p className="text-xl font-extrabold leading-tight truncate">
              {ecoLabel(u.unidad.numeroEco)} · {u.ruta?.nombre}
            </p>
          </div>
          <span className="btn bg-white text-danger text-base shrink-0 min-h-[44px]">Reportar →</span>
        </Link>
      ))}
    </div>
  )
}
