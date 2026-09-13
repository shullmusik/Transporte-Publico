import type { FleetBackend, FleetEvent, Snapshot } from '@/services/backend'
import type { AlertaSeguridad, Despacho, EstadoUnidad, FranjaHoraria, GpsPing, LatLng, MarcaTiempo, Ocupacion, Ruta, TipoAlerta, Unidad } from '@/types'
import { REGLAS, esViajeRedondo, nodoLlegadaDe, ultimaSalida } from '@/lib/dispatch'
import { frecuenciaVigente } from '@/lib/schedule'
import { horaProgramada, ultimaMarcaEnPunto } from '@/lib/marks'
import { NODOS, PUNTOS, RUTAS, UNIDADES, CHOFERES, ESCENARIOS } from './seed'

/**
 * Backend en memoria: mueve las unidades entre nodos según el tiempo transcurrido
 * de su despacho y emite los mismos eventos que Supabase Realtime.
 * Siembra una bitácora del día (despachos + marcas con ocupación por hora) para que
 * la vista de necesidad tenga datos desde el primer arranque.
 */
export class MockBackend implements FleetBackend {
  private listeners = new Set<(e: FleetEvent) => void>()
  private rutas = new Map(RUTAS.map((r) => [r.id, { ...r, programacion: r.programacion.map((f) => ({ ...f })) }]))
  private unidades = new Map<string, Unidad>()
  private despachos = new Map<string, Despacho>()
  private marcas: MarcaTiempo[] = []
  private alertas: AlertaSeguridad[] = []
  private posiciones = new Map<string, GpsPing>()
  private timer?: number
  private readonly tickMs = 2000
  private seq = 0
  private overrides = new Map<string, { congeladoEn?: number; desvioM?: number; sinSenal?: boolean }>()
  private alertasRetraso = new Set<string>()

  constructor() {
    const now = Date.now()
    for (const base of UNIDADES) {
      const u: Unidad = { ...base }
      const sc = ESCENARIOS[u.numeroEco] ?? { base: 'BOD' }
      if (sc.taller) {
        u.estadoActual = 'MANTENIMIENTO'
        u.nodoActualId = undefined
      } else if (sc.rutaId) {
        const ruta = this.rutas.get(sc.rutaId)!
        const salida = new Date(now - (sc.transcurridoMin ?? 5) * 60000)
        const d: Despacho = {
          id: `d-${++this.seq}`,
          ecoId: u.id,
          choferId: u.choferId!,
          rutaId: ruta.id,
          checadorId: 'sim',
          horaSalidaProgramada: salida.toISOString(),
          horaSalidaReal: salida.toISOString(),
          horaLlegadaEstimada: new Date(salida.getTime() + ruta.tiempoEstimadoMin * 60000).toISOString(),
          nodoLlegadaId: nodoLlegadaDe(ruta, NODOS),
          estadoDespacho: sc.panico ? 'ALERTA' : 'EN_TRAYECTO',
          panicoActivo: Boolean(sc.panico),
          panicoDesde: sc.panico ? new Date(now - 90000).toISOString() : undefined,
        }
        this.despachos.set(d.id, d)
        u.estadoActual = 'EN_RUTA'
        u.nodoActualId = undefined
        const p = (sc.transcurridoMin ?? 5) / ruta.tiempoEstimadoMin
        this.overrides.set(u.id, { congeladoEn: sc.detenida ? Math.min(p, 0.7) : undefined, desvioM: sc.desvioM, sinSenal: Boolean(sc.sinSenalMin) })
        const at = new Date(now - (sc.sinSenalMin ?? 0) * 60000).toISOString()
        this.posiciones.set(u.id, { ecoId: u.id, at, location: this.posicionEnRuta(ruta, p, sc.desvioM), speedKmh: sc.detenida ? 0 : 22 })
        // Marcas ya capturadas: salida siempre; puntos cuyo paso programado fue hace > 3 min, casi siempre
        for (const paso of ruta.puntos) {
          const hp = horaProgramada(d, ruta, paso)
          const haceMin = (now - new Date(hp).getTime()) / 60000
          if (paso.tipo === 'SALIDA' || (haceMin > 3 && Math.random() < 0.8 && !sc.detenida)) {
            this.marcas.push(this.nuevaMarca(d, ruta, paso.puntoId, paso.tipo, new Date(new Date(hp).getTime() + (Math.random() - 0.4) * 120000).toISOString(), 'sim', ocupacionPorHora(new Date(hp).getHours())))
          }
        }
        if (sc.panico) {
          const pos = this.posiciones.get(u.id)!.location
          this.alertas.push({ id: `a-${++this.seq}`, despachoId: d.id, tipoAlerta: 'PANICO_CHOFER', latitud: pos.lat, longitud: pos.lng, fechaHora: d.panicoDesde!, atendidaFlag: false })
        }
      } else {
        u.estadoActual = 'EN_BASE'
        u.nodoActualId = sc.base ?? 'BOD'
        u.enBaseDesde = new Date(now - (60 - u.numeroEco) * 60000).toISOString()
        const n = NODOS.find((x) => x.id === u.nodoActualId)!
        this.posiciones.set(u.id, { ecoId: u.id, at: new Date().toISOString(), location: n.ubicacion, speedKmh: 0 })
      }
      this.unidades.set(u.id, u)
    }
    this.sembrarBitacora(now)
  }

