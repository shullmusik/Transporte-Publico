import type { Ocupacion } from '@/types'
import { OCUPACION_META } from '@/lib/marks'

interface Props {
  value?: Ocupacion
  onChange: (o: Ocupacion | undefined) => void
  esperando?: number
  onChangeEsperando?: (n: number | undefined) => void
  compact?: boolean
  /** Solo la fila de personas esperando (para el punto de llegada). */
  soloEsperando?: boolean
}

const ESPERANDO = [0, 3, 6, 10, 15]

/**
 * Captura de demanda en un toque: ocupación de la unidad y, opcionalmente,
 * cuánta gente se queda esperando. Es el dato que alimenta la programación por franjas.
 */
export function OcupacionPicker({ value, onChange, esperando, onChangeEsperando, compact = false, soloEsperando = false }: Props) {
  return (
    <div className={compact ? 'flex flex-col gap-1' : 'space-y-1.5'}>
      {!soloEsperando && (
      <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label="Ocupación">
        {(Object.keys(OCUPACION_META) as Ocupacion[]).map((o) => {
          const m = OCUPACION_META[o]
          const activo = value === o
          return (
            <button
              key={o}
              role="radio"
              aria-checked={activo}
              onClick={() => onChange(activo ? undefined : o)}
              className={`${compact ? 'min-h-[40px] text-sm' : 'min-h-touch text-base'} rounded-lg font-extrabold border-2 ${
                activo ? `${m.tone} border-white text-white` : 'bg-slate-800 border-slate-600 text-slate-300'
              }`}
            >
              {m.icono} {m.label}
            </button>
          )
        })}
      </div>
      )}
      {onChangeEsperando && (
        <div className="flex items-center gap-1" role="radiogroup" aria-label="Personas esperando">
          <span className="label shrink-0 mr-1">Esperan</span>
          {ESPERANDO.map((n, i) => {
            const activo = esperando === n
            const label = i === ESPERANDO.length - 1 ? `${n}+` : String(n)
            return (
              <button
                key={n}
                role="radio"
                aria-checked={activo}
                onClick={() => onChangeEsperando(activo ? undefined : n)}
                className={`flex-1 min-h-[40px] rounded-lg text-sm font-extrabold border-2 ${activo ? 'bg-white text-slate-950 border-white' : 'bg-slate-800 border-slate-600 text-slate-300'}`}
              >
                {label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
