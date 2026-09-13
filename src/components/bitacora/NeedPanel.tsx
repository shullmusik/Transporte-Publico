import { useMemo, useState } from 'react'
import type { Despacho, FranjaHoraria, MarcaTiempo, PuntoControl, Ruta } from '@/types'
import { necesidadPorFranja, tramosPromedio, UMBRALES, type Veredicto } from '@/lib/analytics'
import { ajustarFranja, etiquetaFranja, franjaVigente } from '@/lib/schedule'

interface Props {
  rutas: Ruta[]
  puntos: PuntoControl[]
  despachos: Despacho[]
  marcas: MarcaTiempo[]
  onGuardar: (rutaId: string, programacion: FranjaHoraria[]) => Promise<unknown>
}

const VEREDICTO: Record<Veredicto, { label: string; tone: string }> = {
  AUMENTAR: { label: '▲ Aumentar frecuencia', tone: 'bg-danger text-white' },
  MANTENER: { label: '● Mantener', tone: 'bg-ok text-white' },
  REDUCIR: { label: '▼ Reducir frecuencia', tone: 'bg-sky-600 text-white' },
  SIN_DATOS: { label: `Faltan datos (mín. ${UMBRALES.minSalidas} salidas)`, tone: 'bg-slate-700 text-slate-300' },
}

/**
 * ¿Hay necesidad? Por ruta y franja: ocupación observada en los 4 puntos, gente
 * esperando, recorrido real, y la frecuencia programada con su sugerencia.
 * El administrador ajusta la programación aquí; el temporizador de salida la usa al instante.
 */