  /** Despachos completados desde las 05:30 con marcas en los 4 puntos y ocupación según hora pico/valle. */
  private sembrarBitacora(now: number) {
    const inicio = new Date(now)
    inicio.setHours(5, 30, 0, 0)
    const t = Math.min(inicio.getTime(), now - 60 * 60000)
    const unidadesEnBase = [...this.unidades.values()].filter((u) => u.estadoActual === 'EN_BASE')
    // Cada ruta sale según su programación por franja (con jitter): así el intervalo real
    // de la bitácora se parece a la operación y la vista Datos tiene una base creíble.
    const cola: { t: number; ruta: Ruta; prevT?: number }[] = [...this.rutas.values()].map((ruta) => ({ t: t + Math.random() * 5 * 60000, ruta }))
    let i = 0
    for (;;) {
      cola.sort((a, b) => a.t - b.t)
      const item = cola[0]
      if (item.t >= now - 55 * 60000) break
      const { ruta, prevT } = item
      const salidaT = item.t
      const hora = new Date(salidaT).getHours()
      const pico = (hora >= 6 && hora < 10) || (hora >= 16 && hora < 20)
      const dur = ruta.tiempoEstimadoMin + Math.round((Math.random() - 0.3) * 8) + (pico ? 4 : 0)
      const u = unidadesEnBase[i % unidadesEnBase.length]
      const frecuencia = frecuenciaVigente(ruta, new Date(salidaT))
      item.prevT = salidaT
      item.t = salidaT + frecuencia * (0.7 + Math.random() * 0.6) * 60000
      const d: Despacho = {
        id: `d-${++this.seq}`,
        ecoId: u.id,
        choferId: u.choferId!,
        rutaId: ruta.id,
        checadorId: 'chk-bod-01',
        horaSalidaProgramada: new Date(salidaT).toISOString(),
        horaSalidaReal: new Date(salidaT).toISOString(),
        horaLlegadaEstimada: new Date(salidaT + ruta.tiempoEstimadoMin * 60000).toISOString(),
        horaLlegadaReal: new Date(salidaT + dur * 60000).toISOString(),
        nodoLlegadaId: nodoLlegadaDe(ruta, NODOS),
        estadoDespacho: 'COMPLETADO',
        panicoActivo: false,
        intervaloRealMin: prevT !== undefined ? (salidaT - prevT) / 60000 : undefined,
      }
      this.despachos.set(d.id, d)
      for (const paso of ruta.puntos) {
        const hp = new Date(salidaT + paso.fraccion * dur * 60000 + (Math.random() - 0.5) * 90000).toISOString()
        this.marcas.push(this.nuevaMarca(d, ruta, paso.puntoId, paso.tipo, hp, 'chk', ocupacionPorHora(hora), paso.tipo === 'SALIDA' ? esperandoPorHora(hora) : undefined))
      }
      i++
    }
  }

