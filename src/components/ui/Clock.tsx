import { useEffect, useState } from 'react'

/** Reloj grande con segundos: referencia visual del checador para registrar pasos. */
export function Clock({ className = '' }: { className?: string }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <time className={`font-mono tabular-nums font-extrabold ${className}`} dateTime={now.toISOString()}>
      {now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
    </time>
  )
}
