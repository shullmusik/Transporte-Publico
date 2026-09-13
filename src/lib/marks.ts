import type { Despacho, MarcaTiempo, Ocupacion, PasoRuta, Ruta } from '@/types'

/**
 * Marcas de tiempo en puntos de control: qué punto sigue, a qué hora se espera,
 * y el intervalo real entre unidades en cada punto (para detectar carreos en ruta).
 */

export const OCUPACION_VALOR: Record<Ocupacion, number> = { VACIA: 0, MEDIA: 1, LLENA: 2 }
export const OCUPACION_META: Record<Ocupacion, { label: string; icono: string; tone: string }> = {
  VACIA: { label: 'Vacía', icono: '○', tone: 'bg-slate-700' },
  MEDIA: { label: 'Media', icono: '◐', tone: 'bg-sky-600' },
  LLENA: { label: 'Llena', icono: '●', tone: 'bg-danger' },
}

export const marcasDe = (marcas: MarcaTiempo[], despachoId: string) =>
  marcas.filter((m) => m.despachoId === despachoId).sort((a, b) => a.hora.localeCompare(b.hora))

export const ultimaMarcaDe = (marcas: MarcaTiempo[], despachoId: string) => marcasDe(marcas, despachoId).at(-1)

/** Hora programada de paso por un punto. */
export const horaProgramada = (despacho: Despacho, ruta: Ruta, paso: PasoRuta) =>
  new Date(new Date(despacho.horaSalidaReal).getTime() + paso.fraccion * ruta.tiempoEstimadoMin * 60000).toISOString()

/** Primer paso de la ruta que aún no tiene marca. */
export function siguientePaso(despacho: Despacho, ruta: Ruta, marcas: MarcaTiempo[]): PasoRuta | undefined {
  const hechos = new Set(marcasDe(marcas, despacho.id).map((m) => m.puntoId))
  return ruta.puntos.find((p) => !hechos.has(p.puntoId))
}

/** ¿Este despacho pasa por el punto y todavía no fue marcado ahí? */
export function pendienteEnPunto(despacho: Despacho, ruta: Ruta, puntoId: string, marcas: MarcaTiempo[]): PasoRuta | undefined {
  const paso = ruta.puntos.find((p) => p.puntoId === puntoId)
  if (!paso || despacho.estadoDespacho === 'COMPLETADO') return undefined
  const yaMarcado = marcas.some((m) => m.despachoId === despacho.id && m.puntoId === puntoId)
  return yaMarcado ? undefined : paso
}

/** Última marca en un punto para una ruta (para calcular el intervalo real en ese punto). */
export function ultimaMarcaEnPunto(marcas: MarcaTiempo[], despachos: Despacho[], rutaId: string, puntoId: string): MarcaTiempo | undefined {
  const idsRuta = new Set(despachos.filter((d) => d.rutaId === rutaId).map((d) => d.id))
  let best: MarcaTiempo | undefined
  for (const m of marcas) {
    if (m.puntoId !== puntoId || !idsRuta.has(m.despachoId)) continue
    if (!best || m.hora > best.hora) best = m
  }
  return best
}

/** Duración real de cada tramo (entre marcas consecutivas) de un despacho, en minutos. */
export function tramosDe(despacho: Despacho, ruta: Ruta, marcas: MarcaTiempo[]): { de: string; a: string; realMin?: number; programadoMin: number }[] {
  const ms = marcasDe(marcas, despacho.id)
  const out = []
  for (let i = 1; i < ruta.puntos.length; i++) {
    const a = ruta.puntos[i - 1]
    const b = ruta.puntos[i]
    const ma = ms.find((m) => m.puntoId === a.puntoId)
    const mb = ms.find((m) => m.puntoId === b.puntoId)
    out.push({
      de: a.puntoId,
      a: b.puntoId,
      realMin: ma && mb ? (new Date(mb.hora).getTime() - new Date(ma.hora).getTime()) / 60000 : undefined,
      programadoMin: (b.fraccion - a.fraccion) * ruta.tiempoEstimadoMin,
    })
  }
  return out
}
