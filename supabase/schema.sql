-- ============================================================
-- RutaSegura · Esquema PostgreSQL (Supabase) · despacho base-a-base
-- Realtime por postgres_changes, RLS por rol, pings GPS append-only
-- con última posición materializada.
-- ============================================================

create extension if not exists postgis;
create extension if not exists pgcrypto;

-- ---------- Enumeraciones ----------
create type rol_app          as enum ('chofer', 'checador', 'admin');
create type estado_unidad    as enum ('EN_BASE', 'EN_RUTA', 'MANTENIMIENTO');
create type estado_despacho  as enum ('EN_TRAYECTO', 'COMPLETADO', 'ALERTA');
create type tipo_alerta      as enum ('PANICO_CHOFER', 'RETRASO_AUTOMATICO', 'DESVIO', 'SIN_SENAL', 'REPORTE_POLICIAL');

-- ---------- Catálogos ----------
create table perfiles (
  id        uuid primary key references auth.users(id) on delete cascade,
  rol       rol_app not null default 'chofer',
  nombre    text not null,
  nodo_id   text,                -- base asignada al checador
  creado_en timestamptz not null default now()
);

create table nodos (
  id        text primary key,    -- 'BOD', 'TLA', 'VJ' ...
  nombre    text not null,
  corto     text not null,
  es_base   boolean not null default false,
  ubicacion geography(Point, 4326) not null
);

create table rutas (
  id                        text primary key,   -- 'BOD-VJ'
  nombre                    text not null,
  nodo_origen_id            text not null references nodos(id),
  nodo_destino_id           text not null references nodos(id),
  tiempo_estimado_minutos   int  not null,
  frecuencia_objetivo_minutos int not null,
  eco_min                   int,
  eco_max                   int,
  polilinea                 geography(LineString, 4326),
  activa                    boolean not null default true
);

create table choferes (
  id        uuid primary key default gen_random_uuid(),
  perfil_id uuid references perfiles(id),
  nombre    text not null,
  telefono  text,
  foto_url  text,
  licencia  text
);

create table unidades (
  id            uuid primary key default gen_random_uuid(),
  numero_eco    int  not null unique,
  placas        text not null,
  marca         text,
  modelo        text,
  color         text,
  estado_actual estado_unidad not null default 'EN_BASE',
  nodo_actual_id text references nodos(id),
  en_base_desde timestamptz,
  chofer_id     uuid references choferes(id)
);
create index unidades_fila_idx on unidades (nodo_actual_id, en_base_desde) where estado_actual = 'EN_BASE';

-- ---------- Operación ----------
create table despachos (
  id                      uuid primary key default gen_random_uuid(),
  eco_id                  uuid not null references unidades(id),
  chofer_id               uuid references choferes(id),
  ruta_id                 text not null references rutas(id),
  checador_id             uuid references perfiles(id),
  hora_salida_programada  timestamptz not null default now(),
  hora_salida_real        timestamptz not null default now(),
  hora_llegada_estimada   timestamptz not null,
  hora_llegada_real       timestamptz,
  nodo_llegada_id         text not null references nodos(id),
  estado_despacho         estado_despacho not null default 'EN_TRAYECTO',
  panico_activo           boolean not null default false,
  panico_desde            timestamptz,
  intervalo_real_min      real
);
create index despachos_activos_idx on despachos (ruta_id, hora_salida_real desc) where estado_despacho <> 'COMPLETADO';
create index despachos_dia_idx on despachos (hora_salida_real desc);

-- Al insertar un despacho: calcula llegada estimada, intervalo real vs. salida anterior
-- en la misma ruta, nodo de llegada, y pone la unidad EN_RUTA. Una sola transacción.
create or replace function fn_despacho_insert() returns trigger language plpgsql as $$
declare r rutas%rowtype; prev_salida timestamptz; destino_es_base boolean;
begin
  select * into r from rutas where id = new.ruta_id;
  select es_base into destino_es_base from nodos where id = r.nodo_destino_id;
  new.nodo_llegada_id := case when destino_es_base then r.nodo_destino_id else r.nodo_origen_id end;
  new.hora_llegada_estimada := new.hora_salida_real + make_interval(mins => r.tiempo_estimado_minutos);
  select hora_salida_real into prev_salida from despachos
    where ruta_id = new.ruta_id and id <> new.id order by hora_salida_real desc limit 1;
  if prev_salida is not null then
    new.intervalo_real_min := extract(epoch from (new.hora_salida_real - prev_salida)) / 60.0;
  end if;
  if new.chofer_id is null then select chofer_id into new.chofer_id from unidades where id = new.eco_id; end if;
  update unidades set estado_actual = 'EN_RUTA', nodo_actual_id = null, en_base_desde = null where id = new.eco_id;
  return new;
end $$;
create trigger despachos_bi before insert on despachos for each row execute function fn_despacho_insert();

