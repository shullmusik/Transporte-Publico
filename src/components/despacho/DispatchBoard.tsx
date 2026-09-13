import { useEffect, useRef, useState } from 'react'
import type { Despacho, Nodo, Ocupacion, Ruta, Unidad } from '@/types'
import { ecoAutorizado, proximaSalida } from '@/lib/dispatch'
import { fmtMin, fmtAgo, fmtTime } from '@/lib/time'
import { ecoLabel } from '@/components/ui/StatusBadge'
import { useFleetStore } from '@/store/useFleetStore'
import { OcupacionPicker } from '@/components/ui/OcupacionPicker'

interface Props {
  base: Nodo
  fila: Unidad[]                  // unidades EN_BASE en esta base, orden FIFO
  rutas: Ruta[]                   // rutas con origen = esta base
  nodos: Nodo[]
  despachos: Despacho[]
  intervaloMin: number
  rutaSeleccionada: string | null
  onSeleccionarRuta: (rutaId: string | null) => void
  onDespachar: (ecoId: string, rutaId: string, ocupacion?: Ocupacion, esperando?: number) => Promise<Despacho>
}

/**
 * Asignación en 2 toques: ECO → Destino → (confirmar).
 * El botón de confirmación muestra si la frecuencia ya lo permite o cuánto falta;
 * el checador siempre puede forzar la salida (queda registrado en intervaloRealMin).
 */
