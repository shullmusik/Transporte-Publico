import type { AlertaSeguridad, Chofer, Despacho, FranjaHoraria, GpsPing, LatLng, MarcaTiempo, Nodo, Ocupacion, PuntoControl, Ruta, TipoAlerta, Unidad, EstadoUnidad } from '@/types'

/**
 * Contrato único entre la UI y el mundo exterior.
 * - `MockBackend`     (src/mock/simulator.ts)   corre en memoria con flota simulada.
 * - `SupabaseBackend` (src/services/supabase.ts) usa postgres_changes.
 * VITE_BACKEND=mock|supabase decide cuál se carga.
 */

export interface Snapshot {
  nodos: Nodo[]
  puntos: PuntoControl[]
  rutas: Ruta[]
  unidades: Unidad[]
  choferes: Chofer[]
  /** Despachos del día (activos + completados) para bitácora y temporizadores. */
  despachos: Despacho[]
  alertas: AlertaSeguridad[]
  /** Marcas de tiempo del día en puntos de control. */
  marcas: MarcaTiempo[]
  /** Última posición por ECO. */
  posiciones: Record<string, GpsPing>
}

export type FleetEvent =
  | { type: 'snapshot'; data: Snapshot }
  | { type: 'unidad'; data: Unidad }
  | { type: 'despacho'; data: Despacho }
  | { type: 'alerta'; data: AlertaSeguridad }
  | { type: 'marca'; data: MarcaTiempo }
  | { type: 'ruta'; data: Ruta }
  | { type: 'posicion'; data: GpsPing }
  /** Lote de posiciones en un solo evento (evita 100 re-renders por tick). */
  | { type: 'posiciones'; data: GpsPing[] }

export interface FleetBackend {
  subscribe(listener: (e: FleetEvent) => void): () => void

  /** Checador suelta una unidad. Crea el despacho y pone la unidad EN_RUTA. */
  despachar(input: { ecoId: string; rutaId: string; checadorId: string; horaSalidaProgramada?: string; ocupacion?: Ocupacion; esperando?: number }): Promise<Despacho>
  /** Checador intermedio o de llegada marca el paso por su punto. */
  marcar(input: { despachoId: string; puntoId: string; checadorId: string; ocupacion?: Ocupacion; esperando?: number }): Promise<MarcaTiempo>
  /** Ajuste de la programación por franjas de una ruta. */
  actualizarProgramacion(rutaId: string, programacion: FranjaHoraria[]): Promise<Ruta>
  /** Check-in de llegada: cierra el despacho y forma la unidad en la base indicada. */
  checkIn(input: { despachoId: string; nodoId: string }): Promise<Despacho>
  /** Cambiar estado manual (mantenimiento / alta). */
  setEstadoUnidad(ecoId: string, estado: EstadoUnidad, nodoId?: string): Promise<void>

  crearAlerta(input: { despachoId: string; tipoAlerta: TipoAlerta; creadaPor: string; location?: LatLng; nota?: string }): Promise<AlertaSeguridad>
  atenderAlerta(alertaId: string): Promise<void>
  setPanico(despachoId: string, activo: boolean): Promise<void>
  enviarPing(ping: GpsPing): Promise<void>
}
