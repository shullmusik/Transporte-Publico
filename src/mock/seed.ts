import type { Chofer, Nodo, PasoRuta, PuntoControl, Ruta, Unidad } from '@/types'
import { programacionInicial } from '@/lib/schedule'

/**
 * Catálogo operativo (Propuesta Triángulos) + flota de 100 ECOs generada.
 * Coordenadas aproximadas de la zona Atizapán–Tlalnepantla: ajustar en el catálogo real.
 */

export const CHECADOR_ID = 'chk-bod-01'
export const CHECADOR_NOMBRE = 'Checador · J. Ramírez'

export const NODOS: Nodo[] = [
  { id: 'BOD', nombre: 'Bodegas', corto: 'BOD', esBase: true, ubicacion: { lat: 19.5563, lng: -99.2452 } },
  { id: 'TLA', nombre: 'Tlalnepantla', corto: 'TLA', esBase: true, ubicacion: { lat: 19.5392, lng: -99.1953 } },
  { id: 'VJ', nombre: 'Villa Jardín', corto: 'VJ', esBase: false, ubicacion: { lat: 19.5738, lng: -99.2478 } },
  { id: 'SEP', nombre: '1ro de Septiembre', corto: '1SEP', esBase: false, ubicacion: { lat: 19.5826, lng: -99.2651 } },
  { id: 'FAB', nombre: 'Fábricas', corto: 'FAB', esBase: false, ubicacion: { lat: 19.5612, lng: -99.2312 } },
  { id: 'Z5', nombre: 'Zona 5', corto: 'Z5', esBase: false, ubicacion: { lat: 19.5905, lng: -99.2834 } },
  { id: 'CAL', nombre: 'Calacoaya', corto: 'CAL', esBase: false, ubicacion: { lat: 19.5521, lng: -99.2314 } },
  { id: 'LC', nombre: 'Lázaro Cárdenas', corto: 'LC', esBase: false, ubicacion: { lat: 19.5781, lng: -99.2563 } },
  { id: 'SL', nombre: 'San Lorenzo', corto: 'SL', esBase: false, ubicacion: { lat: 19.5664, lng: -99.2705 } },
]

/**
 * Puntos de control intermedios (físicos, compartidos entre rutas). Coordenadas aproximadas.
 * Los nodos también son puntos de control (mismo id) para SALIDA / LLEGADA.
 */
export const PUNTOS_INTERMEDIOS: PuntoControl[] = [
  { id: 'P-RC', nombre: 'Av. Ruiz Cortines', ubicacion: { lat: 19.5625, lng: -99.247 } },
  { id: 'P-LOM', nombre: 'Lomas de Atizapán', ubicacion: { lat: 19.569, lng: -99.2478 } },
  { id: 'P-ALM', nombre: 'Blvd. López Mateos', ubicacion: { lat: 19.5725, lng: -99.259 } },
  { id: 'P-SM', nombre: 'Glorieta San Mateo', ubicacion: { lat: 19.551, lng: -99.228 } },
  { id: 'P-VD', nombre: 'Valle Dorado', ubicacion: { lat: 19.545, lng: -99.212 } },
  { id: 'P-ZI', nombre: 'Zona Industrial', ubicacion: { lat: 19.5588, lng: -99.238 } },
  { id: 'P-CC', nombre: 'Calacoaya centro', ubicacion: { lat: 19.548, lng: -99.22 } },
]

export const PUNTOS: PuntoControl[] = [
  ...NODOS.map((n) => ({ id: n.id, nombre: n.nombre, ubicacion: n.ubicacion })),
  ...PUNTOS_INTERMEDIOS,
]