export function DispatchBoard({ base, fila, rutas, nodos, despachos, intervaloMin, rutaSeleccionada, onSeleccionarRuta, onDespachar }: Props) {
  useFleetStore((s) => s.clock)
  const [ecoSel, setEcoSel] = useState<string | null>(null)
  const [ultimo, setUltimo] = useState<{ eco: number; ruta: string; at: string; intervalo?: number } | null>(null)
  const busy = useRef(false)
  const [ocupacion, setOcupacion] = useState<Ocupacion | undefined>(undefined)
  const [esperando, setEsperando] = useState<number | undefined>(undefined)

  // Al cambiar de base se limpia la selección para no despachar desde la base equivocada
  useEffect(() => {
    setEcoSel(null)
    onSeleccionarRuta(null)
  }, [base.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const eco = fila.find((u) => u.id === ecoSel) ?? null
  const ruta = rutas.find((r) => r.id === rutaSeleccionada) ?? null
  const info = ruta ? proximaSalida(despachos, ruta.id, intervaloMin) : null
  const fueraDeRango = eco && ruta ? !ecoAutorizado(ruta, eco.numeroEco) : false

  async function confirmar() {
    if (!eco || !ruta || busy.current) return
    busy.current = true
    try {
      const d = await onDespachar(eco.id, ruta.id, ocupacion, esperando)
      setUltimo({ eco: eco.numeroEco, ruta: ruta.nombre, at: d.horaSalidaReal, intervalo: d.intervaloRealMin })
      setEcoSel(null)
      setOcupacion(undefined)
      setEsperando(undefined)
      if (navigator.vibrate) navigator.vibrate(40)
    } finally {
      busy.current = false
    }
  }

  return (
    <section className="card space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-extrabold">Despacho rápido</h2>
        <span className="label">1 · ECO &nbsp; 2 · Destino</span>
      </div>

      {ultimo && (
        <p className="rounded-xl bg-ok/20 border border-ok px-3 py-2 text-sm" role="status">
          ✓ <b>{ecoLabel(ultimo.eco)}</b> salió a <b>{ultimo.ruta.split('→')[1]?.trim()}</b> a las {fmtTime(ultimo.at)}
          {ultimo.intervalo !== undefined && <> · intervalo real {fmtMin(ultimo.intervalo)} min</>}
        </p>
      )}

      {/* Paso 1: fila de espera FIFO */}
      <div>
        <p className="label mb-1.5">Fila de espera · {fila.length} unidades</p>
        {fila.length === 0 ? (
          <p className="text-slate-400 text-sm py-2">No hay unidades formadas en {base.nombre}.</p>
        ) : (
          <div className="grid grid-cols-5 gap-1.5">
            {fila.map((u, i) => {
              const activo = u.id === ecoSel
              return (
                <button
                  key={u.id}
                  onClick={() => setEcoSel(activo ? null : u.id)}
                  aria-pressed={activo}
                  title={u.enBaseDesde ? `Formada ${fmtAgo(u.enBaseDesde)}` : undefined}
                  className={`relative min-h-[56px] rounded-xl text-xl font-extrabold border-2 ${
                    activo ? 'bg-white text-slate-950 border-white' : i === 0 ? 'bg-slate-800 border-ok' : 'bg-slate-800 border-slate-600'
                  }`}
                >
                  {String(u.numeroEco).padStart(2, '0')}
                  {i === 0 && !activo && <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 text-[9px] font-bold bg-ok px-1 rounded">SIGUE</span>}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Paso 2: destino */}
      <div>
        <p className="label mb-1.5">Destino desde {base.nombre}</p>
        <div className="grid grid-cols-2 gap-1.5">
          {rutas.map((r) => {
            const activo = r.id === rutaSeleccionada
            const p = proximaSalida(despachos, r.id, intervaloMin)
            const destino = nodos.find((n) => n.id === r.nodoDestinoId)
            const permitido = !eco || ecoAutorizado(r, eco.numeroEco)
            return (
              <button
                key={r.id}
                onClick={() => onSeleccionarRuta(activo ? null : r.id)}
                aria-pressed={activo}
                className={`min-h-[56px] rounded-xl px-3 py-1.5 text-left border-2 flex items-center justify-between gap-2 ${
                  activo ? 'bg-white text-slate-950 border-white' : 'bg-slate-800 border-slate-600'
                } ${permitido ? '' : 'opacity-50'}`}
              >
                <span className="min-w-0">
                  <span className="block text-[15px] font-extrabold leading-tight line-clamp-2">{destino?.nombre}</span>
                  <span className={`block text-xs ${activo ? 'text-slate-600' : 'text-slate-400'}`}>
                    {r.tiempoEstimadoMin} min · cada {r.frecuenciaObjetivoMin}
                    {r.ecoRango && ` · ECO ${r.ecoRango[0]}–${r.ecoRango[1]}`}
                  </span>
                </span>
                <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-xs font-extrabold font-mono ${p.listo ? 'bg-ok text-white' : 'bg-warn text-slate-950'}`}>
                  {p.listo ? 'YA' : fmtMin(p.esperaMin)}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {fueraDeRango && (
        <p className="text-warn text-sm font-bold">
          ⚠ {ecoLabel(eco!.numeroEco)} está fuera del rango autorizado para esta ruta (ECO {ruta!.ecoRango![0]}–{ruta!.ecoRango![1]}).
        </p>
      )}

      {eco && ruta && (
        <div>
          <p className="label mb-1">Sale con / gente que se queda (opcional)</p>
          <OcupacionPicker value={ocupacion} onChange={setOcupacion} esperando={esperando} onChangeEsperando={setEsperando} compact />
        </div>
      )}

      <button
        className={`w-full min-h-[64px] text-lg leading-tight ${!eco || !ruta ? 'btn-ghost' : info?.listo ? 'btn-ok' : 'btn-warn'}`}
        disabled={!eco || !ruta}
        onClick={confirmar}
      >
        {!eco
          ? 'Selecciona una ECO'
          : !ruta
            ? `${ecoLabel(eco.numeroEco)} → elige destino`
            : info?.listo
              ? `DESPACHAR ${ecoLabel(eco.numeroEco)} → ${nodos.find((n) => n.id === ruta.nodoDestinoId)?.nombre}`
              : `Faltan ${fmtMin(info!.esperaMin)} · Forzar salida de ${ecoLabel(eco.numeroEco)}`}
      </button>
    </section>
  )
}
