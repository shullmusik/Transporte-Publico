import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useFleetStore, useLiveUnits } from '@/store/useFleetStore'
import { startGpsTracker } from '@/services/geolocation'
import { fmtTime } from '@/lib/time'
import { ecoLabel } from '@/components/ui/StatusBadge'
import type { SemaforoChofer } from '@/types'

const SEMAFORO: Record<SemaforoChofer, { bg: string; label: string; consejo: string }> = {
  EN_TIEMPO: { bg: 'bg-ok', label: 'EN TIEMPO', consejo: 'Mantén el ritmo' },
  RETRASADO: { bg: 'bg-warn text-slate-950', label: 'RETRASADO', consejo: 'Reduce paradas, no corras' },
  ADELANTADO: { bg: 'bg-danger', label: 'ADELANTADO', consejo: 'Baja el ritmo · vas carreado' },
}

/**
 * App del chofer (modo conducción). Selección de ECO, semáforo de intervalo,
 * GPS continuo y botón de pánico silencioso (presión 3 s, sin sonido ni cambio de luz).
 */
export function ChoferPage() {
  const units = useLiveUnits()
  const backend = useFleetStore((s) => s.backend)
  const setPanico = useFleetStore((s) => s.setPanico)
  const [ecoId, setEcoId] = useState<string>('')
  const [gpsReal, setGpsReal] = useState(false)
  const [gpsError, setGpsError] = useState<string | null>(null)
  const unit = units.find((u) => u.unidad.id === ecoId) ?? units.find((u) => u.despacho)
  const tracker = useRef<ReturnType<typeof startGpsTracker> | null>(null)

  // GPS del dispositivo → backend (en producción siempre activo durante el turno)
  useEffect(() => {
    tracker.current?.stop()
    tracker.current = null
    if (!gpsReal || !unit || !backend) return
    tracker.current = startGpsTracker({ ecoId: unit.unidad.id, send: (p) => backend.enviarPing(p), onError: (e) => setGpsError(e.message) })
    return () => tracker.current?.stop()
  }, [gpsReal, unit?.unidad.id, backend]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    tracker.current?.setPanic(Boolean(unit?.despacho?.panicoActivo))
  }, [unit?.despacho?.panicoActivo])

  // ---- Pánico: presión prolongada 3 s ----
  const [holding, setHolding] = useState(0)
  const timer = useRef<number | undefined>(undefined)
  const start = useRef(0)
  function press() {
    start.current = Date.now()
    timer.current = window.setInterval(() => {
      const p = Math.min(1, (Date.now() - start.current) / 3000)
      setHolding(p)
      if (p >= 1) {
        release()
        if (unit?.despacho) void setPanico(unit.despacho.id, true)
      }
    }, 50)
  }
  function release() {
    clearInterval(timer.current)
    setHolding(0)
  }

  if (!unit) return <p className="p-6 text-center text-slate-400">Cargando…</p>
  const d = unit.despacho
  const sem = unit.semaforo ? SEMAFORO[unit.semaforo] : null

  return (
    <div className="min-h-dvh max-w-lg mx-auto p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Link to="/" className="btn-ghost text-base">← Checador</Link>
        <select className="min-h-touch bg-slate-800 border border-slate-600 rounded-xl px-3 font-bold" value={unit.unidad.id} onChange={(e) => setEcoId(e.target.value)}>
          {units
            .filter((u) => u.unidad.estadoActual !== 'MANTENIMIENTO')
            .map((u) => (
              <option key={u.unidad.id} value={u.unidad.id}>
                {ecoLabel(u.unidad.numeroEco)} {u.despacho ? '· en ruta' : '· en base'}
              </option>
            ))}
        </select>
      </div>

      {d && unit.ruta ? (
        <>
          <section className={`rounded-2xl p-5 text-center ${sem?.bg ?? 'bg-slate-800'}`} aria-live="polite">
            <p className="text-xs font-bold uppercase tracking-widest opacity-90">{unit.ruta.nombre} · {unit.sentido}</p>
            <p className="text-huge mt-1">{sem?.label ?? '—'}</p>
            <p className="text-lg font-bold mt-1">{sem?.consejo}</p>
          </section>
          <section className="card grid grid-cols-3 text-center">
            <div><p className="label">Salida</p><p className="text-2xl font-extrabold font-mono">{fmtTime(d.horaSalidaReal, false)}</p></div>
            <div><p className="label">Llegada prog.</p><p className="text-2xl font-extrabold font-mono">{fmtTime(d.horaLlegadaEstimada, false)}</p></div>
            <div>
              <p className="label">Restante</p>
              <p className={`text-2xl font-extrabold font-mono ${(unit.restanteMin ?? 0) < 0 ? 'text-warn' : ''}`}>{Math.round(unit.restanteMin ?? 0)}′</p>
            </div>
          </section>
          <p className="text-xs text-slate-400 text-center">
            Destino: {unit.nodoDestino?.nombre} · Check-in en {unit.nodoLlegada?.nombre}
            {unit.etaGpsMin !== undefined && ` · ETA GPS ${Math.round(unit.etaGpsMin)} min`}
          </p>
        </>
      ) : (
        <section className="card text-center py-8">
          <p className="text-2xl font-extrabold">{ecoLabel(unit.unidad.numeroEco)} en {unit.nodoOrigen?.nombre}</p>
          <p className="text-slate-400 mt-1">Esperando asignación del checador…</p>
        </section>
      )}

      <label className="card flex items-center justify-between gap-3 text-sm">
        <span>
          <b>GPS del dispositivo</b>
          <span className="block text-slate-400">{gpsError ?? (gpsReal ? 'Transmitiendo cada 15 s (3 s en pánico)' : 'Usando posición simulada')}</span>
        </span>
        <input type="checkbox" className="w-6 h-6" checked={gpsReal} onChange={(e) => setGpsReal(e.target.checked)} />
      </label>

      {d?.panicoActivo ? (
        <button className="w-full min-h-[40vh] rounded-3xl bg-slate-900 border border-slate-700 text-slate-500 text-base" onClick={() => setPanico(d.id, false)}>
          {/* Sin cambio visible para terceros. Un toque largo por el checador/admin lo desactiva; aquí simplificado para demo. */}
          <span className="inline-block w-2 h-2 rounded-full bg-slate-600 mr-2 align-middle" />
          Base notificada · toca para cancelar (solo demo)
        </button>
      ) : (
        <button
          className="w-full min-h-[40vh] rounded-3xl bg-slate-900 border border-slate-700 relative overflow-hidden text-xl font-bold text-slate-500"
          onPointerDown={press}
          onPointerUp={release}
          onPointerLeave={release}
          onContextMenu={(e) => e.preventDefault()}
          disabled={!d}
          aria-label="Botón de pánico: mantener presionado 3 segundos"
        >
          <span className="absolute bottom-0 left-0 h-1 bg-slate-600" style={{ width: `${holding * 100}%` }} />
          {d ? 'Mantener presionado 3 s' : 'Sin despacho activo'}
        </button>
      )}
    </div>
  )
}
