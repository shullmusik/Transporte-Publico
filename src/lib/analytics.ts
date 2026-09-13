import type { Despacho, FranjaHoraria, MarcaTiempo, Ruta } from '@/types'
import { OCUPACION_VALOR } from './marks'
import { hhmmAMin } from './schedule'

/**
 * Agregados sobre despachos + marcas. Todo se calcula en cliente sobre el día en curso;
 * para históricos se usan las vistas `despachos_por_hora` y `necesidad_por_franja` en SQL.
 */

export interface ResumenRuta {
  ruta: Ruta
  salidas: number
  intervaloPromedioMin?: number
  carreos: number
  huecos: number
  duracionPromedioMin?: number
}

export function resumenPorRuta(despachos: Despacho[], rutas: Ruta[]): ResumenRuta[] {
  return rutas
    .map((ruta) => {
      const ds = despachos.filter((d) => d.rutaId === ruta.id)
      const intervalos = ds.map((d) => d.intervaloRealMin).filter((x): x is number => x !== undefined)
      const duraciones = ds
        .filter((d) => d.horaLlegadaReal)
        .map((d) => (new Date(d.horaLlegadaReal!).getTime() - new Date(d.horaSalidaReal).getTime()) / 60000)
      return {
        ruta,
        salidas: ds.length,
        intervaloPromedioMin: avg(intervalos),
        carreos: intervalos.filter((i) => i < ruta.frecuenciaObjetivoMin * 0.6).length,
        huecos: intervalos.filter((i) => i > ruta.frecuenciaObjetivoMin * 2).length,
        duracionPromedioMin: avg(duraciones),
      }
    })
    .filter((r) => r.salidas > 0)
    .sort((a, b) => b.salidas - a.salidas)
}

export function salidasPorHora(despachos: Despacho[]): number[] {
  const horas = new Array<number>(24).fill(0)
  for (const d of despachos) horas[new Date(d.horaSalidaReal).getHours()]++
  return horas
}

// ---------- Necesidad por franja ----------

export type Veredicto = 'AUMENTAR' | 'MANTENER' | 'REDUCIR' | 'SIN_DATOS'

export interface NecesidadFranja {
  franja: FranjaHoraria
  salidas: number
  /** 0 = todas vacías · 2 = todas llenas. */
  ocupacionProm?: number
  llenas: number
  vacias: number
  esperandoProm?: number
  /** Intervalo real promedio operado en la franja (base de la sugerencia). */
  intervaloRealProm?: number
  /** Minutos reales promedio salida → llegada (marcas) y su valor programado. */
  recorridoRealMin?: number
  recorridoProgramadoMin: number
  veredicto: Veredicto
  frecuenciaSugeridaMin: number
}

/** Umbrales de decisión: se afinan conforme haya historial. */
export const UMBRALES = {
  minSalidas: 3,
  ocupacionAlta: 1.4,   // ≥ → aumentar frecuencia (más unidades)
  ocupacionBaja: 0.6,   // ≤ → reducir frecuencia (menos unidades)
  esperandoAlto: 8,     // personas en punto sin subir
}

/**
 * Para cada franja programada: ocupación observada en las marcas (salida + intermedias + llegada),
 * gente esperando, recorrido real, y sugerencia de frecuencia.
 */
