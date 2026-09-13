# RutaSegura · Checador Digital

PWA para la operación de una flota de hasta 100 ECOs en esquema de **despacho base-a-base**
(Bodegas ↔ Tlalnepantla y rutas trianguladas). Control de frecuencia, monitoreo GPS, respuesta a emergencias y bitácora analítica.

```bash
npm install
npm run dev        # http://localhost:5173  (backend simulado, sin configurar nada)
npm run build      # PWA instalable en dist/
```

Rutas de la app: `/` checador · `/ficha/:ecoId` ficha policial · `/chofer` app del chofer.

## Modelo operativo

```
EN_BASE (fila FIFO) ──despacho──► EN_RUTA ──check-in en nodo de llegada──► EN_BASE
```

* **Ruta** = origen → destino con `tiempoEstimadoMin` y `frecuenciaObjetivoMin`.
  Si el destino **no es base** (Villa Jardín, Fábricas…) el despacho es **ida y vuelta** y la unidad regresa a la misma base.
  Si el destino es base (Bodegas ↔ Tlalnepantla) la unidad hace check-in en la otra base y se forma ahí.
* **Sentido** (IDA / REGRESO) se deriva del tiempo transcurrido en viajes redondos; aparece en la ficha policial.
* **Semáforo de flota** ([anomaly.ts](src/lib/anomaly.ts)), en orden de prioridad:
  `EMERGENCIA_PANICO` > `DESVIO` (>900 m del corredor) > `SIN_SENAL` (>4 min sin GPS) > `RETRASO_SOSPECHOSO` (>10 min sobre la llegada estimada) > `EN_TRAYECTO_OK` / `EN_BASE`.
* **Frecuencia regulada** ([dispatch.ts](src/lib/dispatch.ts)): la siguiente salida se autoriza `intervalo` minutos después de la última salida real de esa ruta. El checador elige 3/4/5/10 min o usa la frecuencia objetivo; puede forzar la salida y queda registrado en `intervaloRealMin`.

## Arquitectura

```
UI (React + Tailwind)  ──►  store/useFleetStore (Zustand)  ──►  services/backend.ts (contrato FleetBackend)
                                     ▲                                 ├── mock/simulator.ts    (100 ECOs simuladas)
                    LiveUnit derivadas (semáforo, ETA, sentido)        └── services/supabase.ts (postgres_changes)
```

`VITE_BACKEND=mock|supabase` decide el adaptador. Los pings GPS crudos **no** viajan por Realtime: un trigger materializa
`posiciones_actuales` (última posición por ECO), que es lo único que el monitor consume.

## Estructura

```
src/
├── types/index.ts              Nodo, Unidad, Chofer, Ruta, Despacho, AlertaSeguridad, GpsPing, LiveUnit
├── lib/
│   ├── dispatch.ts             fila FIFO, próxima salida, rango de ECOs, semáforo del chofer, REGLAS
│   ├── anomaly.ts              clasificación de seguridad, sentido, ETA por GPS, orden por riesgo
│   ├── schedule.ts             franjas horarias, frecuencia vigente, programación inicial
│   ├── marks.ts                marcas en puntos: siguiente paso, hora programada, intervalo en punto, tramos
│   ├── ficha.ts                ficha de emergencia → texto WhatsApp / SMS
│   ├── analytics.ts            salidas por hora, resumen por ruta (carreos / huecos / duración)
│   └── geo.ts · time.ts
├── services/
│   ├── backend.ts              contrato FleetBackend + FleetEvent
│   ├── supabase.ts             adaptador Supabase
│   └── geolocation.ts          tracker GPS del chofer (15 s normal / 3 s en pánico, cola offline)
├── mock/                       seed.ts (catálogo de rutas + 100 ECOs + escenarios) · simulator.ts
├── store/useFleetStore.ts      estado global + selectores LiveUnit
├── components/
│   ├── despacho/               BaseHeader (puesto + lugar), DepartureTimer, DispatchBoard, ArrivalsPanel
│   ├── checkpoint/             PassPanel (intermedio / llegada)
│   ├── monitor/                FleetMonitor, UnitRow, FleetMap
│   ├── bitacora/               DispatchLog, NeedPanel
│   ├── emergencia/             PanicBanner, FichaPolicial, ActionChannels
│   └── ui/                     StatusBadge, Clock
└── pages/                      ChecadorPage, FichaPage, ChoferPage
supabase/schema.sql             tablas (incl. puntos_control, ruta_puntos, marcas_tiempo, franjas_horarias), triggers, RLS, vistas
```