  private nuevaMarca(d: Despacho, ruta: Ruta, puntoId: string, tipo: MarcaTiempo['tipo'], hora: string, checadorId: string, ocupacion?: Ocupacion, esperando?: number): MarcaTiempo {
    const prev = ultimaMarcaEnPunto(this.marcas, [...this.despachos.values()], ruta.id, puntoId)
    return {
      id: `m-${++this.seq}`,
      despachoId: d.id,
      puntoId,
      tipo,
      hora,
      checadorId,
      ocupacion,
      esperando,
      intervaloRealMin: prev && prev.hora < hora ? (new Date(hora).getTime() - new Date(prev.hora).getTime()) / 60000 : undefined,
    }
  }

  subscribe(listener: (e: FleetEvent) => void) {
    this.listeners.add(listener)
    listener({ type: 'snapshot', data: this.snapshot() })
    if (!this.timer) this.timer = window.setInterval(() => this.tick(), this.tickMs)
    return () => {
      this.listeners.delete(listener)
      if (this.listeners.size === 0 && this.timer) {
        clearInterval(this.timer)
        this.timer = undefined
      }
    }
  }

  private snapshot(): Snapshot {
    return {
      nodos: NODOS,
      puntos: PUNTOS,
      rutas: [...this.rutas.values()],
      unidades: [...this.unidades.values()],
      choferes: CHOFERES,
      despachos: [...this.despachos.values()],
      alertas: [...this.alertas],
      marcas: [...this.marcas],
      posiciones: Object.fromEntries(this.posiciones),
    }
  }

  private emit(e: FleetEvent) {
    this.listeners.forEach((l) => l(e))
  }

  private tick() {
    const now = Date.now()
    const lote: GpsPing[] = []
    for (const d of this.despachos.values()) {
      if (d.estadoDespacho === 'COMPLETADO') continue
      const ruta = this.rutas.get(d.rutaId)!
      const ov = this.overrides.get(d.ecoId) ?? {}
      if (ov.sinSenal) continue
      const transcurrido = (now - new Date(d.horaSalidaReal).getTime()) / 60000
      const p = ov.congeladoEn ?? Math.min(transcurrido / ruta.tiempoEstimadoMin, 1)
      const llegado = p >= 1
      const velocidad = ov.congeladoEn !== undefined || llegado ? 0 : d.panicoActivo ? 40 : 20 + Math.round(Math.random() * 8)
      const ping: GpsPing = { ecoId: d.ecoId, at: new Date(now).toISOString(), location: this.posicionEnRuta(ruta, p, ov.desvioM), speedKmh: velocidad }
      this.posiciones.set(d.ecoId, ping)
      lote.push(ping)

      const retrasoMin = (now - new Date(d.horaLlegadaEstimada).getTime()) / 60000
      if (retrasoMin > REGLAS.toleranciaRetrasoMin && !this.alertasRetraso.has(d.id)) {
        this.alertasRetraso.add(d.id)
        void this.crearAlerta({ despachoId: d.id, tipoAlerta: 'RETRASO_AUTOMATICO', creadaPor: 'sistema', location: ping.location })
      }
    }
    if (lote.length) this.emit({ type: 'posiciones', data: lote })
  }

  /** Posición sobre el corredor: ida al destino y, si es viaje redondo, regreso al origen. */
  private posicionEnRuta(ruta: Ruta, p: number, desvioM = 0): LatLng {
    const o = NODOS.find((n) => n.id === ruta.nodoOrigenId)!.ubicacion
    const dst = NODOS.find((n) => n.id === ruta.nodoDestinoId)!.ubicacion
    const redondo = esViajeRedondo(ruta, NODOS)
    p = Math.min(Math.max(p, 0), 1)
    let a = o, b = dst, t = p
    if (redondo) {
      if (p < 0.5) t = p * 2
      else { a = dst; b = o; t = (p - 0.5) * 2 }
    }
    const arco = Math.sin(t * Math.PI) * 0.004
    const lat = a.lat + (b.lat - a.lat) * t + arco
    const lng = a.lng + (b.lng - a.lng) * t
    return { lat, lng: lng + desvioM / (111320 * Math.cos((lat * Math.PI) / 180)) }
  }

