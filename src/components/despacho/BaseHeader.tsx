import type { Nodo, PuntoControl } from '@/types'
import { Clock } from '@/components/ui/Clock'

export type Puesto = 'SALIDA' | 'INTERMEDIO' | 'LLEGADA'

interface Props {
  puesto: Puesto
  onChangePuesto: (p: Puesto) => void
  bases: Nodo[]
  nodos: Nodo[]
  puntosIntermedios: PuntoControl[]
  lugarId: string
  onChangeLugar: (id: string) => void
  checadorNombre: string
  resumen: string
}

const PUESTOS: { id: Puesto; label: string; icono: string }[] = [
  { id: 'SALIDA', label: 'Salida', icono: '🚏' },
  { id: 'INTERMEDIO', label: 'Intermedio', icono: '📍' },
  { id: 'LLEGADA', label: 'Llegada', icono: '🏁' },
]

/**
 * El checador elige su puesto (dónde está parado) y el lugar concreto:
 *  - Salida: una base (fila de espera + despacho)
 *  - Intermedio: uno de los puntos de control de la calle
 *  - Llegada: el destino de ruta donde recibe las unidades
 */
export function BaseHeader({ puesto, onChangePuesto, bases, nodos, puntosIntermedios, lugarId, onChangeLugar, checadorNombre, resumen }: Props) {
  const lugares: { id: string; nombre: string }[] =
    puesto === 'SALIDA' ? bases : puesto === 'INTERMEDIO' ? puntosIntermedios : nodos
  return (
    <header className="card space-y-2">
      <div className="flex gap-1.5" role="tablist" aria-label="Puesto de checador">
        {PUESTOS.map((p) => (
          <button
            key={p.id}
            role="tab"
            aria-selected={p.id === puesto}
            onClick={() => onChangePuesto(p.id)}
            className={`min-h-touch flex-1 rounded-xl px-2 text-sm font-extrabold uppercase tracking-wide ${
              p.id === puesto ? 'bg-white text-slate-950' : 'bg-slate-800 border border-slate-600 text-slate-300'
            }`}
          >
            <span aria-hidden>{p.icono}</span> {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <label className="flex-1 min-w-0">
          <span className="sr-only">Lugar</span>
          <select
            className="w-full min-h-touch bg-slate-800 border border-slate-600 rounded-xl px-3 text-lg font-extrabold"
            value={lugarId}
            onChange={(e) => onChangeLugar(e.target.value)}
          >
            {lugares.map((l) => (
              <option key={l.id} value={l.id}>{l.nombre}</option>
            ))}
          </select>
        </label>
        <Clock className="text-2xl shrink-0" />
      </div>
      <p className="text-xs text-slate-400 truncate">
        {checadorNombre} · {resumen}
      </p>
    </header>
  )
}
