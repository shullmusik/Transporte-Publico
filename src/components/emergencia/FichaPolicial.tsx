import type { FichaEmergencia } from '@/lib/ficha'
import { fmtTime, fmtDateTime, fmtAgo } from '@/lib/time'

/**
 * Formato de alta visibilidad: blanco sobre negro, campos en el mismo orden
 * que el texto de WhatsApp y que el protocolo de radio (vehículo → ruta → chofer).
 * Pensado para leerse en voz alta o mostrar la pantalla a un oficial. Imprimible (Ctrl+P → PDF).
 */
export function FichaPolicial({ ficha: f }: { ficha: FichaEmergencia }) {
  return (
    <article className="rounded-2xl overflow-hidden border-4 border-danger bg-black text-white print:border-black" aria-label="Ficha de emergencia">
      <header className="bg-danger px-4 py-3">
        <p className="text-xs font-bold tracking-widest uppercase opacity-90">Ficha de emergencia · Transporte público</p>
        <h1 className="text-2xl font-extrabold leading-tight">{f.motivo.toUpperCase()}</h1>
        <p className="font-mono text-sm mt-1">Folio {f.folio} · {fmtDateTime(f.generadaEn)}</p>
      </header>

      <Section title="📍 Ubicación en vivo">
        {f.ubicacion.link ? (
          <>
            <a href={f.ubicacion.link} target="_blank" rel="noreferrer" className="btn-primary w-full text-base">
              Abrir ubicación GPS en mapa
            </a>
            <Row k="Coordenadas" v={f.ubicacion.coords} mono />
            <Row k="Última señal" v={f.ubicacion.ultimaSenal ? `${fmtTime(f.ubicacion.ultimaSenal)} (${fmtAgo(f.ubicacion.ultimaSenal)}) · ${f.ubicacion.velocidadKmh ?? 0} km/h` : undefined} />
          </>
        ) : (
          <p className="text-warn font-bold text-lg">SIN SEÑAL GPS — usar último punto validado</p>
        )}
      </Section>

      <Section title="🚐 Vehículo">
        <div className="grid grid-cols-2 gap-2">
          <Big k="Unidad" v={f.vehiculo.eco} />
          <Big k="Placas" v={f.vehiculo.placas} />
        </div>
        <Row k="Marca / modelo" v={`${f.vehiculo.marca} ${f.vehiculo.modelo}`} />
        <Row k="Color" v={f.vehiculo.color} />
      </Section>

      <Section title="🛣 Ruta y sentido">
        <p className="text-xl font-extrabold leading-tight">{f.ruta.nombre}</p>
        <Row k="Sentido" v={f.ruta.sentido} />
        {f.ruta.salida && <Row k="Salida / llegada prog." v={`${fmtTime(f.ruta.salida, false)} → ${f.ruta.llegadaEstimada ? fmtTime(f.ruta.llegadaEstimada, false) : 'N/D'}`} mono />}
        <Row k="Último punto validado" v={f.ruta.ultimoPunto} />
        <Row k="Hora exacta" v={f.ruta.horaUltimoPunto ? fmtTime(f.ruta.horaUltimoPunto) : 'N/D'} mono />
        <Row k="Siguiente punto esperado" v={f.ruta.siguientePunto} />
        <Row k="Tiempo sin reportar" v={`${f.ruta.minSinReporte} min`} />
      </Section>

      <Section title="👤 Chofer">
        <div className="flex items-center gap-3">
          {f.chofer.fotoUrl ? (
            <img src={f.chofer.fotoUrl} alt={`Foto de ${f.chofer.nombre}`} className="w-20 h-20 rounded-xl bg-slate-800 object-cover shrink-0" />
          ) : (
            <div className="w-20 h-20 rounded-xl bg-slate-800 grid place-items-center text-3xl shrink-0">👤</div>
          )}
          <div className="min-w-0">
            <p className="text-xl font-extrabold leading-tight">{f.chofer.nombre}</p>
            {f.chofer.telefono && (
              <a href={`tel:${f.chofer.telefono.replace(/\s/g, '')}`} className="font-mono text-lg underline">{f.chofer.telefono}</a>
            )}
            {f.chofer.licencia && <p className="text-sm text-slate-300">Lic. {f.chofer.licencia}</p>}
          </div>
        </div>
        <Row k="Reporta" v={f.reportadoPor} />
      </Section>
    </article>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="px-4 py-3 border-b border-slate-800 space-y-2">
      <h2 className="label !text-slate-300">{title}</h2>
      {children}
    </section>
  )
}

function Row({ k, v, mono = false }: { k: string; v?: string; mono?: boolean }) {
  if (!v) return null
  return (
    <p className="flex justify-between gap-3 text-base">
      <span className="text-slate-400 shrink-0">{k}</span>
      <span className={`font-bold text-right ${mono ? 'font-mono' : ''}`}>{v}</span>
    </p>
  )
}

function Big({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-xl bg-white text-black px-3 py-2">
      <p className="text-xs font-bold uppercase tracking-widest text-slate-600">{k}</p>
      <p className="text-2xl font-extrabold font-mono leading-tight">{v}</p>
    </div>
  )
}