  // ---------- Comandos ----------

  async despachar(input: { ecoId: string; rutaId: string; checadorId: string; horaSalidaProgramada?: string; ocupacion?: Ocupacion; esperando?: number }) {
    const u = this.unidades.get(input.ecoId)
    const ruta = this.rutas.get(input.rutaId)
    if (!u || !ruta) throw new Error('Unidad o ruta inexistente')
    if (u.estadoActual !== 'EN_BASE') throw new Error(`ECO ${u.numeroEco} no está en base`)
    const now = new Date()
    const prev = ultimaSalida([...this.despachos.values()], ruta.id)
    const d: Despacho = {
      id: `d-${++this.seq}`,
      ecoId: u.id,
      choferId: u.choferId ?? '',
      rutaId: ruta.id,
      checadorId: input.checadorId,
      horaSalidaProgramada: input.horaSalidaProgramada ?? now.toISOString(),
      horaSalidaReal: now.toISOString(),
      horaLlegadaEstimada: new Date(now.getTime() + ruta.tiempoEstimadoMin * 60000).toISOString(),
      nodoLlegadaId: nodoLlegadaDe(ruta, NODOS),
      estadoDespacho: 'EN_TRAYECTO',
      panicoActivo: false,
      intervaloRealMin: prev ? (now.getTime() - new Date(prev.horaSalidaReal).getTime()) / 60000 : undefined,
    }
    this.despachos.set(d.id, d)
    const nu: Unidad = { ...u, estadoActual: 'EN_RUTA', nodoActualId: undefined, enBaseDesde: undefined }
    this.unidades.set(u.id, nu)
    this.overrides.delete(u.id)
    // La salida es la primera marca de tiempo del despacho
    const m = this.nuevaMarca(d, ruta, ruta.nodoOrigenId, 'SALIDA', d.horaSalidaReal, input.checadorId, input.ocupacion, input.esperando)
    this.marcas.push(m)
    this.emit({ type: 'despacho', data: d })
    this.emit({ type: 'unidad', data: nu })
    this.emit({ type: 'marca', data: m })
    return d
  }

  async marcar(input: { despachoId: string; puntoId: string; checadorId: string; ocupacion?: Ocupacion; esperando?: number }) {
    const d = this.despachos.get(input.despachoId)
    if (!d) throw new Error('Despacho inexistente')
    const ruta = this.rutas.get(d.rutaId)!
    const paso = ruta.puntos.find((p) => p.puntoId === input.puntoId)
    if (!paso) throw new Error('La ruta no pasa por este punto')
    const m = this.nuevaMarca(d, ruta, input.puntoId, paso.tipo, new Date().toISOString(), input.checadorId, input.ocupacion, input.esperando)
    this.marcas.push(m)
    this.emit({ type: 'marca', data: m })
    // Llegada a una base = check-in (base-a-base). En viaje redondo la unidad sigue de regreso.
    if (paso.tipo === 'LLEGADA' && d.nodoLlegadaId === input.puntoId) await this.checkIn({ despachoId: d.id, nodoId: input.puntoId })
    return m
  }

  async actualizarProgramacion(rutaId: string, programacion: FranjaHoraria[]) {
    const r = this.rutas.get(rutaId)
    if (!r) throw new Error('Ruta inexistente')
    const nr: Ruta = { ...r, programacion: programacion.map((f) => ({ ...f })) }
    this.rutas.set(rutaId, nr)
    this.emit({ type: 'ruta', data: nr })
    return nr
  }

