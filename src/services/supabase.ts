import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { FleetBackend, FleetEvent, Snapshot } from './backend'
import type { AlertaSeguridad, Despacho, EstadoUnidad, FranjaHoraria, GpsPing, LatLng, MarcaTiempo, Ocupacion, Ruta, TipoAlerta, TipoPunto, Unidad } from '@/types'

/**
 * Adaptador Supabase: snake_case ↔ camelCase y postgres_changes → FleetEvent.
 * La lógica transaccional (poner EN_RUTA, calcular llegada, intervalo real,
 * pánico → alerta) vive en triggers: ver supabase/schema.sql.
 */
export class SupabaseBackend implements FleetBackend {
  private sb: SupabaseClient

  constructor(url = import.meta.env.VITE_SUPABASE_URL, key = import.meta.env.VITE_SUPABASE_ANON_KEY) {
    if (!url || !key) throw new Error('Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
    this.sb = createClient(url, key, { realtime: { params: { eventsPerSecond: 30 } } })
  }

  subscribe(listener: (e: FleetEvent) => void) {
    void this.snapshot().then((data) => listener({ type: 'snapshot', data }))
    const ch = this.sb
      .channel('flota')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'unidades' }, (p) => listener({ type: 'unidad', data: toUnidad(p.new as Row) }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'despachos' }, (p) => listener({ type: 'despacho', data: toDespacho(p.new as Row) }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alertas_seguridad' }, (p) => listener({ type: 'alerta', data: toAlerta(p.new as Row) }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posiciones_actuales' }, (p) => listener({ type: 'posicion', data: toPing(p.new as Row) }))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'marcas_tiempo' }, (p) => listener({ type: 'marca', data: toMarca(p.new as Row) }))
      // Cambios de programación: recargar la ruta completa (franjas + puntos)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'franjas_horarias' }, (p) => void this.cargarRuta((p.new as Row).ruta_id as string).then((r) => r && listener({ type: 'ruta', data: r })))
      .subscribe()
    return () => void this.sb.removeChannel(ch)
  }

  private async snapshot(): Promise<Snapshot> {
    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)
    const [nodos, puntos, rutas, pasos, franjas, unidades, choferes, despachos, alertas, marcas, posiciones] = await Promise.all([
      this.sb.from('nodos').select('*'),
      this.sb.from('puntos_control').select('*'),
      this.sb.from('rutas').select('*').eq('activa', true),
      this.sb.from('ruta_puntos').select('*').order('orden'),
      this.sb.from('franjas_horarias').select('*').order('inicio'),
      this.sb.from('unidades').select('*'),
      this.sb.from('choferes').select('*'),
      this.sb.from('despachos').select('*').gte('hora_salida_real', hoy.toISOString()),
      this.sb.from('alertas_seguridad').select('*').eq('atendida_flag', false),
      this.sb.from('marcas_tiempo').select('*').gte('hora', hoy.toISOString()),
      this.sb.from('posiciones_actuales').select('*'),
    ])
    const pasosRows = rows(pasos.data)
    const franjasRows = rows(franjas.data)
    return {
      nodos: rows(nodos.data).map((n) => ({ id: n.id as string, nombre: n.nombre as string, corto: n.corto as string, esBase: Boolean(n.es_base), ubicacion: parsePoint(n.ubicacion) })),
      puntos: rows(puntos.data).map((p) => ({ id: p.id as string, nombre: p.nombre as string, ubicacion: parsePoint(p.ubicacion) })),
      rutas: rows(rutas.data).map((r) => toRuta(r, pasosRows, franjasRows)),
      marcas: rows(marcas.data).map(toMarca),
      unidades: rows(unidades.data).map(toUnidad),
      choferes: rows(choferes.data).map((c) => ({ id: c.id as string, nombre: c.nombre as string, telefono: (c.telefono as string) ?? '', fotoUrl: c.foto_url as string | undefined, licencia: c.licencia as string | undefined })),
      despachos: rows(despachos.data).map(toDespacho),
      alertas: rows(alertas.data).map(toAlerta),
      posiciones: Object.fromEntries(rows(posiciones.data).map(toPing).map((p) => [p.ecoId, p])),
    }
  }

  private async cargarRuta(rutaId: string): Promise<Ruta | undefined> {
    const [r, pasos, franjas] = await Promise.all([
      this.sb.from('rutas').select('*').eq('id', rutaId).single(),
      this.sb.from('ruta_puntos').select('*').eq('ruta_id', rutaId).order('orden'),
      this.sb.from('franjas_horarias').select('*').eq('ruta_id', rutaId).order('inicio'),
    ])
    return r.data ? toRuta(r.data as Row, rows(pasos.data), rows(franjas.data)) : undefined
  }

  async marcar(input: { despachoId: string; puntoId: string; checadorId: string; ocupacion?: Ocupacion; esperando?: number }) {
    // El trigger calcula tipo, intervalo real y, si es llegada a base, completa el despacho
    const { data, error } = await this.sb
      .from('marcas_tiempo')
      .insert({ despacho_id: input.despachoId, punto_id: input.puntoId, checador_id: input.checadorId, ocupacion: input.ocupacion, esperando: input.esperando })
      .select()
      .single()
    if (error) throw error
    return toMarca(data as Row)
  }

  async actualizarProgramacion(rutaId: string, programacion: FranjaHoraria[]) {
    await this.sb.from('franjas_horarias').delete().eq('ruta_id', rutaId)
    const { error } = await this.sb.from('franjas_horarias').insert(programacion.map((f) => ({ ruta_id: rutaId, inicio: f.inicio, fin: f.fin, frecuencia_min: f.frecuenciaMin })))
    if (error) throw error
    return (await this.cargarRuta(rutaId))!
  }

  async despachar(input: { ecoId: string; rutaId: string; checadorId: string; horaSalidaProgramada?: string; ocupacion?: Ocupacion; esperando?: number }) {
    const { data, error } = await this.sb
      .from('despachos')
      .insert({ eco_id: input.ecoId, ruta_id: input.rutaId, checador_id: input.checadorId, hora_salida_programada: input.horaSalidaProgramada, hora_llegada_estimada: new Date().toISOString() /* lo recalcula el trigger */, nodo_llegada_id: 'BOD' /* idem */, ocupacion_salida: input.ocupacion, esperando_salida: input.esperando })
      .select()
      .single()
    if (error) throw error
    return toDespacho(data as Row)
  }

  async checkIn(input: { despachoId: string; nodoId: string }) {
    const { data, error } = await this.sb
      .from('despachos')
      .update({ estado_despacho: 'COMPLETADO', nodo_llegada_id: input.nodoId })
      .eq('id', input.despachoId)
      .select()
      .single()
    if (error) throw error
    return toDespacho(data as Row)
  }

  async setEstadoUnidad(ecoId: string, estado: EstadoUnidad, nodoId?: string) {
    await this.sb.from('unidades').update({ estado_actual: estado, nodo_actual_id: estado === 'EN_BASE' ? nodoId : null, en_base_desde: estado === 'EN_BASE' ? new Date().toISOString() : null }).eq('id', ecoId)
  }

  async crearAlerta(input: { despachoId: string; tipoAlerta: TipoAlerta; creadaPor: string; location?: LatLng; nota?: string }) {
    const { data, error } = await this.sb
      .from('alertas_seguridad')
      .insert({ despacho_id: input.despachoId, tipo_alerta: input.tipoAlerta, creada_por: input.creadaPor, latitud: input.location?.lat, longitud: input.location?.lng, nota: input.nota })
      .select()
      .single()
    if (error) throw error
    return toAlerta(data as Row)
  }

  async atenderAlerta(alertaId: string) {
    await this.sb.from('alertas_seguridad').update({ atendida_flag: true }).eq('id', alertaId)
  }

  async setPanico(despachoId: string, activo: boolean) {
    await this.sb.from('despachos').update({ panico_activo: activo }).eq('id', despachoId)
  }

  async enviarPing(p: GpsPing) {
    await this.sb.from('posiciones_gps').insert({ eco_id: p.ecoId, at: p.at, ubicacion: `POINT(${p.location.lng} ${p.location.lat})`, velocidad_kmh: p.speedKmh, rumbo: p.heading, precision_m: p.accuracyM })
  }
}

