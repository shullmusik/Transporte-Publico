import type { LatLng } from '@/types'

const R = 6371000 // m

/** Distancia Haversine en metros. */
export function distanceM(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

/** Distancia mínima (m) de un punto a una polilínea. Usado para "fuera de ruta". */
export function distanceToPolylineM(p: LatLng, line: LatLng[]): number {
  if (line.length === 0) return Infinity
  if (line.length === 1) return distanceM(p, line[0])
  let best = Infinity
  for (let i = 0; i < line.length - 1; i++) {
    best = Math.min(best, distanceToSegmentM(p, line[i], line[i + 1]))
  }
  return best
}

function distanceToSegmentM(p: LatLng, a: LatLng, b: LatLng): number {
  // Proyección plana local: suficiente para tramos urbanos (< 5 km)
  const kx = Math.cos((a.lat * Math.PI) / 180) * 111320
  const ky = 110540
  const bx = (b.lng - a.lng) * kx
  const by = (b.lat - a.lat) * ky
  const px = (p.lng - a.lng) * kx
  const py = (p.lat - a.lat) * ky
  const len2 = bx * bx + by * by
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / len2))
  return Math.hypot(px - t * bx, py - t * by)
}

/** Enlace universal que abre en Google Maps / Apple Maps / Waze desde WhatsApp. */
export const mapsLink = (p: LatLng) =>
  `https://www.google.com/maps?q=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`

export const fmtCoords = (p: LatLng) => `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`
