import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { LiveUnit, Nodo } from '@/types'
import { esAlerta } from '@/lib/anomaly'
import { fmtTime } from '@/lib/time'
import { StatusBadge, toneBorder, ecoLabel } from '@/components/ui/StatusBadge'

interface Props {
  base: Nodo
  llegadas: LiveUnit[]        // unidades en ruta cuyo nodo de llegada es esta base
  onCheckIn: (despachoId: string) => Promise<unknown>
}

/**
 * Check-in en un toque. Ordenado por hora de llegada estimada; las vencidas
 * (ya debieron llegar) van arriba en ámbar/rojo para que el checador las vea primero.
 */
export function ArrivalsPanel({ base, llegadas, onCheckIn }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const lock = useRef(false)
  const ordenadas = [...llegadas].sort((a, b) => (a.restanteMin ?? 0) - (b.restanteMin ?? 0))

  async function llego(u: LiveUnit) {
    if (lock.current || !u.despacho) return
    lock.current = true
    setBusyId(u.despacho.id)
    try {
      await onCheckIn(u.despacho.id)
      if (navigator.vibrate) navigator.vibrate(40)
    } finally {
      lock.current = false
      setBusyId(null)
    }
  }

  return (
    <section className="card space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-extrabold">Llegadas a {base.nombre}</h2>
        <span className="label">{ordenadas.length} en camino</span>
      </div>
      {ordenadas.length === 0 && <p className="text-slate-400 text-sm">Ninguna unidad viene hacia esta base.</p>}
      <ul className="space-y-1.5">
        {ordenadas.map((u) => {
          const r = u.restanteMin ?? 0
          const vencida = r < 0
          return (
            <li key={u.unidad.id} className={`rounded-xl bg-slate-800 border-l-8 ${toneBorder[u.estado]} px-3 py-2 flex items-center gap-3`}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xl font-extrabold">{ecoLabel(u.unidad.numeroEco)}</span>
                  {esAlerta(u.estado) && <StatusBadge estado={u.estado} size="sm" />}
                </div>
                <p className="text-sm text-slate-300 truncate">
                  {u.ruta?.nombre} · {u.sentido}
                </p>
                <p className={`text-sm font-bold ${vencida ? 'text-warn' : 'text-slate-300'}`}>
                  {Math.abs(r) < 1 ? 'Llegando ahora' : vencida ? `Debió llegar hace ${Math.round(-r)} min` : `Llega en ~${Math.round(r)} min`} · prog. {u.despacho && fmtTime(u.despacho.horaLlegadaEstimada, false)}
                  {u.etaGpsMin !== undefined && <span className="text-slate-400 font-normal"> · GPS {Math.round(u.etaGpsMin)} min</span>}
                </p>
              </div>
              {esAlerta(u.estado) && u.estado !== 'RETRASO_SOSPECHOSO' ? (
                <Link to={`/ficha/${u.unidad.id}`} className="btn-danger min-w-[92px] text-base">
                  Reportar
                </Link>
              ) : (
                <button className="btn-ok min-w-[92px] text-lg" disabled={busyId === u.despacho?.id} onClick={() => llego(u)}>
                  LLEGÓ
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