type Row = Record<string, unknown>
const rows = (d: unknown): Row[] => (d ?? []) as Row[]

/** PostGIS puede llegar como GeoJSON o {lat,lng} según la config. */
function parsePoint(v: unknown): LatLng {
  if (v && typeof v === 'object' && 'coordinates' in (v as object)) {
    const [lng, lat] = (v as { coordinates: [number, number] }).coordinates
    return { lat, lng }
  }
  if (v && typeof v === 'object' && 'lat' in (v as object)) return v as LatLng
  return { lat: 0, lng: 0 }
}

const toRuta = (r: Row, pasos: Row[], franjas: Row[]): Ruta => ({
  id: r.id as string,
  nombre: r.nombre as string,
  nodoOrigenId: r.nodo_origen_id as string,
  nodoDestinoId: r.nodo_destino_id as string,
  tiempoEstimadoMin: r.tiempo_estimado_minutos as number,
  frecuenciaObjetivoMin: r.frecuencia_objetivo_minutos as number,
  ecoRango: r.eco_min != null && r.eco_max != null ? [r.eco_min as number, r.eco_max as number] : undefined,
  puntos: pasos.filter((p) => p.ruta_id === r.id).map((p) => ({ puntoId: p.punto_id as string, tipo: p.tipo as TipoPunto, fraccion: p.fraccion as number })),
  programacion: franjas.filter((f) => f.ruta_id === r.id).map((f) => ({ inicio: (f.inicio as string).slice(0, 5), fin: (f.fin as string).slice(0, 5), frecuenciaMin: f.frecuencia_min as number })),
})

