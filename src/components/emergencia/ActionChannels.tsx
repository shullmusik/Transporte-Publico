import { useState } from 'react'
import type { FichaEmergencia } from '@/lib/ficha'
import { fichaToWhatsApp, whatsappUrl, smsUrl } from '@/lib/ficha'

/** Números configurables por ciudad/empresa (en producción vienen de la tabla `routes` o config remota). */
export const EMERGENCY_CONTACTS = {
  emergencias: '911',
  c4: import.meta.env.VITE_C4_PHONE ?? '',           // ej. "+523333333333"
  grupoWhatsapp: import.meta.env.VITE_WA_GROUP ?? '', // teléfono del mando o vacío para elegir chat
}

interface Props {
  ficha: FichaEmergencia
  onReported?: (channel: 'llamada' | 'whatsapp' | 'sms' | 'copiado') => void
}

export function ActionChannels({ ficha, onReported }: Props) {
  const [copied, setCopied] = useState(false)
  const text = fichaToWhatsApp(ficha)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      onReported?.('copiado')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard bloqueado: el usuario puede seleccionar el texto del <details> */
    }
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: `Emergencia ${ficha.vehiculo.eco}`, text })
        onReported?.('whatsapp')
        return
      } catch {
        /* cancelado */
      }
    }
    window.open(whatsappUrl(text, EMERGENCY_CONTACTS.grupoWhatsapp), '_blank')
    onReported?.('whatsapp')
  }

  return (
    <div className="space-y-2">
      <a href={`tel:${EMERGENCY_CONTACTS.emergencias}`} className="btn-danger w-full min-h-[64px] text-2xl" onClick={() => onReported?.('llamada')}>
        📞 LLAMAR AL 911
      </a>
      {EMERGENCY_CONTACTS.c4 && (
        <a href={`tel:${EMERGENCY_CONTACTS.c4}`} className="btn-ghost w-full text-xl" onClick={() => onReported?.('llamada')}>
          📡 Llamar a Central C4
        </a>
      )}
      <button className="btn w-full min-h-[64px] text-2xl bg-[#25D366] text-slate-950" onClick={share}>
        💬 COMPARTIR FICHA POR WHATSAPP
      </button>
      <div className="grid grid-cols-2 gap-2">
        <a href={smsUrl(text, EMERGENCY_CONTACTS.emergencias)} className="btn-ghost" onClick={() => onReported?.('sms')}>
          ✉️ SMS al 911
        </a>
        <button className="btn-ghost" onClick={copy}>
          {copied ? '✓ Copiado' : '📋 Copiar ficha'}
        </button>
      </div>
      <details className="card text-sm">
        <summary className="cursor-pointer font-bold">Ver texto del mensaje</summary>
        <pre className="mt-2 whitespace-pre-wrap font-mono text-xs text-slate-300 select-all">{text}</pre>
      </details>
    </div>
  )
}
