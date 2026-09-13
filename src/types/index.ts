/**
 * Modelo de dominio de RutaSegura (esquema de despacho base-a-base).
 * Espejo 1:1 de supabase/schema.sql. Nombres en español como en la operación.
 *
 * Ciclo de vida de una unidad:
 *   EN_BASE (fila de espera) → despacho → EN_RUTA → check-in en nodo de llegada → EN_BASE
 */

export interface LatLng {
  lat: number
  lng: number
}

/** Punto de la red: base principal (Bodegas, Tlalnepantla) o destino de ruta. */
export interface Nodo {
  id: string
  nombre: string
  corto: string          // "BOD", "TLA", "VJ"
  esBase: boolean        // true = tiene checador y fila de espera
  ubicacion: LatLng
}

export type EstadoUnidad = 'EN_BASE' | 'EN_RUTA' | 'MANTENIMIENTO'

export interface Unidad {
  id: string
  numeroEco: number
  placas: string
  marca: string
  modelo: string
  color: string
  estadoActual: EstadoUnidad
  /** Base donde está formada (solo si EN_BASE). */
  nodoActualId?: string
  /** Hora en que se formó en la fila (para orden FIFO). */
  enBaseDesde?: string
  choferId?: string
}

export interface Chofer {
  id: string
  nombre: string
  telefono: string
  fotoUrl?: string
  licencia?: string
}

export type Sentido = 'IDA' | 'REGRESO'

export type TipoPunto = 'SALIDA' | 'INTERMEDIO' | 'LLEGADA'

/** Punto físico donde hay (o puede haber) un checador. Los nodos también son puntos (mismo id). */
export interface PuntoControl {
  id: string
  nombre: string
  ubicacion: LatLng
}

/** Paso de una ruta por un punto de control, en orden. */
export interface PasoRuta {
  puntoId: string
  tipo: TipoPunto
  /** Fracción del tiempo estimado total del despacho en la que se espera el paso (0..1). */
  fraccion: number
}

/** Frecuencia programada en una franja horaria (06:00–09:00 cada 5 min). */
export interface FranjaHoraria {
  inicio: string   // HH:MM
  fin: string      // HH:MM (exclusivo)
  frecuenciaMin: number
}

/** Ocupación observada por el checador: la señal de "necesidad". */
export type Ocupacion = 'VACIA' | 'MEDIA' | 'LLENA'

export interface Ruta {
  id: string
  nombre: string                 // "Bodegas → Villa Jardín"
  nodoOrigenId: string
  nodoDestinoId: string
  /** Duración total del despacho. Si el destino NO es base, es el tiempo ida y vuelta. */
  tiempoEstimadoMin: number
  frecuenciaObjetivoMin: number
  /** Rango de ECOs autorizados en esta ruta (matriz operativa). */
  ecoRango?: [number, number]
  /** Puntos de control en orden: SALIDA, INTERMEDIO×2, LLEGADA. */
  puntos: PasoRuta[]
  /** Programación de frecuencia por franja horaria; fuera de franja aplica frecuenciaObjetivoMin. */
  programacion: FranjaHoraria[]
  /** Referencia geométrica para detectar desvíos (opcional; si falta se usa la recta origen–destino). */
  polilinea?: LatLng[]
}

export type EstadoDespacho = 'EN_TRAYECTO' | 'COMPLETADO' | 'ALERTA'

/** Bitácora de salidas: una fila por cada vez que el checador suelta una unidad. */
export interface Despacho {
  id: string
  ecoId: string
  choferId: string
  rutaId: string
  checadorId: string
  horaSalidaProgramada: string
  horaSalidaReal: string
  horaLlegadaEstimada: string
  horaLlegadaReal?: string
  /** Nodo donde la unidad debe hacer check-in (destino si es base; origen si es ida y vuelta). */
  nodoLlegadaId: string
  estadoDespacho: EstadoDespacho
  panicoActivo: boolean
  panicoDesde?: string
  /** Minutos vs. la salida anterior en la misma ruta (analytics de frecuencia real). */
  intervaloRealMin?: number
}

/** Marca de tiempo capturada por un checador en un punto de control. */
export interface MarcaTiempo {
  id: string
  despachoId: string
  puntoId: string
  tipo: TipoPunto
  hora: string
  checadorId: string
  ocupacion?: Ocupacion
  /** Personas esperando en el punto (demanda no atendida). */
  esperando?: number
  /** Minutos vs. la unidad anterior de la misma ruta por este punto. */
  intervaloRealMin?: number
}

export type TipoAlerta = 'PANICO_CHOFER' | 'RETRASO_AUTOMATICO' | 'DESVIO' | 'SIN_SENAL' | 'REPORTE_POLICIAL'

export interface AlertaSeguridad {
  id: string
  despachoId: string
  tipoAlerta: TipoAlerta
  latitud?: number
  longitud?: number
  fechaHora: string
  atendidaFlag: boolean
  creadaPor?: string
  nota?: string          // ficha serializada / canal usado
}

export interface GpsPing {
  ecoId: string
  at: string
  location: LatLng
  speedKmh: number
  heading?: number
  accuracyM?: number
}

/** Semáforo de flota que ve el checador. */
export type EstadoFlota =
  | 'EN_BASE'
  | 'EN_TRAYECTO_OK'
  | 'RETRASO_SOSPECHOSO'
  | 'SIN_SENAL'
  | 'DESVIO'
  | 'EMERGENCIA_PANICO'
  | 'MANTENIMIENTO'

/** Semáforo de intervalo en cabina (chofer). */
export type SemaforoChofer = 'EN_TIEMPO' | 'RETRASADO' | 'ADELANTADO'

/** Vista desnormalizada para la UI. */
export interface LiveUnit {
  unidad: Unidad
  chofer?: Chofer
  despacho?: Despacho
  ruta?: Ruta
  nodoOrigen?: Nodo
  nodoDestino?: Nodo
  nodoLlegada?: Nodo
  lastPing?: GpsPing
  /** Última marca de tiempo validada por un checador. */
  ultimaMarca?: MarcaTiempo
  /** Siguiente punto de control esperado y hora programada de paso. */
  siguientePaso?: PasoRuta
  horaSiguientePaso?: string
  estado: EstadoFlota
  /** Minutos desde la salida real. */
  transcurridoMin?: number
  /** Minutos que faltan según programa (negativo = ya debió llegar). */
  restanteMin?: number
  /** ETA por GPS al nodo de llegada. */
  etaGpsMin?: number
  sentido?: Sentido
  semaforo?: SemaforoChofer
}