export function necesidadPorFranja(ruta: Ruta, despachos: Despacho[], marcas: MarcaTiempo[]): NecesidadFranja[] {
  const ds = despachos.filter((d) => d.rutaId === ruta.id)
  const fLlegada = ruta.puntos.find((p) => p.tipo === 'LLEGADA')?.fraccion ?? 1
  return ruta.programacion.map((franja) => {
    const ini = hhmmAMin(franja.inicio)
    const fin = hhmmAMin(franja.fin)
    const enFranja = ds.filter((d) => {
      const t = new Date(d.horaSalidaReal)
      const m = t.getHours() * 60 + t.getMinutes()
      return m >= ini && m < fin
    })
    const ids = new Set(enFranja.map((d) => d.id))
    const ms = marcas.filter((m) => ids.has(m.despachoId))
    const ocup = ms.map((m) => m.ocupacion).filter((o): o is NonNullable<typeof o> => Boolean(o)).map((o) => OCUPACION_VALOR[o])
    const esperando = ms.map((m) => m.esperando).filter((x): x is number => x !== undefined)
    const recorridos = enFranja
      .map((d) => {
        const sal = ms.find((m) => m.despachoId === d.id && m.tipo === 'SALIDA')
        const lle = ms.find((m) => m.despachoId === d.id && m.tipo === 'LLEGADA')
        return sal && lle ? (new Date(lle.hora).getTime() - new Date(sal.hora).getTime()) / 60000 : undefined
      })
      .filter((x): x is number => x !== undefined)

    const ocupacionProm = avg(ocup)
    const esperandoProm = avg(esperando)
    const intervaloRealProm = avg(enFranja.map((d) => d.intervaloRealMin).filter((x): x is number => x !== undefined))
    // La sugerencia parte del intervalo REAL con el que se observó la ocupación:
    // "con X min entre unidades iban llenas" → operar a 0.75·X. Así no se recorta dos veces sin datos nuevos.
    const base = intervaloRealProm ?? franja.frecuenciaMin
    let veredicto: Veredicto = 'SIN_DATOS'
    let sugerida = franja.frecuenciaMin
    if (enFranja.length >= UMBRALES.minSalidas && ocupacionProm !== undefined) {
      if (ocupacionProm >= UMBRALES.ocupacionAlta || (esperandoProm ?? 0) >= UMBRALES.esperandoAlto) {
        veredicto = 'AUMENTAR'
        sugerida = Math.max(2, Math.round(base * 0.75))
      } else if (ocupacionProm <= UMBRALES.ocupacionBaja && (esperandoProm ?? 0) < 3) {
        veredicto = 'REDUCIR'
        sugerida = Math.min(60, Math.round(base * 1.5))
      } else {
        veredicto = 'MANTENER'
        sugerida = Math.round(base)
      }
    }
    return {
      franja,
      salidas: enFranja.length,
      ocupacionProm,
      llenas: ocup.filter((o) => o === 2).length,
      vacias: ocup.filter((o) => o === 0).length,
      esperandoProm,
      intervaloRealProm,
      recorridoRealMin: avg(recorridos),
      recorridoProgramadoMin: fLlegada * ruta.tiempoEstimadoMin,
      veredicto,
      frecuenciaSugeridaMin: sugerida,
    }
  })
}

/** Tiempo real promedio por tramo de una ruta (para ver dónde se pierde tiempo). */
export function tramosPromedio(ruta: Ruta, despachos: Despacho[], marcas: MarcaTiempo[]) {
  const ids = new Set(despachos.filter((d) => d.rutaId === ruta.id).map((d) => d.id))
  const porDespacho = new Map<string, Map<string, string>>()
  for (const m of marcas) {
    if (!ids.has(m.despachoId)) continue
    if (!porDespacho.has(m.despachoId)) porDespacho.set(m.despachoId, new Map())
    porDespacho.get(m.despachoId)!.set(m.puntoId, m.hora)
  }
  const out = []
  for (let i = 1; i < ruta.puntos.length; i++) {
    const a = ruta.puntos[i - 1]
    const b = ruta.puntos[i]
    const reales: number[] = []
    for (const mp of porDespacho.values()) {
      const ha = mp.get(a.puntoId)
      const hb = mp.get(b.puntoId)
      if (ha && hb) reales.push((new Date(hb).getTime() - new Date(ha).getTime()) / 60000)
    }
    out.push({ de: a.puntoId, a: b.puntoId, programadoMin: (b.fraccion - a.fraccion) * ruta.tiempoEstimadoMin, realMin: avg(reales), muestras: reales.length })
  }
  return out
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined)
