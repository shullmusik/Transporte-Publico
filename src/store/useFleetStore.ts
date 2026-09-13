import { create } from 'zustand'
import type { FleetBackend, FleetEvent, Snapshot } from '@/services/backend'
import type { AlertaSeguridad, Despacho, EstadoUnidad, FranjaHoraria, LatLng, LiveUnit, MarcaTiempo, Ocupacion, Ruta, TipoAlerta, Unidad } from '@/types'
import { clasificar, etaGps, sentidoActual } from '@/lib/anomaly'
import { minutosDesde, minutosHasta, semaforoChofer } from '@/lib/dispatch'
import { horaProgramada, siguientePaso, ultimaMarcaDe } from '@/lib/marks'

interface FleetState extends Snapshot {
  ready: boolean
  /** Tick por segundo: fuerza recálculo de cronómetros, ETAs y "hace N min". */
  clock: number
  backend?: FleetBackend
  connect(backend: FleetBackend): () => void

  despachar(ecoId: string, rutaId: string, checadorId: string, ocupacion?: Ocupacion, esperando?: number): Promise<Despacho>
  marcar(despachoId: string, puntoId: string, checadorId: string, ocupacion?: Ocupacion, esperando?: number): Promise<MarcaTiempo>
  actualizarProgramacion(rutaId: string, programacion: FranjaHoraria[]): Promise<Ruta>
  checkIn(despachoId: string, nodoId: string): Promise<Despacho>
  setEstadoUnidad(ecoId: string, estado: EstadoUnidad, nodoId?: string): Promise<void>
  reportarEmergencia(despachoId: string, creadaPor: string, nota: string, tipo?: TipoAlerta, location?: LatLng): Promise<AlertaSeguridad>
  atenderAlerta(alertaId: string): Promise<void>
  setPanico(despachoId: string, activo: boolean): Promise<void>
}

const vacio: Snapshot = { nodos: [], puntos: [], rutas: [], unidades: [], choferes: [], despachos: [], alertas: [], marcas: [], posiciones: {} }

const upsert = <T extends { id: string }>(xs: T[], x: T) => (xs.some((y) => y.id === x.id) ? xs.map((y) => (y.id === x.id ? x : y)) : [...xs, x])

export const useFleetStore = create<FleetState>((set, get) => ({
  ...vacio,
  ready: false,
  clock: 0,

  connect(backend) {
    const unsub = backend.subscribe((e: FleetEvent) => {
      switch (e.type) {
        case 'snapshot':
          set({ ...e.data, ready: true })
          break
        case 'unidad':
          set((s) => ({ unidades: upsert(s.unidades, e.data) }))
          break
        case 'despacho':
          set((s) => ({ despachos: upsert(s.despachos, e.data) }))
          break
        case 'alerta':
          set((s) => ({ alertas: upsert(s.alertas, e.data) }))
          break
        case 'marca':
          set((s) => ({ marcas: upsert(s.marcas, e.data) }))
          break
        case 'ruta':
          set((s) => ({ rutas: upsert(s.rutas, e.data) }))
          break
        case 'posicion':
          set((s) => ({ posiciones: { ...s.posiciones, [e.data.ecoId]: e.data } }))
          break
        case 'posiciones':
          set((s) => ({ posiciones: { ...s.posiciones, ...Object.fromEntries(e.data.map((p) => [p.ecoId, p])) } }))
          break
      }
    })
    const clock = window.setInterval(() => set((s) => ({ clock: s.clock + 1 })), 1000)
    set({ backend })
    return () => {
      unsub()
      clearInterval(clock)
      set({ backend: undefined })
    }
  },

  despachar: (ecoId, rutaId, checadorId, ocupacion, esperando) => get().backend!.despachar({ ecoId, rutaId, checadorId, ocupacion, esperando }),
  marcar: (despachoId, puntoId, checadorId, ocupacion, esperando) => get().backend!.marcar({ despachoId, puntoId, checadorId, ocupacion, esperando }),
  actualizarProgramacion: (rutaId, programacion) => get().backend!.actualizarProgramacion(rutaId, programacion),
  checkIn: (despachoId, nodoId) => get().backend!.checkIn({ despachoId, nodoId }),
  setEstadoUnidad: (ecoId, estado, nodoId) => get().backend!.setEstadoUnidad(ecoId, estado, nodoId),
  reportarEmergencia: (despachoId, creadaPor, nota, tipoAlerta = 'REPORTE_POLICIAL', location) =>
    get().backend!.crearAlerta({ despachoId, tipoAlerta, creadaPor, nota, location }),
  atenderAlerta: (alertaId) => get().backend!.atenderAlerta(alertaId),
  setPanico: (despachoId, activo) => get().backend!.setPanico(despachoId, activo),
}))

// ---------- Selectores derivados ----------

/** Despacho activo (no completado) de una unidad. */
export const despachoActivoDe = (despachos: Despacho[], ecoId: string) =>
  despachos.find((d) => d.ecoId === ecoId && d.estadoDespacho !== 'COMPLETADO')

export function buildLiveUnit(unidad: Unidad, s: Snapshot, now = Date.now()): LiveUnit {
  const chofer = s.choferes.find((c) => c.id === unidad.choferId)
  const despacho = unidad.estadoActual === 'EN_RUTA' ? despachoActivoDe(s.despachos, unidad.id) : undefined
  const ruta = despacho ? s.rutas.find((r) => r.id === despacho.rutaId) : undefined
  const lastPing = s.posiciones[unidad.id]
  const estado = clasificar(unidad, despacho, ruta, s.nodos, lastPing, now)
  const base: LiveUnit = {
    unidad,
    chofer,
    lastPing,
    estado,
    nodoOrigen: s.nodos.find((n) => n.id === (ruta?.nodoOrigenId ?? unidad.nodoActualId)),
  }
  if (!despacho || !ruta) return base
  const sentido = sentidoActual(despacho, ruta, s.nodos, now)
  const eta = etaGps(lastPing, despacho, ruta, s.nodos, sentido)
  const paso = siguientePaso(despacho, ruta, s.marcas)
  return {
    ...base,
    ultimaMarca: ultimaMarcaDe(s.marcas, despacho.id),
    siguientePaso: paso,
    horaSiguientePaso: paso ? horaProgramada(despacho, ruta, paso) : undefined,
    despacho,
    ruta,
    nodoDestino: s.nodos.find((n) => n.id === ruta.nodoDestinoId),
    nodoLlegada: s.nodos.find((n) => n.id === despacho.nodoLlegadaId),
    transcurridoMin: minutosDesde(despacho.horaSalidaReal, now),
    restanteMin: minutosHasta(despacho.horaLlegadaEstimada, now),
    etaGpsMin: eta,
    sentido,
    semaforo: semaforoChofer(despacho, eta, now),
  }
}

/** Todas las unidades como LiveUnit; se recalcula cada segundo (clock). */
export const useLiveUnits = (): LiveUnit[] =>
  useFleetStore((st) => {
    void st.clock
    return st.unidades.map((u) => buildLiveUnit(u, st))
  })

export const useLiveUnit = (ecoId: string | undefined): LiveUnit | undefined =>
  useFleetStore((st) => {
    void st.clock
    const u = st.unidades.find((x) => x.id === ecoId)
    return u ? buildLiveUnit(u, st) : undefined
  })

export const useAlertasAbiertas = () => useFleetStore((st) => st.alertas.filter((a) => !a.atendidaFlag))
