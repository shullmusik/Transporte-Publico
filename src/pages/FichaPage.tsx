import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useFleetStore, useLiveUnit, useAlertasAbiertas } from '@/store/useFleetStore'
import { CHECADOR_ID, CHECADOR_NOMBRE } from '@/mock/seed'
import { buildFicha } from '@/lib/ficha'
import { fmtTime } from '@/lib/time'
import { FichaPolicial } from '@/components/emergencia/FichaPolicial'
import { ActionChannels } from '@/components/emergencia/ActionChannels'
import { FleetMap } from '@/components/monitor/FleetMap'
import { StatusBadge } from '@/components/ui/StatusBadge'

/**
 * Pantalla de respuesta rápida (1 clic desde el banner, el monitor o las llegadas).
 * URL directa /ficha/:ecoId — se puede mandar el enlace al mando por WhatsApp.
 */
export function FichaPage() {
  const { ecoId } = useParams<{ ecoId: string }>()
  const unit = useLiveUnit(ecoId)
  const nodos = useFleetStore((s) => s.nodos)
  const rutas = useFleetStore((s) => s.rutas)
  const puntos = useFleetStore((s) => s.puntos)
  const alertas = useAlertasAbiertas().filter((a) => a.despachoId === unit?.despacho?.id)
  const reportar = useFleetStore((s) => s.reportarEmergencia)
  const atender = useFleetStore((s) => s.atenderAlerta)
  const [canales, setCanales] = useState<string[]>([])

  // Folio y hora se fijan al abrir; ubicación y estado se leen en vivo
  const ficha = useMemo(
    () => (unit ? buildFicha(unit, CHECADOR_NOMBRE, (id) => puntos.find((p) => p.id === id)?.nombre ?? id) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [unit?.unidad.id, unit?.lastPing?.at, unit?.estado],
  )

  if (!unit || !ficha) {
    return (
      <div className="p-6 text-center space-y-4">
        <p className="text-slate-400">Unidad no encontrada.</p>
        <Link to="/" className="btn-ghost inline-flex">← Volver</Link>
      </div>
    )
  }

  async function registrarCanal(canal: string) {
    if (canales.includes(canal) || !unit?.despacho) return
    setCanales((c) => [...c, canal])
    // Auditoría: cada canal usado queda como alerta REPORTE_POLICIAL con la ficha serializada
    await reportar(unit.despacho.id, CHECADOR_ID, JSON.stringify({ canal, ficha }), 'REPORTE_POLICIAL', unit.lastPing?.location)
  }

  return (
    <div className="min-h-dvh max-w-lg mx-auto p-3 space-y-3 pb-10">
      <div className="flex items-center justify-between print:hidden">
        <Link to="/" className="btn-ghost text-base">← Tablero</Link>
        <div className="flex items-center gap-2">
          <button className="btn-ghost text-base" onClick={() => window.print()}>🖨 PDF</button>
          <StatusBadge estado={unit.estado} />
        </div>
      </div>

      <div className="print:hidden">
        <ActionChannels ficha={ficha} onReported={registrarCanal} />
      </div>

      <FichaPolicial ficha={ficha} />

      <div className="print:hidden">
        <FleetMap nodos={nodos} rutas={rutas} units={[unit]} focusEcoId={unit.unidad.id} className="h-56" />
      </div>

      {alertas.length > 0 && (
        <section className="card space-y-2 print:hidden">
          <h2 className="label">Alertas abiertas de este despacho ({alertas.length})</h2>
          {alertas.map((a) => (
            <div key={a.id} className="flex items-center justify-between text-sm gap-2">
              <span>
                <b>{a.tipoAlerta.replace(/_/g, ' ')}</b> · {fmtTime(a.fechaHora, false)}
              </span>
              <button className="btn-ghost text-sm min-h-[40px]" onClick={() => atender(a.id)}>Marcar atendida</button>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