const toMarca = (r: Row): MarcaTiempo => ({
  id: r.id as string,
  despachoId: r.despacho_id as string,
  puntoId: r.punto_id as string,
  tipo: r.tipo as TipoPunto,
  hora: r.hora as string,
  checadorId: (r.checador_id as string) ?? '',
  ocupacion: (r.ocupacion as Ocupacion) ?? undefined,
  esperando: (r.esperando as number) ?? undefined,
  intervaloRealMin: (r.intervalo_real_min as number) ?? undefined,
})

const toUnidad = (r: Row): Unidad => ({
  id: r.id as string,
  numeroEco: r.numero_eco as number,
  placas: r.placas as string,
  marca: (r.marca as string) ?? '',
  modelo: (r.modelo as string) ?? '',
  color: (r.color as string) ?? '',
  estadoActual: r.estado_actual as EstadoUnidad,
  nodoActualId: (r.nodo_actual_id as string) ?? undefined,
  enBaseDesde: (r.en_base_desde as string) ?? undefined,
  choferId: (r.chofer_id as string) ?? undefined,
})

const toDespacho = (r: Row): Despacho => ({
  id: r.id as string,
  ecoId: r.eco_id as string,
  choferId: (r.chofer_id as string) ?? '',
  rutaId: r.ruta_id as string,
  checadorId: (r.checador_id as string) ?? '',
  horaSalidaProgramada: r.hora_salida_programada as string,
  horaSalidaReal: r.hora_salida_real as string,
  horaLlegadaEstimada: r.hora_llegada_estimada as string,
  horaLlegadaReal: (r.hora_llegada_real as string) ?? undefined,
  nodoLlegadaId: r.nodo_llegada_id as string,
  estadoDespacho: r.estado_despacho as Despacho['estadoDespacho'],
  panicoActivo: Boolean(r.panico_activo),
  panicoDesde: (r.panico_desde as string) ?? undefined,
  intervaloRealMin: (r.intervalo_real_min as number) ?? undefined,
})

const toAlerta = (r: Row): AlertaSeguridad => ({
  id: r.id as string,
  despachoId: r.despacho_id as string,
  tipoAlerta: r.tipo_alerta as TipoAlerta,
  latitud: (r.latitud as number) ?? undefined,
  longitud: (r.longitud as number) ?? undefined,
  fechaHora: r.fecha_hora as string,
  atendidaFlag: Boolean(r.atendida_flag),
  creadaPor: (r.creada_por as string) ?? undefined,
  nota: (r.nota as string) ?? undefined,
})

const toPing = (r: Row): GpsPing => ({
  ecoId: r.eco_id as string,
  at: r.at as string,
  location: parsePoint(r.ubicacion),
  speedKmh: (r.velocidad_kmh as number) ?? 0,
  heading: (r.rumbo as number) ?? undefined,
})
