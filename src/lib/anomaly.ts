import type { Despacho, EstadoFlota, GpsPing, LiveUnit, Nodo, Ruta, Sentido, Unidad } from '@/types'
import { distanceM, distanceToPolylineM } from './geo'
import { REGLAS, esViajeRedondo, minutosDesde, minutosHasta } from './dispatch'

/**
 * Clasificación de seguridad de una unidad. El orden importa:
 * pánico > desvío > sin señal > retraso > ok.
 */
export function clasificar(
  unidad: Unidad,
  despacho: Despacho | undefined,
  ruta: Ruta | undefined,
  nodos: Nodo[],
  lastPing: GpsPing | undefined,
  now = Date.now(),
): EstadoFlota {
  if (unidad.estadoActual === 'MANTENIMIENTO') return 'MANTENIMIENTO'
  if (unidad.estadoActual === 'EN_BASE' || !despacho || !ruta) return 'EN_BASE'
  if (despacho.panicoActivo) return 'EMERGENCIA_PANICO'
  if (!lastPing || minutosDesde(lastPing.at, now) > REGLAS.sinSenalMin) return 'SIN_SENAL'
  if (distanciaAlCorredorM(lastPing, ruta, nodos) > REGLAS.desvioM) return 'DESVIO'
  if (minutosHasta(despacho.horaLlegadaEstimada, now) < -REGLAS.toleranciaRetrasoMin) return 'RETRASO_SOSPECHOSO'
  return 'EN_TRAYECTO_OK'
}

/** Distancia al corredor de la ruta: polilínea real si existe, si no la recta origen–destino. */
export function distanciaAlCorredorM(ping: GpsPing, ruta: Ruta, nodos: Nodo[]): number {
  const o = nodos.find((n) => n.id === ruta.nodoOrigenId)?.ubicacion
  const d = nodos.find((n) => n.id === ruta.nodoDestinoId)?.ubicacion
  const linea = ruta.polilinea?.length ? ruta.polilinea : o && d ? [o, d] : []
  return distanceToPolylineM(ping.location, linea)
}

/** IDA mientras se dirige al destino; REGRESO en la segunda mitad de un viaje redondo. */
export function sentidoActual(despacho: Despacho, ruta: Ruta, nodos: Nodo[], now = Date.now()): Sentido {
  if (!esViajeRedondo(ruta, nodos)) return 'IDA'
  return minutosDesde(despacho.horaSalidaReal, now) < ruta.tiempoEstimadoMin / 2 ? 'IDA' : 'REGRESO'
}

/** ETA por GPS al nodo de llegada (min). Para viaje redondo en IDA suma el tramo de vuelta. */
export function etaGps(
  ping: GpsPing | undefined,
  despacho: Despacho,
  ruta: Ruta,
  nodos: Nodo[],
  sentido: Sentido,
): number | undefined {
  if (!ping) return undefined
  const llegada = nodos.find((n) => n.id === despacho.nodoLlegadaId)?.ubicacion
  const destino = nodos.find((n) => n.id === ruta.nodoDestinoId)?.ubicacion
  if (!llegada || !destino) return undefined
  const v = Math.min(Math.max(ping.speedKmh, 8), REGLAS.velocidadRefKmh) // acotada para evitar ETAs absurdas en semáforos
  const redondo = esViajeRedondo(ruta, nodos)
  const metros =
    redondo && sentido === 'IDA'
      ? distanceM(ping.location, destino) + distanceM(destino, llegada)
      : distanceM(ping.location, llegada)
  return (metros / 1000 / v) * 60
}

export const ORDEN_RIESGO: Record<EstadoFlota, number> = {
  EMERGENCIA_PANICO: 0,
  DESVIO: 1,
  SIN_SENAL: 2,
  RETRASO_SOSPECHOSO: 3,
  EN_TRAYECTO_OK: 4,
  EN_BASE: 5,
  MANTENIMIENTO: 6,
}

export const ordenarPorRiesgo = (units: LiveUnit[]) =>
  [...units].sort((a, b) => ORDEN_RIESGO[a.estado] - ORDEN_RIESGO[b.estado] || a.unidad.numeroEco - b.unidad.numeroEco)

export const ESTADO_META: Record<EstadoFlota, { label: string; corto: string; tone: 'ok' | 'warn' | 'danger' | 'muted' }> = {
  EN_BASE: { label: 'En base', corto: 'BASE', tone: 'ok' },
  EN_TRAYECTO_OK: { label: 'En trayecto · a tiempo', corto: 'OK', tone: 'ok' },
  RETRASO_SOSPECHOSO: { label: 'Retraso sospechoso', corto: 'RETRASO', tone: 'warn' },
  SIN_SENAL: { label: 'Sin señal GPS', corto: 'SIN GPS', tone: 'warn' },
  DESVIO: { label: 'Desvío de ruta', corto: 'DESVÍO', tone: 'danger' },
  EMERGENCIA_PANICO: { label: 'EMERGENCIA · PÁNICO', corto: 'PÁNICO', tone: 'danger' },
  MANTENIMIENTO: { label: 'Mantenimiento', corto: 'TALLER', tone: 'muted' },
}

export const esAlerta = (e: EstadoFlota) => ORDEN_RIESGO[e] <= ORDEN_RIESGO.RETRASO_SOSPECHOSO
