import type { FranjaHoraria, Ruta } from '@/types'

/**
 * Programación de salidas por franja horaria.
 * La frecuencia vigente alimenta el temporizador del checador de salida;
 * la vista "Datos" la ajusta con base en la ocupación observada.
 */

export const hhmmAMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}
export const minAHhmm = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

export function franjaVigente(ruta: Pick<Ruta, 'programacion'>, now = new Date()): FranjaHoraria | undefined {
  const m = now.getHours() * 60 + now.getMinutes()
  return ruta.programacion.find((f) => m >= hhmmAMin(f.inicio) && m < hhmmAMin(f.fin))
}

/** Frecuencia que aplica ahora: la de la franja o, fuera de programación, la objetivo de la ruta. */
export const frecuenciaVigente = (ruta: Pick<Ruta, 'programacion' | 'frecuenciaObjetivoMin'>, now = new Date()) =>
  franjaVigente(ruta, now)?.frecuenciaMin ?? ruta.frecuenciaObjetivoMin

/** Franja a la que pertenece una hora ISO (para agrupar datos históricos). */
export function franjaDe(ruta: Pick<Ruta, 'programacion'>, iso: string): FranjaHoraria | undefined {
  return franjaVigente(ruta, new Date(iso))
}

export const etiquetaFranja = (f: FranjaHoraria) => `${f.inicio}–${f.fin}`

/**
 * Programación inicial derivada de la matriz: picos (mañana/tarde) con la frecuencia
 * objetivo, valle al doble, noche al triple. Se afina con datos reales.
 */
export function programacionInicial(frecuenciaMin: number): FranjaHoraria[] {
  const f = frecuenciaMin
  return [
    { inicio: '05:00', fin: '06:30', frecuenciaMin: Math.round(f * 1.5) },
    { inicio: '06:30', fin: '09:30', frecuenciaMin: f },
    { inicio: '09:30', fin: '13:00', frecuenciaMin: f * 2 },
    { inicio: '13:00', fin: '16:00', frecuenciaMin: Math.round(f * 1.5) },
    { inicio: '16:00', fin: '20:00', frecuenciaMin: f },
    { inicio: '20:00', fin: '23:00', frecuenciaMin: f * 3 },
  ]
}

/** Ajuste de una franja con validación (1–60 min). */
export function ajustarFranja(programacion: FranjaHoraria[], inicio: string, frecuenciaMin: number): FranjaHoraria[] {
  const fm = Math.max(1, Math.min(60, Math.round(frecuenciaMin)))
  return programacion.map((f) => (f.inicio === inicio ? { ...f, frecuenciaMin: fm } : f))
}
