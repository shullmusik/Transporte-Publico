import { useMemo, useState } from 'react'
import type { EstadoFlota, LiveUnit, Nodo, Ruta } from '@/types'
import { ordenarPorRiesgo } from '@/lib/anomaly'
import { UnitRow } from './UnitRow'
import { FleetMap } from './FleetMap'

interface Props {
  nodos: Nodo[]
  rutas: Ruta[]
  units: LiveUnit[]
  onCheckIn: (despachoId: string, nodoId: string) => Promise<unknown>
  onTaller: (ecoId: string, aTaller: boolean) => Promise<unknown>
}

type Filtro = 'todas' | 'alertas' | 'ruta' | 'base'

/**
 * Semáforo de flota global: buscador por ECO, filtros rápidos, lista ordenada
 * por riesgo (pánico primero) y mapa que enfoca la unidad seleccionada.
 */
export function FleetMonitor({ nodos, rutas, units, onCheckIn, onTaller }: Props) {
  const [query, setQuery] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [selected, setSelected] = useState<string | null>(null)

  const conteo = useMemo(() => {
    const c: Record<'danger' | 'warn' | 'ok' | 'base' | 'taller', number> = { danger: 0, warn: 0, ok: 0, base: 0, taller: 0 }
    const grupo: Record<EstadoFlota, keyof typeof c> = {
      EMERGENCIA_PANICO: 'danger', DESVIO: 'danger', RETRASO_SOSPECHOSO: 'warn', SIN_SENAL: 'warn',
      EN_TRAYECTO_OK: 'ok', EN_BASE: 'base', MANTENIMIENTO: 'taller',
    }
    for (const u of units) c[grupo[u.estado]]++
    return c
  }, [units])

  const filtradas = useMemo(() => {
    const q = query.trim().toLowerCase()
    let xs = units
    if (filtro === 'alertas') xs = xs.filter((u) => ['EMERGENCIA_PANICO', 'DESVIO', 'RETRASO_SOSPECHOSO', 'SIN_SENAL'].includes(u.estado))
    if (filtro === 'ruta') xs = xs.filter((u) => u.unidad.estadoActual === 'EN_RUTA')
    if (filtro === 'base') xs = xs.filter((u) => u.unidad.estadoActual === 'EN_BASE')
    if (q) {
      // Consulta numérica = número ECO (exacto o prefijo). Texto = placas o chofer.
      const numerica = /^\d+$/.test(q)
      xs = xs.filter((u) =>
        numerica
          ? u.unidad.numeroEco === Number(q) || String(u.unidad.numeroEco).startsWith(q)
          : u.unidad.placas.toLowerCase().includes(q) || (u.chofer?.nombre.toLowerCase().includes(q) ?? false),
      )
    }
    return ordenarPorRiesgo(xs)
  }, [units, query, filtro])

  const focusId = filtradas.length === 1 ? filtradas[0].unidad.id : selected

  return (
    <section className="space-y-3">
      <input
        type="search"
        inputMode="numeric"
        placeholder="Buscar ECO (ej. 14), placas o chofer"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full min-h-touch rounded-xl bg-slate-800 border border-slate-600 px-4 text-xl font-bold placeholder:text-slate-500"
        aria-label="Buscar unidad"
      />

      <div className="grid grid-cols-4 gap-1.5 text-center font-extrabold text-sm">
        <Chip active={filtro === 'alertas'} onClick={() => setFiltro(filtro === 'alertas' ? 'todas' : 'alertas')} className="bg-danger">
          {conteo.danger + conteo.warn} <small>ALERTA</small>
        </Chip>
        <Chip active={filtro === 'ruta'} onClick={() => setFiltro(filtro === 'ruta' ? 'todas' : 'ruta')} className="bg-ok">
          {conteo.ok + conteo.danger + conteo.warn} <small>EN RUTA</small>
        </Chip>
        <Chip active={filtro === 'base'} onClick={() => setFiltro(filtro === 'base' ? 'todas' : 'base')} className="bg-slate-600">
          {conteo.base} <small>EN BASE</small>
        </Chip>
        <Chip active={false} onClick={() => setFiltro('todas')} className="bg-slate-800 border border-slate-600">
          {conteo.taller} <small>TALLER</small>
        </Chip>
      </div>

      <FleetMap nodos={nodos} rutas={rutas} units={units} focusEcoId={focusId} className="h-64" />

      <ul className="space-y-1.5">
        {filtradas.map((u) => (
          <UnitRow
            key={u.unidad.id}
            unit={u}
            selected={selected === u.unidad.id}
            onSelect={() => setSelected(selected === u.unidad.id ? null : u.unidad.id)}
            onCheckIn={u.despacho ? () => onCheckIn(u.despacho!.id, u.despacho!.nodoLlegadaId) : undefined}
            onTaller={u.unidad.estadoActual !== 'EN_RUTA' ? () => onTaller(u.unidad.id, u.unidad.estadoActual !== 'MANTENIMIENTO') : undefined}
          />
        ))}
        {filtradas.length === 0 && <li className="card text-center text-slate-400">Ninguna unidad coincide.</li>}
      </ul>
    </section>
  )
}

function Chip({ active, onClick, className, children }: { active: boolean; onClick: () => void; className: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={active} className={`min-h-[44px] rounded-xl leading-tight ${className} ${active ? 'ring-2 ring-white' : ''}`}>
      {children}
    </button>
  )
}