/** Dos intermedios por ruta, en orden de paso. */
const INTERMEDIOS: Record<string, [string, string]> = {
  'BOD-VJ': ['P-RC', 'P-LOM'],
  'BOD-SEP': ['P-RC', 'P-ALM'],
  'BOD-FAB': ['P-ZI', 'P-SM'],
  'BOD-Z5': ['P-RC', 'P-ALM'],
  'BOD-CAL': ['P-SM', 'P-CC'],
  'BOD-TLA': ['P-SM', 'P-VD'],
  'BOD-LC': ['P-RC', 'P-LOM'],
  'BOD-SL': ['P-RC', 'P-ALM'],
  'TLA-BOD': ['P-VD', 'P-SM'],
  'TLA-CAL': ['P-VD', 'P-CC'],
  'CAL-TLA': ['P-CC', 'P-VD'],
}

const nombreDe = (id: string) => NODOS.find((n) => n.id === id)!.nombre
const ruta = (origen: string, destino: string, tiempo: number, frecuencia: number, rango?: [number, number]): Ruta => {
  const id = `${origen}-${destino}`
  const [i1, i2] = INTERMEDIOS[id]
  // Si el viaje es redondo, la llegada al destino ocurre a la mitad del tiempo total
  const fLlegada = NODOS.find((n) => n.id === destino)!.esBase ? 1 : 0.5
  const puntos: PasoRuta[] = [
    { puntoId: origen, tipo: 'SALIDA', fraccion: 0 },
    { puntoId: i1, tipo: 'INTERMEDIO', fraccion: fLlegada / 3 },
    { puntoId: i2, tipo: 'INTERMEDIO', fraccion: (fLlegada * 2) / 3 },
    { puntoId: destino, tipo: 'LLEGADA', fraccion: fLlegada },
  ]
  return {
    id,
    nombre: `${nombreDe(origen)} → ${nombreDe(destino)}`,
    nodoOrigenId: origen,
    nodoDestinoId: destino,
    tiempoEstimadoMin: tiempo,
    frecuenciaObjetivoMin: frecuencia,
    ecoRango: rango,
    puntos,
    programacion: programacionInicial(frecuencia),
  }
}

/** Matriz operativa. Destinos que no son base = viaje redondo (regresa a la misma base). */
export const RUTAS: Ruta[] = [
  // Desde BODEGAS
  ruta('BOD', 'VJ', 40, 5, [1, 24]),
  ruta('BOD', 'SEP', 40, 5, [1, 24]),
  ruta('BOD', 'FAB', 18, 4, [1, 10]),
  ruta('BOD', 'Z5', 45, 10, [11, 16]),
  ruta('BOD', 'CAL', 40, 12, [1, 40]),
  ruta('BOD', 'TLA', 48, 4, [1, 40]),
  ruta('BOD', 'LC', 40, 36, [1, 6]),
  ruta('BOD', 'SL', 40, 12, [7, 20]),
  // Desde TLALNEPANTLA e intermedias (triangulaciones)
  ruta('TLA', 'BOD', 48, 4, [1, 40]),
  ruta('TLA', 'CAL', 35, 10, [1, 40]),
  ruta('CAL', 'TLA', 35, 10, [1, 40]),
]

// ---------- Flota (100 ECOs) ----------
const MARCAS = [
  ['Nissan', 'Urvan 2019'],
  ['Toyota', 'Hiace 2021'],
  ['Mercedes-Benz', 'Sprinter 2018'],
  ['Ford', 'Transit 2020'],
  ['Nissan', 'Urvan 2017'],
]
const COLORES = ['Blanca con franja verde', 'Blanca con franja verde', 'Blanca, cofre gris', 'Blanca con franja azul']
const NOMBRES = ['Miguel Ángel', 'Rosa María', 'Juan Carlos', 'Luis Fernando', 'Ana Patricia', 'Ricardo', 'José Luis', 'Guadalupe', 'Francisco', 'Alejandro', 'Verónica', 'Jorge', 'Martha', 'Raúl', 'Sergio', 'Claudia', 'Arturo', 'Leticia', 'Enrique', 'Daniel']
const APELLIDOS = ['Torres', 'Delgado', 'Mendoza', 'Ochoa', 'Salas', 'Núñez', 'Ramírez', 'Hernández', 'García', 'López', 'Martínez', 'Sánchez', 'Pérez', 'Flores', 'Cruz', 'Morales', 'Reyes', 'Jiménez', 'Castillo', 'Vargas']