## Puestos de checador y captura de tiempos

La misma app sirve para los tres puestos; el checador elige el suyo arriba (o por URL: `?puesto=INTERMEDIO&lugar=P-RC`).

| Puesto | Dónde | Qué captura |
|---|---|---|
| **Salida** | Base (Bodegas / Tlalnepantla) | Despacho en 2 toques, ocupación con la que sale y gente que se queda; check-in de regreso |
| **Intermedio** | Punto de control en calle (compartido entre rutas) | Hora exacta de paso + ocupación; intervalo real vs. la unidad anterior de esa ruta por ese punto (carreos en ruta) |
| **Llegada** | Destino de ruta | Hora de arribo + ocupación + gente esperando; en base-a-base completa el despacho |

Cada ruta tiene 4 puntos (SALIDA · INTERMEDIO ×2 · LLEGADA) con la fracción del tiempo en que se espera el paso, así cada marca se compara contra su hora programada ([marks.ts](src/lib/marks.ts)).

## Programación por franjas y necesidad

* Cada ruta tiene **franjas horarias** con su frecuencia ([schedule.ts](src/lib/schedule.ts)); el temporizador de Salida usa la frecuencia vigente y muestra la franja.
* La pestaña **Datos** ([NeedPanel](src/components/bitacora/NeedPanel.tsx)) agrupa por franja: salidas, intervalo real, ocupación observada (0 vacía · 2 llena), gente esperando y recorrido real, y emite un veredicto: **Aumentar / Mantener / Reducir** con la frecuencia sugerida. La sugerencia parte del intervalo *real* con el que se observó la ocupación (no del programado), y exige mínimo 3 salidas.
* El administrador ajusta cada franja con +/− o aplica las sugerencias y guarda; el cambio llega en tiempo real a los checadores de salida.
* **Tiempo por tramo**: real vs. programado entre puntos consecutivos, para ver dónde se pierde el intervalo.

## App del Checador (`/`)

| Pestaña | Qué hace |
|---|---|
| **Mi puesto** | Salida / Intermedio / Llegada (ver arriba) |
| **Monitor** | Buscador por ECO / placas / chofer · filtros alerta / en ruta / en base · mapa Leaflet con 100 unidades · lista ordenada por riesgo · check-in manual y alta/baja a taller |
| **Datos** | Necesidad por franja, sugerencia y editor de programación · tiempo por tramo |
| **Bitácora** | Salidas por hora (horas pico) · resumen por ruta (intervalo real vs objetivo, carreos, huecos, duración real) · últimos despachos |

Banner fijo de pánico/desvío en cualquier pestaña → ficha policial en 1 clic.

## Ficha policial (`/ficha/:ecoId`)
Ubicación en vivo → vehículo (ECO, placas, marca, color) → **ruta y sentido** (salida, llegada programada, último punto validado) → chofer (foto, teléfono).
Canales: 911, Central C4 (`VITE_C4_PHONE`), WhatsApp (Web Share API con fallback `wa.me`), SMS, copiar, imprimir a PDF.
Cada canal usado se registra como alerta `REPORTE_POLICIAL` con la ficha serializada.

## App del Chofer (`/chofer`)
Semáforo de intervalo (EN TIEMPO / RETRASADO / ADELANTADO comparando ETA por GPS vs llegada programada), salida/llegada/restante,
GPS del dispositivo (opcional en demo) y botón de pánico silencioso por presión de 3 s.

## Escenarios del simulador
| ECO | Escenario |
|---|---|
| 1–22 | formadas en Bodegas · 23–34 formadas en Tlalnepantla · 35–40 en taller |
| 41–100 | en ruta, repartidas por la matriz |
| **14** | pánico activo (Bodegas → Villa Jardín) |
| **08** | desvío 1.5 km del corredor (Bodegas → Fábricas) |
| **27** | detenida, 14 min sobre el estimado → retraso sospechoso |
| **33** | sin señal GPS desde hace 7 min |
| 41, 42, 43 | llegando a base (para probar check-in) |

## Supabase
1. Ejecutar `supabase/schema.sql` (requiere PostGIS). Programar `fn_detectar_retrasos()` con pg_cron cada minuto.
2. `.env.local`: `VITE_BACKEND=supabase`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
3. Sembrar `nodos`, `rutas`, `unidades`, `choferes`, `perfiles`.
