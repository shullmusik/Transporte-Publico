import type { GpsPing } from '@/types'

/**
 * Envío periódico de posición para el Módulo Chofer.
 * - `watchPosition` con alta precisión; se re-emite como máximo cada `intervalMs`.
 * - En pánico el intervalo baja a 3 s (más puntos para la policía) y se ignora el filtro de distancia.
 * - Si el navegador niega el permiso, `onError` deja que la UI muestre el aviso al operador.
 */
export interface GpsTrackerOptions {
  ecoId: string
  intervalMs?: number        // normal: 15 s
  panicIntervalMs?: number   // pánico: 3 s
  minDistanceM?: number      // no reenviar si se movió menos de esto (ahorro de datos)
  send: (ping: GpsPing) => Promise<void>
  onError?: (e: GeolocationPositionError) => void
}

export function startGpsTracker(opts: GpsTrackerOptions) {
  const { ecoId, intervalMs = 15000, panicIntervalMs = 3000, minDistanceM = 10, send, onError } = opts
  let panic = false
  let lastSentAt = 0
  let lastPos: GeolocationPosition | undefined
  let queue: GpsPing[] = []      // cola offline: se vacía al recuperar red

  const flush = async () => {
    while (queue.length && navigator.onLine) {
      const p = queue[0]
      try {
        await send(p)
        queue.shift()
      } catch {
        break
      }
    }
  }
  window.addEventListener('online', flush)

  const onPos = (pos: GeolocationPosition) => {
    const now = Date.now()
    const interval = panic ? panicIntervalMs : intervalMs
    const moved = lastPos ? distance(lastPos.coords, pos.coords) : Infinity
    if (now - lastSentAt < interval) return
    if (!panic && moved < minDistanceM && lastSentAt !== 0) return
    lastSentAt = now
    lastPos = pos
    queue.push({
      ecoId,
      at: new Date(pos.timestamp).toISOString(),
      location: { lat: pos.coords.latitude, lng: pos.coords.longitude },
      speedKmh: Math.round((pos.coords.speed ?? 0) * 3.6),
      heading: pos.coords.heading ?? undefined,
      accuracyM: pos.coords.accuracy,
    })
    void flush()
  }

  const watchId = navigator.geolocation.watchPosition(onPos, onError, {
    enableHighAccuracy: true,
    maximumAge: 2000,
    timeout: 10000,
  })

  return {
    setPanic(active: boolean) {
      panic = active
      lastSentAt = 0 // fuerza envío inmediato con la nueva cadencia
    },
    stop() {
      navigator.geolocation.clearWatch(watchId)
      window.removeEventListener('online', flush)
    },
  }
}

function distance(a: GeolocationCoordinates, b: GeolocationCoordinates) {
  const kx = Math.cos((a.latitude * Math.PI) / 180) * 111320
  return Math.hypot((b.longitude - a.longitude) * kx, (b.latitude - a.latitude) * 110540)
}
