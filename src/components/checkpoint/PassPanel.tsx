import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Despacho, LiveUnit, MarcaTiempo, Ocupacion, PuntoControl, Ruta, TipoPunto } from '@/types'
import { esAlerta } from '@/lib/anomaly'
import { distanceM } from '@/lib/geo'
import { horaProgramada, pendienteEnPunto, OCUPACION_META } from '@/lib/marks'
import { fmtMin, fmtTime } from '@/lib/time'
import { useFleetStore } from '@/store/useFleetStore'
import { OcupacionPicker } from '@/components/ui/OcupacionPicker'
import { StatusBadge, toneBorder, ecoLabel } from '@/components/ui/StatusBadge'

interface Props {
  punto: PuntoControl
  tipo: Exclude<TipoPunto, 'SALIDA'>
  units: LiveUnit[]
  rutas: Ruta[]
  despachos: Despacho[]
  marcas: MarcaTiempo[]
  onMarcar: (despachoId: string, ocupacion?: Ocupacion, esperando?: number) => Promise<MarcaTiempo>
}

/**
 * Checador intermedio / de llegada. Ve las unidades que deben pasar por su punto
 * (todas las rutas que lo cruzan), ordenadas por hora programada; marca el paso en
 * un toque con la ocupación observada y ve el intervalo real vs. la unidad anterior.
 */