-- Check-in: al completar, la unidad se forma en el nodo de llegada.
create or replace function fn_despacho_checkin() returns trigger language plpgsql as $$
begin
  if new.estado_despacho = 'COMPLETADO' and old.estado_despacho <> 'COMPLETADO' then
    new.hora_llegada_real := coalesce(new.hora_llegada_real, now());
    new.panico_activo := false;
    update unidades set estado_actual = 'EN_BASE', nodo_actual_id = new.nodo_llegada_id, en_base_desde = new.hora_llegada_real
      where id = new.eco_id;
  end if;
  return new;
end $$;
create trigger despachos_bu before update of estado_despacho on despachos for each row execute function fn_despacho_checkin();

-- Pánico: el chofer solo actualiza su despacho; el trigger crea la alerta.
create or replace function fn_despacho_panico() returns trigger language plpgsql as $$
begin
  if new.panico_activo and not old.panico_activo then
    new.panico_desde := now();
    new.estado_despacho := 'ALERTA';
    insert into alertas_seguridad (despacho_id, tipo_alerta, latitud, longitud)
      select new.id, 'PANICO_CHOFER', st_y(p.ubicacion::geometry), st_x(p.ubicacion::geometry)
        from posiciones_actuales p where p.eco_id = new.eco_id;
  end if;
  return new;
end $$;
create trigger despachos_panico before update of panico_activo on despachos for each row execute function fn_despacho_panico();

-- ---------- GPS ----------
-- Append-only (particionar por día en producción).
create table posiciones_gps (
  id         bigserial primary key,
  eco_id     uuid not null references unidades(id) on delete cascade,
  at         timestamptz not null default now(),
  ubicacion  geography(Point, 4326) not null,
  velocidad_kmh real not null default 0,
  rumbo      real,
  precision_m real
);
create index posiciones_gps_eco_at_idx on posiciones_gps (eco_id, at desc);

-- Última posición por unidad: lo único que el checador consulta cada segundo.
create table posiciones_actuales (
  eco_id     uuid primary key references unidades(id) on delete cascade,
  at         timestamptz not null,
  ubicacion  geography(Point, 4326) not null,
  velocidad_kmh real not null default 0,
  rumbo      real
);
create or replace function fn_upsert_posicion() returns trigger language plpgsql as $$
begin
  insert into posiciones_actuales (eco_id, at, ubicacion, velocidad_kmh, rumbo)
  values (new.eco_id, new.at, new.ubicacion, new.velocidad_kmh, new.rumbo)
  on conflict (eco_id) do update
    set at = excluded.at, ubicacion = excluded.ubicacion, velocidad_kmh = excluded.velocidad_kmh, rumbo = excluded.rumbo
    where posiciones_actuales.at < excluded.at;
  return new;
end $$;
create trigger posiciones_gps_ai after insert on posiciones_gps for each row execute function fn_upsert_posicion();

-- ---------- Alertas ----------
create table alertas_seguridad (
  id           uuid primary key default gen_random_uuid(),
  despacho_id  uuid not null references despachos(id) on delete cascade,
  tipo_alerta  tipo_alerta not null,
  latitud      double precision,
  longitud     double precision,
  fecha_hora   timestamptz not null default now(),
  atendida_flag boolean not null default false,
  creada_por   uuid references perfiles(id),
  nota         text                       -- ficha serializada (JSON) / canal usado
);
create index alertas_abiertas_idx on alertas_seguridad (fecha_hora desc) where atendida_flag = false;

-- Marca el despacho en ALERTA cuando entra una alerta operativa (no el reporte policial, que es auditoría).
create or replace function fn_alerta_marca_despacho() returns trigger language plpgsql as $$
begin
  if new.tipo_alerta <> 'REPORTE_POLICIAL' then
    update despachos set estado_despacho = 'ALERTA' where id = new.despacho_id and estado_despacho = 'EN_TRAYECTO';
  end if;
  return new;
end $$;
create trigger alertas_ai after insert on alertas_seguridad for each row execute function fn_alerta_marca_despacho();

-- Retraso automático: ejecutar cada minuto con pg_cron (o Edge Function programada).
--   select cron.schedule('retrasos', '* * * * *', $$select fn_detectar_retrasos()$$);
create or replace function fn_detectar_retrasos() returns void language sql as $$
  insert into alertas_seguridad (despacho_id, tipo_alerta, latitud, longitud)
  select d.id, 'RETRASO_AUTOMATICO', st_y(p.ubicacion::geometry), st_x(p.ubicacion::geometry)
    from despachos d
    left join posiciones_actuales p on p.eco_id = d.eco_id
   where d.estado_despacho = 'EN_TRAYECTO'
     and now() > d.hora_llegada_estimada + interval '10 minutes'
     and not exists (select 1 from alertas_seguridad a where a.despacho_id = d.id and a.tipo_alerta = 'RETRASO_AUTOMATICO');
