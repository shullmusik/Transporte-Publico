export const nowIso = () => new Date().toISOString()

export const minutesBetween = (aIso: string, bIso: string) =>
  (new Date(bIso).getTime() - new Date(aIso).getTime()) / 60000

export const minutesAgo = (iso: string) => minutesBetween(iso, nowIso())

/** "14:07:32" — el checador necesita segundos para registrar el paso exacto. */
export const fmtTime = (iso: string, withSeconds = true) =>
  new Date(iso).toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
    hour12: false,
  })

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

/** "hace 3 min" / "hace 45 s" */
export const fmtAgo = (iso: string) => {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return `hace ${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `hace ${m} min`
  const h = Math.floor(m / 60)
  return `hace ${h} h ${m % 60} min`
}

/** 4.5 → "4:30" */
export const fmtMin = (min: number) => {
  const sign = min < 0 ? '-' : ''
  const totalSec = Math.round(Math.abs(min) * 60)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${sign}${m}:${s.toString().padStart(2, '0')}`
}