export function PassPanel({ punto, tipo, units, rutas, despachos, marcas, onMarcar }: Props) {
  useFleetStore((s) => s.clock)
  const [ocup, setOcup] = useState<Record<string, Ocupacion | undefined>>({})
  const [esperando, setEsperando] = useState<number | undefined>(undefined)
  const [ultimo, setUltimo] = useState<{ eco: number; marca: MarcaTiempo; objetivo: number } | null>(null)
  const lock = useRef(false)
  const now = Date.now()

  const pendientes = useMemo(() => {
    return units
      .filter((u) => u.despacho && u.ruta)
      .map((u) => {
        const paso = pendienteEnPunto(u.despacho!, u.ruta!, punto.id, marcas)
        if (!paso) return null
        const programada = horaProgramada(u.despacho!, u.ruta!, paso)
        const difMin = (now - new Date(programada).getTime()) / 60000 // + = ya debió pasar
        const distM = u.lastPing ? distanceM(u.lastPing.location, punto.ubicacion) : undefined
        return { u, programada, difMin, distM }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      // Las que ya debieron pasar arriba; luego por hora programada
      .sort((a, b) => b.difMin - a.difMin)
      // Ventana operativa: faltan < 25 min o se pasaron < 20 min (más viejas = paso perdido, quedan en Datos)
      .filter((x) => x.difMin > -25 && x.difMin < 20)
  }, [units, marcas, punto, now])

  const recientes = useMemo(
    () =>
      marcas
        .filter((m) => m.puntoId === punto.id)
        .sort((a, b) => b.hora.localeCompare(a.hora))
        .slice(0, 6)
        .map((m) => {
          const d = despachos.find((x) => x.id === m.despachoId)
          const u = units.find((x) => x.unidad.id === d?.ecoId)
          const r = rutas.find((x) => x.id === d?.rutaId)
          return { m, eco: u?.unidad.numeroEco, ruta: r }
        }),
    [marcas, punto.id, despachos, units, rutas],
  )

  async function marcar(u: LiveUnit) {
    if (lock.current || !u.despacho || !u.ruta) return
    lock.current = true
    try {
      const m = await onMarcar(u.despacho.id, ocup[u.unidad.id], tipo === 'LLEGADA' ? esperando : undefined)
      setUltimo({ eco: u.unidad.numeroEco, marca: m, objetivo: u.ruta.frecuenciaObjetivoMin })
      setOcup((o) => ({ ...o, [u.unidad.id]: undefined }))
      setEsperando(undefined)
      if (navigator.vibrate) navigator.vibrate(40)
    } finally {
      lock.current = false
    }
  }

  const verbo = tipo === 'LLEGADA' ? 'LLEGÓ' : 'PASÓ'
  const carreo = ultimo && ultimo.marca.intervaloRealMin !== undefined && ultimo.marca.intervaloRealMin < ultimo.objetivo * 0.6

  return (
    <section className="space-y-3">
      {ultimo && (
        <div className={`card ${carreo ? 'border-danger bg-danger-dark/40' : 'border-ok'}`} role="status">
          <div className="flex items-center justify-between">
            <span className="text-2xl font-extrabold">{ecoLabel(ultimo.eco)} · {verbo.toLowerCase()}</span>
            <span className="font-mono text-2xl font-extrabold">{fmtTime(ultimo.marca.hora)}</span>
          </div>
          <p className="text-sm mt-0.5">
            {ultimo.marca.intervaloRealMin !== undefined ? (
              <>
                Intervalo vs. anterior en este punto: <b>{fmtMin(ultimo.marca.intervaloRealMin)} min</b> (objetivo {ultimo.objetivo})
                {carreo && <b className="text-danger"> · ⚠ viene carreada</b>}
              </>
            ) : (
              'Primera unidad de su ruta por este punto hoy'
            )}
            {ultimo.marca.ocupacion && <> · {OCUPACION_META[ultimo.marca.ocupacion].label}</>}
          </p>
        </div>
      )}

      <div className="card space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-extrabold">{tipo === 'LLEGADA' ? 'Llegadas a' : 'Pasos por'} {punto.nombre}</h2>
          <span className="label">{pendientes.length} esperadas</span>
        </div>
        {tipo === 'LLEGADA' && (
          <div>
            <p className="label mb-1">Gente esperando en el punto (se guarda con la siguiente marca)</p>
            <OcupacionPicker soloEsperando onChange={() => undefined} esperando={esperando} onChangeEsperando={setEsperando} compact />
          </div>
        )}
        {pendientes.length === 0 && <p className="text-slate-400 text-sm">Ninguna unidad se espera en los próximos 25 min.</p>}
        <ul className="space-y-2">
          {pendientes.map(({ u, programada, difMin, distM }) => {
            const vencida = difMin > 2
            return (
              <li key={u.unidad.id} className={`rounded-xl bg-slate-800 border-l-8 ${toneBorder[u.estado]} p-3 space-y-2`}>
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xl font-extrabold">{ecoLabel(u.unidad.numeroEco)}</span>
                      {esAlerta(u.estado) && <StatusBadge estado={u.estado} size="sm" />}
                    </div>
                    <p className="text-sm text-slate-300 truncate">{u.ruta?.nombre} · {u.sentido}</p>
                    <p className={`text-sm font-bold ${vencida ? 'text-warn' : 'text-slate-300'}`}>
                      Prog. {fmtTime(programada, false)} · {Math.abs(difMin) < 1 ? 'ahora' : difMin > 0 ? `hace ${Math.round(difMin)} min` : `en ${Math.round(-difMin)} min`}
                      {distM !== undefined && <span className="text-slate-400 font-normal"> · GPS a {distM < 1000 ? `${Math.round(distM)} m` : `${(distM / 1000).toFixed(1)} km`}</span>}
                    </p>
                  </div>
                  {esAlerta(u.estado) && u.estado !== 'RETRASO_SOSPECHOSO' ? (
                    <Link to={`/ficha/${u.unidad.id}`} className="btn-danger min-w-[96px] text-base">Reportar</Link>
                  ) : (
                    <button className={`${tipo === 'LLEGADA' ? 'btn-ok' : 'btn-primary'} min-w-[96px] min-h-[56px] text-lg`} onClick={() => marcar(u)}>
                      {verbo}
                    </button>
                  )}
                </div>
                <OcupacionPicker value={ocup[u.unidad.id]} onChange={(o) => setOcup((s) => ({ ...s, [u.unidad.id]: o }))} compact />
              </li>
            )
          })}
        </ul>
      </div>

      {recientes.length > 0 && (
        <div className="card">
          <h2 className="label mb-1.5">Últimos {tipo === 'LLEGADA' ? 'arribos' : 'pasos'} aquí</h2>
          <ul className="divide-y divide-slate-800 text-sm">
            {recientes.map(({ m, eco, ruta }) => (
              <li key={m.id} className="py-1.5 flex items-center gap-2">
                <span className="font-mono text-slate-400 w-14 shrink-0">{fmtTime(m.hora, false)}</span>
                <span className="font-extrabold w-16 shrink-0">{eco !== undefined ? ecoLabel(eco) : '—'}</span>
                <span className="truncate flex-1 text-slate-300">{ruta?.nombre}</span>
                {m.ocupacion && <span className={`text-xs px-1.5 rounded ${OCUPACION_META[m.ocupacion].tone}`}>{OCUPACION_META[m.ocupacion].icono}</span>}
                <span className={`font-mono text-xs shrink-0 ${m.intervaloRealMin !== undefined && ruta && m.intervaloRealMin < ruta.frecuenciaObjetivoMin * 0.6 ? 'text-danger font-bold' : 'text-slate-400'}`}>
                  {m.intervaloRealMin !== undefined ? `+${fmtMin(m.intervaloRealMin)}` : '—'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