const avatar = (seed: string) => `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(seed)}&backgroundColor=1e293b&textColor=ffffff`

// PRNG determinista para que la demo sea reproducible
let s = 42
const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296)
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)]

export const CHOFERES: Chofer[] = Array.from({ length: 100 }, (_, i) => {
  const nombre = `${pick(NOMBRES)} ${pick(APELLIDOS)} ${pick(APELLIDOS)}`
  return {
    id: `ch-${i + 1}`,
    nombre,
    telefono: `+52 55 ${String(1000 + Math.floor(rnd() * 9000))} ${String(1000 + Math.floor(rnd() * 9000))}`,
    licencia: `LIC-MEX-${String(100000 + Math.floor(rnd() * 900000))}`,
    fotoUrl: avatar(nombre.split(' ').map((p) => p[0]).slice(0, 2).join('')),
  }
})

export const UNIDADES: Unidad[] = Array.from({ length: 100 }, (_, i) => {
  const [marca, modelo] = pick(MARCAS)
  const letras = String.fromCharCode(65 + Math.floor(rnd() * 26)) + String.fromCharCode(65 + Math.floor(rnd() * 26))
  return {
    id: `eco-${i + 1}`,
    numeroEco: i + 1,
    placas: `M${letras}-${String(100 + Math.floor(rnd() * 900))}-${String.fromCharCode(65 + Math.floor(rnd() * 26))}`,
    marca,
    modelo,
    color: pick(COLORES),
    estadoActual: 'EN_BASE',
    nodoActualId: 'BOD',
    choferId: `ch-${i + 1}`,
  }
})

/**
 * Escenario inicial del simulador (se aplica sobre UNIDADES):
 *  - base: dónde está formada (EN_BASE)
 *  - ruta + transcurrido: despacho activo con N minutos transcurridos
 *  - panico / sinSenal / desvio: anomalías forzadas para la demo
 */
export interface Escenario {
  base?: 'BOD' | 'TLA'
  taller?: boolean
  rutaId?: string
  transcurridoMin?: number
  panico?: boolean
  sinSenalMin?: number
  desvioM?: number
  detenida?: boolean
}

export const ESCENARIOS: Record<number, Escenario> = {}
for (let eco = 1; eco <= 100; eco++) {
  if (eco <= 22) ESCENARIOS[eco] = { base: 'BOD' }
  else if (eco <= 34) ESCENARIOS[eco] = { base: 'TLA' }
  else if (eco <= 40) ESCENARIOS[eco] = { taller: true }
  else {
    // en ruta, repartidos por la matriz
    const r = RUTAS[(eco * 7) % RUTAS.length]
    ESCENARIOS[eco] = { rutaId: r.id, transcurridoMin: Math.round(rnd() * (r.tiempoEstimadoMin - 4)) + 2 }
  }
}
// Anomalías visibles en la demo
ESCENARIOS[14] = { rutaId: 'BOD-VJ', transcurridoMin: 17, panico: true }            // 🔴 pánico
ESCENARIOS[27] = { rutaId: 'BOD-CAL', transcurridoMin: 54, detenida: true }         // 🟡 retraso (+14 sobre 40)
ESCENARIOS[33] = { rutaId: 'TLA-BOD', transcurridoMin: 21, sinSenalMin: 7 }         // 🟡 sin señal
ESCENARIOS[8] = { rutaId: 'BOD-FAB', transcurridoMin: 9, desvioM: 1500 }            // 🔴 desvío
ESCENARIOS[41] = { rutaId: 'BOD-SEP', transcurridoMin: 39 }                          // llegando a Bodegas
ESCENARIOS[42] = { rutaId: 'BOD-TLA', transcurridoMin: 46 }                          // llegando a Tlalnepantla
ESCENARIOS[43] = { rutaId: 'TLA-BOD', transcurridoMin: 47 }                          // llegando a Bodegas
