import { Link } from 'react-router-dom'
import type { LiveUnit } from '@/types'
import { esAlerta } from '@/lib/anomaly'
import { fmtAgo, fmtTime } from '@/lib/time'
import { StatusBadge, toneBorder } from '@/components/ui/StatusBadge'

interface Props {
  unit: LiveUnit
  selected: boolean
  onSelect: () => void
  onCheckIn?: () => void
  onTaller?: () => void
}

export function UnitRow({ unit: u, selected, onSelect, onCheckIn, onTaller }: Props) {
  const alerta = esAlerta(u.estado)
  const linea2 =
    u.unidad.estadoActual === 'EN_BASE'
      ? `En ${u.nodoOrigen?.nombre ?? 'base'}${u.unidad.enBaseDesde ? ` · formada ${fmtAgo(u.unidad.enBaseDesde)}` : ''}`
      : u.unidad.estadoActual === 'MANTENIMIENTO'
        ? 'En taller'
        : `${u.ruta?.nombre ?? ''} · ${u.sentido ?? ''}`
  const linea3 =
    u.despacho && u.restanteMin !== undefined
      ? u.restanteMin < 0
        ? `Debió llegar hace ${Math.round(-u.restanteMin)} min (prog. ${fmtTime(u.despacho.horaLlegadaEstimada, false)})`
        : `Salió ${fmtTime(u.despacho.horaSalidaReal, false)} · llega en ~${Math.round(u.restanteMin)} min`
      : null

  return (
    <li className={`card !p-3 border-l-8 ${toneBorder[u.estado]} ${selected ? 'ring-2 ring-white' : ''} ${u.estado === 'EMERGENCIA_PANICO' ? 'bg-danger-dark/60' : ''}`}>
      <button className="w-full text-left" onClick={onSelect} aria-expanded={selected}>
        <div className="flex items-center gap-3">
          <span className="text-2xl font-extrabold w-12 shrink-0 font-mono">{String(u.unidad.numeroEco).padStart(2, '0')}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge estado={u.estado} size="sm" />
              {u.lastPing && u.unidad.estadoActual === 'EN_RUTA' && (
                <span className="text-xs text-slate-400">GPS {fmtAgo(u.lastPing.at)} · {u.lastPing.speedKmh} km/h</span>
              )}
            </div>
            <p className="mt-0.5 text-sm truncate">{linea2}</p>
            {linea3 && <p className={`text-sm truncate ${u.restanteMin! < 0 ? 'text-warn font-bold' : 'text-slate-300'}`}>{linea3}</p>}
          </div>
        </div>
      </button>

      {selected && (
        <div className="mt-3 pt-3 border-t border-slate-700 space-y-2">
          <div className="flex items-center gap-3 text-sm">
            {u.chofer?.fotoUrl && <img src={u.chofer.fotoUrl} alt="" className="w-10 h-10 rounded-full bg-slate-700" />}
            <div className="min-w-0">
              <p className="font-bold truncate">{u.chofer?.nombre ?? 'Sin chofer'}</p>
              <p className="text-slate-400">
                {u.unidad.placas} · {u.unidad.marca} {u.unidad.modelo} · {u.unidad.color}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {u.chofer?.telefono && (
              <a className="btn-ghost" href={`tel:${u.chofer.telefono.replace(/\s/g, '')}`}>📞 Llamar chofer</a>
            )}
            {u.despacho ? (
              <Link className={alerta ? 'btn-danger' : 'btn-ghost'} to={`/ficha/${u.unidad.id}`}>
                🚨 {alerta ? 'Reporte policial' : 'Ver ficha'}
              </Link>
            ) : (
              <Link className="btn-ghost" to={`/ficha/${u.unidad.id}`}>📄 Ver ficha</Link>
            )}
            {u.despacho && onCheckIn && (
              <button className="btn-ghost" onClick={onCheckIn}>✓ Check-in manual</button>
            )}
            {onTaller && (
              <button className="btn-ghost" onClick={onTaller}>
                {u.unidad.estadoActual === 'MANTENIMIENTO' ? '🔧 Dar de alta' : '🔧 A taller'}
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  )
}
