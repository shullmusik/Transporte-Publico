import { useEffect, useMemo, useState } from 'react'
import { useFleetStore, useLiveUnits } from '@/store/useFleetStore'
import { CHECADOR_ID, CHECADOR_NOMBRE } from '@/mock/seed'
import { filaEnBase } from '@/lib/dispatch'
import { frecuenciaVigente } from '@/lib/schedule'
import { esAlerta } from '@/lib/anomaly'
import { pendienteEnPunto } from '@/lib/marks'
import { BaseHeader, type Puesto } from '@/components/despacho/BaseHeader'
import { DepartureTimer } from '@/components/despacho/DepartureTimer'
import { DispatchBoard } from '@/components/despacho/DispatchBoard'
import { ArrivalsPanel } from '@/components/despacho/ArrivalsPanel'
import { PassPanel } from '@/components/checkpoint/PassPanel'
import { FleetMonitor } from '@/components/monitor/FleetMonitor'
import { DispatchLog } from '@/components/bitacora/DispatchLog'
import { NeedPanel } from '@/components/bitacora/NeedPanel'
import { PanicBanner } from '@/components/emergencia/PanicBanner'

type Tab = 'puesto' | 'monitor' | 'datos' | 'bitacora'
const TABS: Tab[] = ['puesto', 'monitor', 'datos', 'bitacora']

/**
 * Torre de control del checador. El puesto (salida / intermedio / llegada) decide
 * qué ve en la primera pestaña; Monitor, Datos y Bitácora son comunes.
 */
