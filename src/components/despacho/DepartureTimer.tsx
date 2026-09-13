import { useEffect, useRef } from 'react'
import type { Despacho, Ruta, Unidad } from '@/types'
import { INTERVALOS_TIMER, proximaSalida } from '@/lib/dispatch'
import { fmtMin, fmtTime } from '@/lib/time'
import { etiquetaFranja, franjaVigente } from '@/lib/schedule'
import { useFleetStore } from '@/store/useFleetStore'
import { ecoLabel } from '@/components/ui/StatusBadge'

interface Props {
  ruta: Ruta | undefined
  despachos: Despacho[]
  unidades: Unidad[]
  intervaloMin: number
  onChangeIntervalo: (min: number) => void
}

/**
 * Temporizador de Frecuencia Regulada. Cuenta desde la última salida REAL en la
 * ruta seleccionada hasta la siguiente salida autorizada. Vibra al llegar a cero.
 */
export function DepartureTimer({ ruta, despachos, unidades, intervaloMin, onChangeIntervalo }: Props) {
  useFleetStore((s) => s.clock) // re-render cada segundo
  const info = ruta ? proximaSalida(despachos, ruta.id, intervaloMin) : undefined
  const listoPrev = useRef(info?.listo ?? true)

  useEffect(() => {
    if (info && info.listo && !listoPrev.current && navigator.vibrate) navigator.vibrate([60, 40, 60])
    listoPrev.current = info?.listo ?? true
  }, [info?.listo]) // eslint-disable-line react-hooks/exhaustive-deps

  const ecoDe = (d?: Despacho) => (d ? ecoLabel(unidades.find((u) => u.id === d.ecoId)?.numeroEco ?? 0) : '—')
  const franja = ruta ? franjaVigente(ruta) : undefined
  const programada = franja?.frecuenciaMin ?? ruta?.frecuenciaObjetivoMin
  const opciones = ruta ? Array.from(new Set([...INTERVALOS_TIMER, programada!])).sort((a, b) => a - b) : [...INTERVALOS_TIMER]

  return (
    <section className={`card ${info?.listo ? 'border-ok' : ''}`} aria-live="polite">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-extrabold truncate">{ruta ? ruta.nombre : 'Frecuencia regulada'}</h2>
        {ruta && (
          <span className="label shrink-0" title="Frecuencia programada para la franja actual">
            {franja ? `${etiquetaFranja(franja)} · cada ${franja.frecuenciaMin}` : `obj. ${ruta.frecuenciaObjetivoMin} min`}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-stretch gap-3">
        <div className={`flex-1 rounded-xl p-3 text-center ${!ruta ? 'bg-slate-800' : info?.listo ? 'bg-ok' : 'bg-slate-800'}`}>
          <p className="label !text-white/80">{!ruta ? 'Elige destino' : info?.listo ? 'Soltar siguiente' : 'Siguiente salida en'}</p>
          <p className="font-mono text-huge tabular-nums">{!ruta ? '--:--' : info?.listo ? 'YA' : fmtMin(info!.esperaMin)}</p>
          {info?.ultima && (
            <p className="text-sm opacity-80">
              Última: {ecoDe(info.ultima)} a las {fmtTime(info.ultima.horaSalidaReal, false)}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5 w-[84px]" role="radiogroup" aria-label="Intervalo">
          {opciones.map((m) => (
            <button
              key={m}
              role="radio"
              aria-checked={m === intervaloMin}
              onClick={() => onChangeIntervalo(m)}
              className={`min-h-[44px] rounded-lg text-base font-extrabold ${
                m === intervaloMin ? 'bg-white text-slate-950' : 'bg-slate-800 border border-slate-600'
              }`}
            >
              {m} min{m === programada && <span className="block text-[9px] leading-none opacity-70">PROG.</span>}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