$$;

-- ---------- Realtime ----------
-- Se publican: unidades, despachos, alertas_seguridad, posiciones_actuales.
-- posiciones_gps NO se publica (demasiado ruido para 100 unidades).
alter publication supabase_realtime add table unidades, despachos, alertas_seguridad, posiciones_actuales;

-- ---------- RLS (resumen) ----------
alter table unidades enable row level security;
alter table despachos enable row level security;
alter table posiciones_gps enable row level security;
alter table posiciones_actuales enable row level security;
alter table alertas_seguridad enable row level security;

create or replace function es_operador() returns boolean language sql stable as $$
  select exists (select 1 from perfiles p where p.id = auth.uid() and p.rol in ('checador','admin'))
$$;

create policy "todos leen unidades"        on unidades for select using (auth.uid() is not null);
create policy "checador despacha"          on despachos for insert with check (es_operador());
create policy "checador/chofer actualizan" on despachos for update
  using (es_operador() or chofer_id in (select id from choferes where perfil_id = auth.uid()));
create policy "todos leen despachos"       on despachos for select using (auth.uid() is not null);
create policy "chofer inserta sus pings"   on posiciones_gps for insert
  with check (eco_id in (select u.id from unidades u join choferes c on c.id = u.chofer_id where c.perfil_id = auth.uid()));
create policy "operadores leen posiciones" on posiciones_actuales for select using (es_operador());
create policy "operadores crean alertas"   on alertas_seguridad for insert with check (es_operador());
create policy "operadores leen alertas"    on alertas_seguridad for select using (es_operador());

-- ---------- Vistas ----------
create or replace view flota_viva as
select u.id as eco_id, u.numero_eco, u.placas, u.marca, u.modelo, u.color, u.estado_actual, u.nodo_actual_id, u.en_base_desde,
       c.nombre as chofer_nombre, c.telefono as chofer_telefono, c.foto_url as chofer_foto, c.licencia as chofer_licencia,
       d.id as despacho_id, d.ruta_id, d.hora_salida_real, d.hora_llegada_estimada, d.nodo_llegada_id, d.estado_despacho, d.panico_activo, d.panico_desde,
       p.at as gps_at, st_y(p.ubicacion::geometry) as lat, st_x(p.ubicacion::geometry) as lng, p.velocidad_kmh
  from unidades u
  left join choferes c on c.id = u.chofer_id
  left join lateral (
    select * from despachos where eco_id = u.id and estado_despacho <> 'COMPLETADO' order by hora_salida_real desc limit 1
  ) d on true
  left join posiciones_actuales p on p.eco_id = u.id;

-- Analytics: salidas por hora y ruta (horas pico, cuellos de botella).
create or replace view despachos_por_hora as
select date_trunc('hour', hora_salida_real) as hora, ruta_id,
       count(*) as salidas,
       avg(intervalo_real_min) as intervalo_promedio_min,
       avg(extract(epoch from (hora_llegada_real - hora_salida_real)) / 60.0) filter (where hora_llegada_real is not null) as duracion_promedio_min,
       count(*) filter (where intervalo_real_min < (select frecuencia_objetivo_minutos * 0.6 from rutas r where r.id = ruta_id)) as carreos
  from despachos
 group by 1, 2;

-- ============================================================
-- Puntos de control, marcas de tiempo y programación por franjas
-- ============================================================
create type tipo_punto as enum ('SALIDA', 'INTERMEDIO', 'LLEGADA');
create type ocupacion  as enum ('VACIA', 'MEDIA', 'LLENA');

-- Puntos físicos donde se para un checador. Los nodos se insertan aquí con el mismo id.
create table puntos_control (
  id        text primary key,
  nombre    text not null,
  ubicacion geography(Point, 4326) not null
);

-- Orden de paso de cada ruta por sus puntos (SALIDA, INTERMEDIO x2, LLEGADA).
create table ruta_puntos (
  ruta_id   text not null references rutas(id) on delete cascade,
  punto_id  text not null references puntos_control(id),
  orden     int  not null,
  tipo      tipo_punto not null,
  fraccion  real not null,        -- fracción del tiempo estimado del despacho (0..1)
  primary key (ruta_id, orden)
);

-- Frecuencia programada por franja horaria; fuera de franja aplica rutas.frecuencia_objetivo_minutos.
create table franjas_horarias (
  id             uuid primary key default gen_random_uuid(),
  ruta_id        text not null references rutas(id) on delete cascade,
  inicio         time not null,
  fin            time not null,
  frecuencia_min int  not null check (frecuencia_min between 1 and 60),
  check (fin > inicio)
);
create index franjas_ruta_idx on franjas_horarias (ruta_id, inicio);