export function ChecadorPage() {
  const ready = useFleetStore((s) => s.ready)
  const nodos = useFleetStore((s) => s.nodos)
  const puntos = useFleetStore((s) => s.puntos)
  const rutas = useFleetStore((s) => s.rutas)
  const unidades = useFleetStore((s) => s.unidades)
  const despachos = useFleetStore((s) => s.despachos)
  const marcas = useFleetStore((s) => s.marcas)
  const despachar = useFleetStore((s) => s.despachar)
  const marcar = useFleetStore((s) => s.marcar)
  const checkIn = useFleetStore((s) => s.checkIn)
  const setEstadoUnidad = useFleetStore((s) => s.setEstadoUnidad)
  const actualizarProgramacion = useFleetStore((s) => s.actualizarProgramacion)
  const units = useLiveUnits()

  // ?tab= y ?puesto= permiten enlaces directos (pantalla fija en caseta / teléfono del checador intermedio)
  const params = new URLSearchParams(window.location.search)
  const [tab, setTab] = useState<Tab>(() => (TABS.includes(params.get('tab') as Tab) ? (params.get('tab') as Tab) : 'puesto'))
  const [puesto, setPuesto] = useState<Puesto>(() => (['SALIDA', 'INTERMEDIO', 'LLEGADA'].includes(params.get('puesto') ?? '') ? (params.get('puesto') as Puesto) : 'SALIDA'))
  const [lugarId, setLugarId] = useState<string>(params.get('lugar') ?? 'BOD')
  const [rutaSel, setRutaSel] = useState<string | null>(null)
  const [intervaloManual, setIntervaloManual] = useState<number | null>(null)

  const bases = useMemo(() => nodos.filter((n) => n.esBase), [nodos])
  const puntosIntermedios = useMemo(() => puntos.filter((p) => !nodos.some((n) => n.id === p.id)), [puntos, nodos])

  // Al cambiar de puesto, el lugar por defecto es el primero válido para ese puesto
  useEffect(() => {
    const validos = puesto === 'SALIDA' ? bases : puesto === 'INTERMEDIO' ? puntosIntermedios : nodos
    if (validos.length && !validos.some((l) => l.id === lugarId)) setLugarId(validos[0].id)
  }, [puesto, bases, puntosIntermedios, nodos, lugarId])

  const base = bases.find((b) => b.id === lugarId)
  const punto = puntos.find((p) => p.id === lugarId)
  const rutasDesdeBase = useMemo(() => rutas.filter((r) => r.nodoOrigenId === base?.id), [rutas, base?.id])
  const fila = useMemo(() => (base ? filaEnBase(unidades, base.id) : []), [unidades, base])
  const llegadasBase = useMemo(() => units.filter((u) => u.despacho && u.despacho.nodoLlegadaId === base?.id), [units, base?.id])
  const rutaActiva = rutasDesdeBase.find((r) => r.id === rutaSel)
  // Intervalo = el programado para la franja actual, salvo que el checador lo sobreescriba (3/4/5/10)
  const intervalo = intervaloManual ?? (rutaActiva ? frecuenciaVigente(rutaActiva) : 5)
  const alertas = units.filter((u) => esAlerta(u.estado)).length
  const pendientesPunto = useMemo(
    () => (punto ? units.filter((u) => u.despacho && u.ruta && pendienteEnPunto(u.despacho, u.ruta, punto.id, marcas)).length : 0),
    [units, punto, marcas],
  )

  if (!ready || bases.length === 0) return <p className="p-6 text-center text-slate-400">Conectando con la flota…</p>

  const resumen =
    puesto === 'SALIDA'
      ? `${fila.length} en fila · ${llegadasBase.length} por llegar`
      : `${pendientesPunto} unidades por ${puesto === 'LLEGADA' ? 'llegar' : 'pasar'} · ${units.filter((u) => u.unidad.estadoActual === 'EN_RUTA').length} en ruta`

  return (
    <div className="min-h-dvh flex flex-col">
      <PanicBanner units={units} />

      <main className="flex-1 p-3 pb-24 space-y-3 max-w-lg w-full mx-auto">
        {tab === 'puesto' && (
          <BaseHeader
            puesto={puesto}
            onChangePuesto={(p) => { setPuesto(p); setRutaSel(null); setIntervaloManual(null) }}
            bases={bases}
            nodos={nodos}
            puntosIntermedios={puntosIntermedios}
            lugarId={lugarId}
            onChangeLugar={(id) => { setLugarId(id); setRutaSel(null); setIntervaloManual(null) }}
            checadorNombre={CHECADOR_NOMBRE}
            resumen={resumen}
          />
        )}

        {tab === 'puesto' && puesto === 'SALIDA' && base && (
          <>
            <DepartureTimer ruta={rutaActiva} despachos={despachos} unidades={unidades} intervaloMin={intervalo} onChangeIntervalo={setIntervaloManual} />
            <DispatchBoard
              base={base}
              fila={fila}
              rutas={rutasDesdeBase}
              nodos={nodos}
              despachos={despachos}
              intervaloMin={intervalo}
              rutaSeleccionada={rutaSel}
              onSeleccionarRuta={(id) => { setRutaSel(id); setIntervaloManual(null) }}
              onDespachar={(ecoId, rutaId, ocupacion, esperando) => despachar(ecoId, rutaId, CHECADOR_ID, ocupacion, esperando)}
            />
            <ArrivalsPanel base={base} llegadas={llegadasBase} onCheckIn={(id) => checkIn(id, base.id)} />
          </>
        )}

        {tab === 'puesto' && puesto !== 'SALIDA' && punto && (
          <PassPanel
            punto={punto}
            tipo={puesto}
            units={units}
            rutas={rutas}
            despachos={despachos}
            marcas={marcas}
            onMarcar={(despachoId, ocupacion, esperando) => marcar(despachoId, punto.id, CHECADOR_ID, ocupacion, esperando)}
          />
        )}

        {tab === 'monitor' && (
          <FleetMonitor
            nodos={nodos}
            rutas={rutas}
            units={units}
            onCheckIn={checkIn}
            onTaller={(ecoId, aTaller) => setEstadoUnidad(ecoId, aTaller ? 'MANTENIMIENTO' : 'EN_BASE', base?.id ?? bases[0].id)}
          />
        )}

        {tab === 'datos' && <NeedPanel rutas={rutas} puntos={puntos} despachos={despachos} marcas={marcas} onGuardar={actualizarProgramacion} />}

        {tab === 'bitacora' && <DispatchLog despachos={despachos} rutas={rutas} unidades={unidades} nodos={nodos} />}
      </main>

      <nav className="fixed bottom-0 inset-x-0 z-[900] bg-slate-900 border-t border-slate-700 grid grid-cols-4" aria-label="Secciones">
        <TabButton active={tab === 'puesto'} onClick={() => setTab('puesto')} icon={puesto === 'SALIDA' ? '🚏' : puesto === 'INTERMEDIO' ? '📍' : '🏁'} label="Mi puesto" badge={puesto === 'SALIDA' ? llegadasBase.filter((u) => (u.restanteMin ?? 0) < 0).length : pendientesPunto} tone="warn" />
        <TabButton active={tab === 'monitor'} onClick={() => setTab('monitor')} icon="🛰" label="Monitor" badge={alertas} tone="danger" />
        <TabButton active={tab === 'datos'} onClick={() => setTab('datos')} icon="📈" label="Datos" />
        <TabButton active={tab === 'bitacora'} onClick={() => setTab('bitacora')} icon="📊" label="Bitácora" />
      </nav>
    </div>
  )
}

function TabButton({ active, onClick, icon, label, badge, tone = 'danger' }: { active: boolean; onClick: () => void; icon: string; label: string; badge?: number; tone?: 'danger' | 'warn' }) {
  return (
    <button
      onClick={onClick}
      className={`min-h-[64px] flex flex-col items-center justify-center text-xs font-bold relative ${active ? 'text-white bg-slate-800' : 'text-slate-400'}`}
      aria-current={active ? 'page' : undefined}
    >
      <span className="text-2xl leading-none" aria-hidden>{icon}</span>
      {label}
      {badge ? (
        <span className={`absolute top-1.5 right-[calc(50%-30px)] min-w-[20px] h-[20px] px-1 rounded-full text-[11px] font-extrabold grid place-items-center ${tone === 'warn' ? 'bg-warn text-slate-950' : 'bg-danger text-white'}`}>
          {badge}
        </span>
      ) : null}
    </button>
  )
}
