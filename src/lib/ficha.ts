import type { LiveUnit } from '@/types'
import { mapsLink, fmtCoords } from './geo'
import { fmtTime, fmtDateTime } from './time'
import { ESTADO_META } from './anomaly'

/**
 * Ficha de emergencia: un objeto plano que se renderiza en pantalla, se serializa
 * a texto para WhatsApp/SMS y se persiste en `alertas_seguridad.nota`.
 * Policía/C4 recibe SIEMPRE el mismo orden de campos → menos errores al dictar por radio.
 */
export interface FichaEmergencia {
  folio: string
  generadaEn: string
  motivo: string
  ubicacion: { coords?: string; link?: string; ultimaSenal?: string; velocidadKmh?: number }
  vehiculo: { eco: string; placas: string; marca: string; modelo: string; color: string }
  ruta: { nombre: string; sentido: string; salida?: string; llegadaEstimada?: string; ultimoPunto: string; horaUltimoPunto?: string; siguientePunto?: string; minSinReporte: number }
  chofer: { nombre: string; telefono: string; fotoUrl?: string; licencia?: string }
  reportadoPor: string
}

export function buildFicha(u: LiveUnit, reportadoPor: string, nombrePunto: (id: string) => string = (id) => id): FichaEmergencia {
  const now = new Date()
  const eco = String(u.unidad.numeroEco).padStart(2, '0')
  const hhmm = `${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}`
  const sentido = u.sentido === 'REGRESO' ? 'REGRESO' : 'IDA'
  return {
    folio: `RS-${now.toISOString().slice(0, 10).replace(/-/g, '')}-E${eco}-${hhmm}`,
    generadaEn: now.toISOString(),
    motivo: ESTADO_META[u.estado].label,
    ubicacion: u.lastPing
      ? { coords: fmtCoords(u.lastPing.location), link: mapsLink(u.lastPing.location), ultimaSenal: u.lastPing.at, velocidadKmh: u.lastPing.speedKmh }
      : {},
    vehiculo: { eco: `ECO ${eco}`, placas: u.unidad.placas, marca: u.unidad.marca, modelo: u.unidad.modelo, color: u.unidad.color },
    ruta: {
      nombre: u.ruta?.nombre ?? 'Sin despacho activo',
      sentido: u.ruta ? `${sentido} (${sentido === 'IDA' ? `hacia ${u.nodoDestino?.nombre ?? ''}` : `hacia ${u.nodoLlegada?.nombre ?? ''}`})` : 'N/D',
      salida: u.despacho?.horaSalidaReal,
      llegadaEstimada: u.despacho?.horaLlegadaEstimada,
      ultimoPunto: u.ultimaMarca
        ? `${u.ultimaMarca.tipo === 'SALIDA' ? 'Salida de' : u.ultimaMarca.tipo === 'LLEGADA' ? 'Llegada a' : 'Paso por'} ${nombrePunto(u.ultimaMarca.puntoId)}`
        : u.despacho
          ? `Salida de ${u.nodoOrigen?.nombre ?? 'base'}`
          : `En ${u.nodoOrigen?.nombre ?? 'base'}`,
      horaUltimoPunto: u.ultimaMarca?.hora ?? u.despacho?.horaSalidaReal ?? u.unidad.enBaseDesde,
      siguientePunto: u.siguientePaso ? nombrePunto(u.siguientePaso.puntoId) : undefined,
      minSinReporte: Math.round(u.ultimaMarca ? (Date.now() - new Date(u.ultimaMarca.hora).getTime()) / 60000 : u.transcurridoMin ?? 0),
    },
    chofer: {
      nombre: u.chofer?.nombre ?? 'Sin chofer asignado',
      telefono: u.chofer?.telefono ?? '',
      fotoUrl: u.chofer?.fotoUrl,
      licencia: u.chofer?.licencia,
    },
    reportadoPor,
  }
}

/** Texto plano para WhatsApp: sin markdown complejo, emojis como separadores visuales. */
export function fichaToWhatsApp(f: FichaEmergencia): string {
  const lines = [
    `🚨 *EMERGENCIA TRANSPORTE PÚBLICO* 🚨`,
    `Folio: ${f.folio}`,
    `Motivo: *${f.motivo.toUpperCase()}*`,
    `Hora reporte: ${fmtDateTime(f.generadaEn)}`,
    ``,
    `📍 *UBICACIÓN EN VIVO*`,
    f.ubicacion.link ?? `Sin señal GPS`,
    f.ubicacion.coords ? `Coords: ${f.ubicacion.coords}` : ``,
    f.ubicacion.ultimaSenal ? `Última señal: ${fmtTime(f.ubicacion.ultimaSenal)} (${f.ubicacion.velocidadKmh ?? 0} km/h)` : ``,
    ``,
    `🚐 *VEHÍCULO*`,
    `*${f.vehiculo.eco}*  Placas: *${f.vehiculo.placas}*`,
    `${f.vehiculo.marca} ${f.vehiculo.modelo}, ${f.vehiculo.color}`,
    ``,
    `🛣 *RUTA Y SENTIDO*`,
    `${f.ruta.nombre}`,
    `Sentido: ${f.ruta.sentido}`,
    f.ruta.salida ? `Salió: ${fmtTime(f.ruta.salida, false)} · Llegada estimada: ${f.ruta.llegadaEstimada ? fmtTime(f.ruta.llegadaEstimada, false) : 'N/D'}` : ``,
    `Último punto validado: ${f.ruta.ultimoPunto}${f.ruta.horaUltimoPunto ? ` a las ${fmtTime(f.ruta.horaUltimoPunto)}` : ''}`,
    f.ruta.siguientePunto ? `Siguiente punto esperado: ${f.ruta.siguientePunto}` : '',
    `Sin reportar: ${f.ruta.minSinReporte} min`,
    ``,
    `👤 *CHOFER*`,
    `${f.chofer.nombre}`,
    f.chofer.telefono ? `Tel: ${f.chofer.telefono}` : ``,
    f.chofer.licencia ? `Licencia: ${f.chofer.licencia}` : ``,
    ``,
    `Reporta: ${f.reportadoPor} · RutaSegura`,
  ]
  return lines.filter((l, i, arr) => !(l === '' && arr[i - 1] === '')).join('\n')
}

export const whatsappUrl = (text: string, phone?: string) =>
  `https://wa.me/${phone ? phone.replace(/\D/g, '') : ''}?text=${encodeURIComponent(text)}`

export const smsUrl = (text: string, phone = '911') => `sms:${phone}?body=${encodeURIComponent(text)}`
