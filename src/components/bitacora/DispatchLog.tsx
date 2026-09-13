import { useMemo } from 'react'
import type { Despacho, Nodo, Ruta, Unidad } from '@/types'
import { resumenPorRuta, salidasPorHora } from '@/lib/analytics'
import { fmtMin, fmtTime } from '@/lib/time'
import { ecoLabel } from '@/components/ui/StatusBadge'

interface Props {
  despachos: Despacho[]
  rutas: Ruta[]
  unidades: Unidad[]
  nodos: Nodo[]
}

/**
 * Bitácora del día: cada despacho con marca de tiempo (materia prima del analytics),
 * salidas por hora (horas pico) y resumen por ruta (carreos / huecos / duración real).
 */
export function DispatchLog({ despachos, rutas, unidades, nodos }: Props) {
  const porHora = useMemo(() => salidasPorHora(despachos), [despachos])
  const resumen = useMemo(() => resumenPorRuta(despachos, rutas), [despachos, rutas])
  const recientes = useMemo(() => [...despachos].sort((a, b) => b.horaSalidaReal.localeCompare(a.horaSalidaReal)).slice(0, 40), [despachos])
  const max = Math.max(1, ...porHora)
  const horaActual = new Date().getHours()
  const ecoDe = (id: string) => ecoLabel(unidades.find((u) => u.id === id)?.numeroEco ?? 0)
  const rutaDe = (id: string) => rutas.find((r) => r.id === id)?.nombre ?? id
  const corto = (id: string) => nodos.find((n) => n.id === id)?.corto ?? id
  const rutaCorta = (r: Ruta) => `${corto(r.nodoOrigenId)}→${corto(r.nodoDestinoId)}`

  return (
    <section className="space-y-3">
      <div className="card">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-extrabold">Salidas por hora</h2>
          <span className="label">{despachos.length} despachos hoy</span>
        </div>
        <div className="mt-3 flex items-end gap-[3px] h-24" role="img" aria-label="Salidas por hora del día">
          {porHora.map((n, h) => (
            <div key={h} className="flex-1 flex flex-col items-center justify-end h-full" title={`${h}:00 · ${n} salidas`}>
              <div className={`w-full rounded-t ${h === horaActual ? 'bg-white' : 'bg-sky-500'}`} style={{ height: `${(n / max) * 100}%`, minHeight: n ? 3 : 0 }} />
            </div>
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-mono">
          <span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="text-lg font-extrabold mb-2">Resumen por ruta</h2>
        <table className="w-full text-xs">
          <thead className="text-left label">
            <tr>
              <th className="pb-1">Ruta</th>
              <th className="pb-1 text-right">Sal.</th>
              <th className="pb-1 text-right" title="Intervalo real promedio / objetivo">Int.</th>
              <th className="pb-1 text-right text-danger" title="Salidas carreadas">Carr.</th>
              <th className="pb-1 text-right text-warn" title="Huecos de servicio">Huec.</th>
              <th className="pb-1 text-right" title="Duración real promedio">Dur.</th>
            </tr>
          </thead>
          <tbody>
            {resumen.map((r) => (
              <tr key={r.ruta.id} className="border-t border-slate-800">
                <td className="py-1.5 pr-2 font-bold whitespace-nowrap" title={r.ruta.nombre}>{rutaCorta(r.ruta)}</td>
                <td className="py-1.5 text-right font-bold">{r.salidas}</td>
                <td className="py-1.5 text-right font-mono">
                  {r.intervaloPromedioMin !== undefined ? fmtMin(r.intervaloPromedioMin) : '—'}
                  <span className="text-slate-500"> /{r.ruta.frecuenciaObjetivoMin}</span>
                </td>
                <td className={`py-1.5 text-right font-bold ${r.carreos ? 'text-danger' : ''}`}>{r.carreos}</td>
                <td className={`py-1.5 text-right font-bold ${r.huecos ? 'text-warn' : ''}`}>{r.huecos}</td>
                <td className="py-1.5 text-right font-mono">{r.duracionPromedioMin !== undefined ? `${Math.round(r.duracionPromedioMin)}′` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2 className="text-lg font-extrabold mb-2">Últimos despachos</h2>
        <ul className="divide-y divide-slate-800 text-sm">
          {recientes.map((d) => (
            <li key={d.id} className="py-1.5 flex items-center gap-2">
              <span className="font-mono text-slate-400 w-12 shrink-0">{fmtTime(d.horaSalidaReal, false)}</span>
              <span className="font-extrabold w-16 shrink-0">{ecoDe(d.ecoId)}</span>
              <span className="truncate flex-1">{rutaDe(d.rutaId)}</span>
              <span className={`font-mono text-xs shrink-0 ${d.estadoDespacho === 'ALERTA' ? 'text-danger' : d.estadoDespacho === 'COMPLETADO' ? 'text-slate-500' : 'text-ok'}`}>
                {d.estadoDespacho === 'COMPLETADO' && d.horaLlegadaReal ? `→ ${fmtTime(d.horaLlegadaReal, false)}` : d.estadoDespacho}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
