import type { Despacho, Ruta, Nodo, Unidad, SemaforoChofer } from '@/types'

/**
 * Reglas de despacho: frecuencia regulada, fila FIFO, rango de ECOs,
 * cálculo de llegada y semáforo del chofer.
 */

/** Umbrales operativos (en producción: tabla `rutas` o config remota). */
export const REGLAS = {
  /** Minutos sobre el tiempo estimado para marcar RETRASO_SOSPECHOSO. */
  toleranciaRetrasoMin: 10,
  /** Tolerancia del semáforo del chofer (± min sobre la llegada programada). */
  toleranciaChoferMin: 3,
  /** Sin ping GPS por más de N min → SIN_SENAL. */
  sinSenalMin: 4,
  /** Metros fuera del corredor de la ruta para marcar DESVIO. */
  desvioM: 900,
  /** Velocidad urbana de referencia para ETA por GPS (km/h). */
  velocidadRefKmh: 25,
}

/** Opciones del temporizador del checador. */
export const INTERVALOS_TIMER = [3, 4, 5, 10] as const

/** Nodo donde la unidad debe hacer check-in al terminar el despacho. */
export function nodoLlegadaDe(ruta: Ruta, nodos: Nodo[]): string {
  const destino = nodos.find((n) => n.id === ruta.nodoDestinoId)
  return destino?.esBase ? ruta.nodoDestinoId : ruta.nodoOrigenId
}

export const esViajeRedondo = (ruta: Ruta, nodos: Nodo[]) => nodoLlegadaDe(ruta, nodos) === ruta.nodoOrigenId

/** Último despacho de una ruta (para el temporizador de frecuencia). */
export function ultimaSalida(despachos: Despacho[], rutaId: string): Despacho | undefined {
  let best: Despacho | undefined
  for (const d of despachos) {
    if (d.rutaId !== rutaId) continue
    if (!best || d.horaSalidaReal > best.horaSalidaReal) best = d
  }
  return best
}

/**
 * ¿Cuándo puede salir la siguiente unidad en esta ruta?
 * `intervaloMin` es el que eligió el checador (3/4/5/10) o la frecuencia objetivo de la ruta.
 */
export function proximaSalida(
  despachos: Despacho[],
  rutaId: string,
  intervaloMin: number,
  now = Date.now(),
): { ultima?: Despacho; salidaAutorizadaMs: number; esperaMin: number; listo: boolean } {
  const ultima = ultimaSalida(despachos, rutaId)
  const salidaAutorizadaMs = ultima ? new Date(ultima.horaSalidaReal).getTime() + intervaloMin * 60000 : now
  const esperaMin = Math.max(0, (salidaAutorizadaMs - now) / 60000)
  return { ultima, salidaAutorizadaMs, esperaMin, listo: esperaMin <= 0 }
}

/** Fila de espera FIFO de una base. */
export function filaEnBase(unidades: Unidad[], nodoId: string): Unidad[] {
  return unidades
    .filter((u) => u.estadoActual === 'EN_BASE' && u.nodoActualId === nodoId)
    .sort((a, b) => (a.enBaseDesde ?? '').localeCompare(b.enBaseDesde ?? '') || a.numeroEco - b.numeroEco)
}

export const ecoAutorizado = (ruta: Ruta, eco: number) =>
  !ruta.ecoRango || (eco >= ruta.ecoRango[0] && eco <= ruta.ecoRango[1])

export const minutosDesde = (iso: string, now = Date.now()) => (now - new Date(iso).getTime()) / 60000
export const minutosHasta = (iso: string, now = Date.now()) => (new Date(iso).getTime() - now) / 60000

/**
 * Semáforo en cabina. Compara la llegada programada contra la ETA real por GPS:
 *   ETA muy antes de lo programado  → ADELANTADO (viene "carreado", debe bajar el ritmo)
 *   ETA después de lo programado     → RETRASADO
 */
export function semaforoChofer(despacho: Despacho, etaGpsMin: number | undefined, now = Date.now()): SemaforoChofer {
  const restanteProg = minutosHasta(despacho.horaLlegadaEstimada, now)
  if (etaGpsMin === undefined) return restanteProg < -REGLAS.toleranciaChoferMin ? 'RETRASADO' : 'EN_TIEMPO'
  const diff = etaGpsMin - restanteProg // + = llega tarde, − = llega antes
  if (diff < -REGLAS.toleranciaChoferMin) return 'ADELANTADO'
  if (diff > REGLAS.toleranciaChoferMin) return 'RETRASADO'
  return 'EN_TIEMPO'
}