export function NeedPanel({ rutas, puntos, despachos, marcas, onGuardar }: Props) {
  const [rutaId, setRutaId] = useState(rutas[0]?.id ?? '')
  const ruta = rutas.find((r) => r.id === rutaId) ?? rutas[0]
  const [borrador, setBorrador] = useState<FranjaHoraria[] | null>(null)
  const [guardando, setGuardando] = useState(false)
  const programacion = borrador ?? ruta?.programacion ?? []

  const filas = useMemo(() => (ruta ? necesidadPorFranja({ ...ruta, programacion }, despachos, marcas) : []), [ruta, programacion, despachos, marcas])
  const tramos = useMemo(() => (ruta ? tramosPromedio(ruta, despachos, marcas) : []), [ruta, despachos, marcas])
  const vigente = ruta ? franjaVigente({ programacion }) : undefined
  const nombrePunto = (id: string) => puntos.find((p) => p.id === id)?.nombre ?? id
  const sugerenciasPendientes = filas.filter((f) => f.veredicto !== 'SIN_DATOS' && f.frecuenciaSugeridaMin !== f.franja.frecuenciaMin)

  if (!ruta) return null

  function cambiar(inicio: string, delta: number) {
    const f = programacion.find((x) => x.inicio === inicio)!
    setBorrador(ajustarFranja(programacion, inicio, f.frecuenciaMin + delta))
  }
  function aplicarSugerencias() {
    let p = programacion
    for (const f of sugerenciasPendientes) p = ajustarFranja(p, f.franja.inicio, f.frecuenciaSugeridaMin)
    setBorrador(p)
  }
  async function guardar() {
    if (!borrador) return
    setGuardando(true)
    try {
      await onGuardar(ruta!.id, borrador)
      setBorrador(null)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <section className="space-y-3">
      <div className="card space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-extrabold">¿Hay necesidad?</h2>
          <span className="label">hoy</span>
        </div>
        <select className="w-full min-h-touch bg-slate-800 border border-slate-600 rounded-xl px-3 text-base font-bold" value={ruta.id} onChange={(e) => { setRutaId(e.target.value); setBorrador(null) }}>
          {rutas.map((r) => (
            <option key={r.id} value={r.id}>{r.nombre}</option>
          ))}
        </select>
        <p className="text-xs text-slate-400">
          Ocupación 0 = todas vacías · 2 = todas llenas. Se sugiere aumentar con ≥ {UMBRALES.ocupacionAlta} o ≥ {UMBRALES.esperandoAlto} personas esperando; reducir con ≤ {UMBRALES.ocupacionBaja}.
        </p>
      </div>

      <ul className="space-y-2">
        {filas.map((f) => {
          const v = VEREDICTO[f.veredicto]
          const esVigente = vigente?.inicio === f.franja.inicio
          const pct = f.ocupacionProm !== undefined ? (f.ocupacionProm / 2) * 100 : 0
          return (
            <li key={f.franja.inicio} className={`card !p-3 space-y-2 ${esVigente ? 'ring-2 ring-white' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-mono font-extrabold text-lg">{etiquetaFranja(f.franja)}{esVigente && <span className="ml-2 text-xs bg-white text-slate-950 px-1.5 rounded">AHORA</span>}</p>
                  <p className="text-xs text-slate-400">{f.salidas} salidas{f.intervaloRealProm !== undefined && ` cada ~${Math.round(f.intervaloRealProm)}′ real`} · {f.llenas} llenas · {f.vacias} vacías{f.esperandoProm !== undefined && ` · esperan ${f.esperandoProm.toFixed(1)}`}{f.recorridoRealMin !== undefined && ` · recorrido ${Math.round(f.recorridoRealMin)}′ / ${Math.round(f.recorridoProgramadoMin)}′`}</p>
                </div>
                <span className={`text-xs font-extrabold px-2 py-1 rounded-lg shrink-0 ${v.tone}`}>{v.label}</span>
              </div>
              <div className="h-2 rounded bg-slate-800 overflow-hidden" title={`Ocupación promedio ${f.ocupacionProm?.toFixed(2) ?? '—'}`}>
                <div className={`h-full ${pct >= 70 ? 'bg-danger' : pct <= 30 ? 'bg-sky-500' : 'bg-ok'}`} style={{ width: `${pct}%` }} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm">Cada <b className="font-mono text-lg">{f.franja.frecuenciaMin}</b> min{f.veredicto !== 'SIN_DATOS' && f.frecuenciaSugeridaMin !== f.franja.frecuenciaMin && <span className="text-slate-400"> · sugerido {f.frecuenciaSugeridaMin}</span>}</span>
                <div className="flex gap-1">
                  <button className="btn-ghost min-h-[40px] min-w-[48px] text-xl" aria-label="Menos frecuente" onClick={() => cambiar(f.franja.inicio, 1)}>+</button>
                  <button className="btn-ghost min-h-[40px] min-w-[48px] text-xl" aria-label="Más frecuente" onClick={() => cambiar(f.franja.inicio, -1)}>−</button>
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      <div className="grid grid-cols-2 gap-2">
        <button className="btn-ghost" disabled={sugerenciasPendientes.length === 0} onClick={aplicarSugerencias}>
          Aplicar sugerencias ({sugerenciasPendientes.length})
        </button>
        <button className="btn-ok" disabled={!borrador || guardando} onClick={guardar}>
          {guardando ? 'Guardando…' : 'Guardar programación'}
        </button>
      </div>
      {borrador && <button className="text-sm text-slate-400 underline w-full" onClick={() => setBorrador(null)}>Descartar cambios</button>}

      <div className="card">
        <h2 className="text-lg font-extrabold mb-1">Tiempo por tramo</h2>
        <p className="text-xs text-slate-400 mb-2">Real promedio entre marcas vs. programado. Un tramo lento sostenido indica dónde se pierde el intervalo.</p>
        <ul className="space-y-1.5 text-sm">
          {tramos.map((t) => {
            const dif = t.realMin !== undefined ? t.realMin - t.programadoMin : undefined
            return (
              <li key={`${t.de}-${t.a}`} className="flex items-center gap-2">
                <span className="flex-1 truncate">{nombrePunto(t.de)} → {nombrePunto(t.a)}</span>
                <span className="font-mono text-slate-400">{Math.round(t.programadoMin)}′</span>
                <span className={`font-mono font-bold w-14 text-right ${dif === undefined ? 'text-slate-500' : dif > 3 ? 'text-warn' : dif < -3 ? 'text-sky-400' : ''}`}>
                  {t.realMin !== undefined ? `${Math.round(t.realMin)}′` : '—'}
                </span>
                <span className="text-xs text-slate-500 w-10 text-right">n={t.muestras}</span>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
