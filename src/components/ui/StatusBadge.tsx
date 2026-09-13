import type { EstadoFlota } from '@/types'
import { ESTADO_META } from '@/lib/anomaly'

const TONE: Record<'ok' | 'warn' | 'danger' | 'muted', string> = {
  ok: 'bg-ok text-white',
  warn: 'bg-warn text-slate-950',
  danger: 'bg-danger text-white',
  muted: 'bg-slate-700 text-white',
}

export function StatusBadge({ estado, size = 'md' }: { estado: EstadoFlota; size?: 'sm' | 'md' | 'lg' }) {
  const meta = ESTADO_META[estado]
  const sz = size === 'lg' ? 'text-lg px-4 py-2' : size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1'
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-extrabold tracking-wide ${TONE[meta.tone]} ${sz} ${estado === 'EMERGENCIA_PANICO' ? 'pulse-danger' : ''}`}>
      <span aria-hidden>{meta.tone === 'ok' ? '●' : estado === 'EMERGENCIA_PANICO' ? '🚨' : meta.tone === 'muted' ? '🔧' : '▲'}</span>
      {size === 'sm' ? meta.corto : meta.label}
    </span>
  )
}

/** Barra lateral de color para listas: se ve incluso con el teléfono al sol. */
export const toneBorder: Record<EstadoFlota, string> = {
  EN_BASE: 'border-l-ok',
  EN_TRAYECTO_OK: 'border-l-ok',
  RETRASO_SOSPECHOSO: 'border-l-warn',
  SIN_SENAL: 'border-l-warn',
  DESVIO: 'border-l-danger',
  EMERGENCIA_PANICO: 'border-l-danger',
  MANTENIMIENTO: 'border-l-slate-600',
}

export const ecoLabel = (n: number) => `ECO ${String(n).padStart(2, '0')}`