-- Ocupación observada al salir de la base (se copia a la marca SALIDA).
alter table despachos add column ocupacion_salida ocupacion, add column esperando_salida int;

create table marcas_tiempo (
  id                 uuid primary key default gen_random_uuid(),
  despacho_id        uuid not null references despachos(id) on delete cascade,
  punto_id           text not null references puntos_control(id),
  tipo               tipo_punto not null,
  hora               timestamptz not null default now(),
  checador_id        uuid references perfiles(id),
  ocupacion          ocupacion,
  esperando          int,
  intervalo_real_min real,
  unique (despacho_id, punto_id)
);
create index marcas_punto_hora_idx on marcas_tiempo (punto_id, hora desc);
create index marcas_despacho_idx on marcas_tiempo (despacho_id);

-- Al insertar una marca: deduce el tipo desde ruta_puntos, calcula el intervalo real
-- contra la unidad anterior de la misma ruta en ese punto y, si es llegada a base, completa el despacho.
create or replace function fn_marca_insert() returns trigger language plpgsql as $$
declare d despachos%rowtype; prev_hora timestamptz;
begin
  select * into d from despachos where id = new.despacho_id;
  select tipo into new.tipo from ruta_puntos where ruta_id = d.ruta_id and punto_id = new.punto_id;
  if new.tipo is null then raise exception 'La ruta % no pasa por el punto %', d.ruta_id, new.punto_id; end if;
  select m.hora into prev_hora from marcas_tiempo m join despachos dd on dd.id = m.despacho_id
   where dd.ruta_id = d.ruta_id and m.punto_id = new.punto_id and m.hora < new.hora order by m.hora desc limit 1;
  if prev_hora is not null then new.intervalo_real_min := extract(epoch from (new.hora - prev_hora)) / 60.0; end if;
  if new.tipo = 'LLEGADA' and d.nodo_llegada_id = new.punto_id then
    update despachos set estado_despacho = 'COMPLETADO', hora_llegada_real = new.hora where id = d.id;
  end if;
  return new;
end $$;
create trigger marcas_bi before insert on marcas_tiempo for each row execute function fn_marca_insert();

-- La salida genera su marca automáticamente.
create or replace function fn_despacho_marca_salida() returns trigger language plpgsql as $$
declare r rutas%rowtype;
begin
  select * into r from rutas where id = new.ruta_id;
  insert into marcas_tiempo (despacho_id, punto_id, tipo, hora, checador_id, ocupacion, esperando)
  values (new.id, r.nodo_origen_id, 'SALIDA', new.hora_salida_real, new.checador_id, new.ocupacion_salida, new.esperando_salida);
  return new;
end $$;
create trigger despachos_ai_marca after insert on despachos for each row execute function fn_despacho_marca_salida();

alter publication supabase_realtime add table marcas_tiempo, franjas_horarias;
alter table marcas_tiempo enable row level security;
alter table franjas_horarias enable row level security;
create policy "operadores marcan"       on marcas_tiempo for insert with check (es_operador());
create policy "todos leen marcas"       on marcas_tiempo for select using (auth.uid() is not null);
create policy "todos leen franjas"      on franjas_horarias for select using (auth.uid() is not null);
create policy "admin edita franjas"     on franjas_horarias for all
  using (exists (select 1 from perfiles p where p.id = auth.uid() and p.rol = 'admin'));

-- Frecuencia vigente de una ruta en un instante.
create or replace function fn_frecuencia_vigente(p_ruta text, p_at timestamptz default now()) returns int language sql stable as $$
  select coalesce(
    (select frecuencia_min from franjas_horarias where ruta_id = p_ruta and (p_at at time zone 'America/Mexico_City')::time >= inicio and (p_at at time zone 'America/Mexico_City')::time < fin limit 1),
    (select frecuencia_objetivo_minutos from rutas where id = p_ruta))
$$;

-- Necesidad por franja: ocupación observada (0 vacía · 2 llena), gente esperando, recorrido real.
create or replace view necesidad_por_franja as
select f.ruta_id, f.inicio, f.fin, f.frecuencia_min,
       count(distinct d.id) as salidas,
       avg(case m.ocupacion when 'VACIA' then 0 when 'MEDIA' then 1 when 'LLENA' then 2 end) as ocupacion_prom,
       avg(m.esperando) as esperando_prom,
       avg(extract(epoch from (d.hora_llegada_real - d.hora_salida_real)) / 60.0) as recorrido_real_min
  from franjas_horarias f
  join despachos d on d.ruta_id = f.ruta_id
   and (d.hora_salida_real at time zone 'America/Mexico_City')::time >= f.inicio
   and (d.hora_salida_real at time zone 'America/Mexico_City')::time < f.fin
  left join marcas_tiempo m on m.despacho_id = d.id
 group by 1, 2, 3, 4;
