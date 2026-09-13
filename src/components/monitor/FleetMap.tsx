import { useEffect } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, Marker, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import type { LiveUnit, Nodo, Ruta, EstadoFlota } from '@/types'

interface Props {
  nodos: Nodo[]
  rutas: Ruta[]
  units: LiveUnit[]
  focusEcoId?: string | null
  className?: string
}

const COLOR: Record<EstadoFlota, string> = {
  EN_BASE: '#64748b',
  EN_TRAYECTO_OK: '#16a34a',
  RETRASO_SOSPECHOSO: '#f59e0b',
  SIN_SENAL: '#94a3b8',
  DESVIO: '#dc2626',
  EMERGENCIA_PANICO: '#dc2626',
  MANTENIMIENTO: '#334155',
}

/** Marcador con el número ECO grande: legible desde la caseta. */
const unitIcon = (u: LiveUnit) =>
  L.divIcon({
    className: '',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    html: `<div style="width:40px;height:40px;border-radius:50%;background:${COLOR[u.estado]};border:3px solid #fff;
      display:flex;align-items:center;justify-content:center;font-weight:900;font-size:15px;color:#fff;
      box-shadow:0 2px 8px rgba(0,0,0,.6);${u.estado === 'EMERGENCIA_PANICO' ? 'animation:pulse-ring 1.2s ease-out infinite' : ''}">
      ${String(u.unidad.numeroEco).padStart(2, '0')}</div>`,
  })

function FocusOn({ unit }: { unit?: LiveUnit }) {
  const map = useMap()
  useEffect(() => {
    if (unit?.lastPing) map.flyTo([unit.lastPing.location.lat, unit.lastPing.location.lng], 15, { duration: 0.6 })
  }, [unit?.unidad.id]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

export function FleetMap({ nodos, rutas, units, focusEcoId, className = '' }: Props) {
  const center = nodos.find((n) => n.esBase)?.ubicacion ?? { lat: 19.55, lng: -99.24 }
  const focus = units.find((u) => u.unidad.id === focusEcoId)
  const enRuta = units.filter((u) => u.unidad.estadoActual === 'EN_RUTA' && u.lastPing)
  const nodo = (id: string) => nodos.find((n) => n.id === id)?.ubicacion

  return (
    <MapContainer center={[center.lat, center.lng]} zoom={13} className={`w-full rounded-2xl overflow-hidden ${className}`} zoomControl={false} attributionControl={false}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {rutas.map((r) => {
        const o = nodo(r.nodoOrigenId)
        const d = nodo(r.nodoDestinoId)
        return o && d ? <Polyline key={r.id} positions={[[o.lat, o.lng], [d.lat, d.lng]]} pathOptions={{ color: '#38bdf8', weight: 2, opacity: 0.45, dashArray: '6 8' }} /> : null
      })}
      {nodos.map((n) => (
        <CircleMarker
          key={n.id}
          center={[n.ubicacion.lat, n.ubicacion.lng]}
          radius={n.esBase ? 11 : 7}
          pathOptions={{ color: '#fff', fillColor: n.esBase ? '#0ea5e9' : '#1e293b', fillOpacity: 1, weight: 2 }}
        >
          <Tooltip direction="top" permanent={n.esBase}>
            {n.esBase ? <b>{n.nombre.toUpperCase()}</b> : n.nombre}
          </Tooltip>
        </CircleMarker>
      ))}
      {enRuta.map((u) => (
        <Marker key={u.unidad.id} position={[u.lastPing!.location.lat, u.lastPing!.location.lng]} icon={unitIcon(u)}>
          <Tooltip direction="top" offset={[0, -20]}>
            ECO {u.unidad.numeroEco} · {u.ruta?.nombre} · {u.chofer?.nombre}
          </Tooltip>
        </Marker>
      ))}
      <FocusOn unit={focus} />
    </MapContainer>
  )
}