  async checkIn(input: { despachoId: string; nodoId: string }) {
    const d = this.despachos.get(input.despachoId)
    if (!d) throw new Error('Despacho inexistente')
    if (d.estadoDespacho === 'COMPLETADO') return d
    const nd: Despacho = { ...d, horaLlegadaReal: new Date().toISOString(), estadoDespacho: 'COMPLETADO', panicoActivo: false }
    this.despachos.set(d.id, nd)
    const u = this.unidades.get(d.ecoId)!
    const nu: Unidad = { ...u, estadoActual: 'EN_BASE', nodoActualId: input.nodoId, enBaseDesde: nd.horaLlegadaReal }
    this.unidades.set(u.id, nu)
    this.overrides.delete(u.id)
    const n = NODOS.find((x) => x.id === input.nodoId)!
    const ping: GpsPing = { ecoId: u.id, at: nd.horaLlegadaReal!, location: n.ubicacion, speedKmh: 0 }
    this.posiciones.set(u.id, ping)
    this.emit({ type: 'despacho', data: nd })
    this.emit({ type: 'unidad', data: nu })
    this.emit({ type: 'posicion', data: ping })
    return nd
  }

  async setEstadoUnidad(ecoId: string, estado: EstadoUnidad, nodoId?: string) {
    const u = this.unidades.get(ecoId)
    if (!u) return
    const nu: Unidad = { ...u, estadoActual: estado, nodoActualId: estado === 'EN_BASE' ? nodoId ?? 'BOD' : undefined, enBaseDesde: estado === 'EN_BASE' ? new Date().toISOString() : undefined }
    this.unidades.set(ecoId, nu)
    this.emit({ type: 'unidad', data: nu })
  }

  async crearAlerta(input: { despachoId: string; tipoAlerta: TipoAlerta; creadaPor: string; location?: LatLng; nota?: string }) {
    const a: AlertaSeguridad = {
      id: `a-${++this.seq}`,
      despachoId: input.despachoId,
      tipoAlerta: input.tipoAlerta,
      latitud: input.location?.lat,
      longitud: input.location?.lng,
      fechaHora: new Date().toISOString(),
      atendidaFlag: false,
      creadaPor: input.creadaPor,
      nota: input.nota,
    }
    this.alertas.push(a)
    const d = this.despachos.get(input.despachoId)
    if (d && d.estadoDespacho === 'EN_TRAYECTO' && input.tipoAlerta !== 'REPORTE_POLICIAL') {
      const nd = { ...d, estadoDespacho: 'ALERTA' as const }
      this.despachos.set(d.id, nd)
      this.emit({ type: 'despacho', data: nd })
    }
    this.emit({ type: 'alerta', data: a })
    return a
  }

  async atenderAlerta(alertaId: string) {
    const a = this.alertas.find((x) => x.id === alertaId)
    if (!a) return
    a.atendidaFlag = true
    this.emit({ type: 'alerta', data: { ...a } })
  }

  async setPanico(despachoId: string, activo: boolean) {
    const d = this.despachos.get(despachoId)
    if (!d) return
    const nd: Despacho = { ...d, panicoActivo: activo, panicoDesde: activo ? new Date().toISOString() : d.panicoDesde, estadoDespacho: activo ? 'ALERTA' : d.estadoDespacho }
    this.despachos.set(d.id, nd)
    this.emit({ type: 'despacho', data: nd })
    if (activo) await this.crearAlerta({ despachoId, tipoAlerta: 'PANICO_CHOFER', creadaPor: d.choferId, location: this.posiciones.get(d.ecoId)?.location })
  }

  async enviarPing(ping: GpsPing) {
    this.posiciones.set(ping.ecoId, ping)
    this.emit({ type: 'posicion', data: ping })
  }
}

/** Ocupación típica por hora: llena en picos, vacía en valle/noche. */
function ocupacionPorHora(h: number): Ocupacion {
  const r = Math.random()
  if ((h >= 6 && h < 10) || (h >= 17 && h < 20)) return r < 0.6 ? 'LLENA' : r < 0.9 ? 'MEDIA' : 'VACIA'
  if (h >= 13 && h < 17) return r < 0.25 ? 'LLENA' : r < 0.75 ? 'MEDIA' : 'VACIA'
  return r < 0.08 ? 'LLENA' : r < 0.45 ? 'MEDIA' : 'VACIA'
}

/** Gente esperando en la base al salir. */
function esperandoPorHora(h: number): number {
  if ((h >= 6 && h < 10) || (h >= 17 && h < 20)) return 4 + Math.floor(Math.random() * 12)
  if (h >= 13 && h < 17) return Math.floor(Math.random() * 6)
  return Math.floor(Math.random() * 3)
}
