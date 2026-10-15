-- 0019 — Los pagos en línea que confirma una pasarela.
--
-- Pedido de Jesús el 2026-10-14: cobrar con BOLD, además de la transferencia y
-- la llave Bre-B. La integración está en `src/lib/payments.ts` y se enciende
-- sola cuando estén las llaves en Vercel (pendiente con Ivan, ver
-- `docs/ESTADO.md`).
--
-- ## Para qué la tabla, si la orden ya cambia a «pagada»
--
-- Para poder contestar dos preguntas que una orden sola no contesta:
--
-- 1. **¿Con qué transacción se pagó?** Un reembolso, una disputa o un cruce con
--    el extracto de la pasarela empiezan por ese número.
-- 2. **¿Ya procesamos esta notificación?** Las pasarelas reintentan (BOLD hasta
--    cinco veces en un día). La clave única (pasarela, transacción, estado) hace
--    que la misma noticia llegue tres veces y se anote una (invariante 10b y
--    skill `nueva-integracion`, «Webhooks»).
--
-- La escribe solo el servidor con la clave de servicio —es uno de sus tres usos
-- legítimos, «confirmar pagos», según `supabase-schema`— y nunca un navegador:
-- no hay política de escritura. La lee el equipo, y quien compró la suya.
--
-- No guarda datos de la tarjeta ni del pagador: el número de transacción, el
-- monto y el medio («tarjeta», «PSE», «Nequi») bastan para auditar.
--
-- Aditiva y re-ejecutable.

create table if not exists pagos (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete restrict,
  pasarela text not null check (char_length(pasarela) between 2 and 30),
  transaccion text not null check (char_length(transaccion) between 1 and 100),
  estado text not null check (estado in ('aprobado', 'rechazado', 'anulado', 'monto-distinto')),
  monto_cop int not null check (monto_cop >= 0),
  metodo text check (metodo is null or char_length(metodo) <= 40),
  created_at timestamptz not null default now(),
  unique (pasarela, transaccion, estado)
);

comment on table pagos is
  'Pagos en línea confirmados por una pasarela (0019). Solo los escribe el servidor con la clave de servicio.';
comment on column pagos.estado is
  'monto-distinto: la pasarela dijo aprobado por un valor que no es el total de la orden. No se confirma la orden: lo revisa el equipo.';

create index if not exists pagos_order_idx on pagos (order_id);

alter table pagos enable row level security;

drop policy if exists pagos_admin_read on pagos;
create policy pagos_admin_read on pagos
  for select using (is_admin());

drop policy if exists pagos_buyer_read on pagos;
create policy pagos_buyer_read on pagos
  for select using (owns_order(order_id));

-- ---------------------------------------------------------------------------
-- Comprobación después de aplicarla:
--
--   select count(*) from pg_tables where tablename = 'pagos';  -- 1
--
-- Rollback (en el papel; borra el registro de pagos, no las órdenes):
--   drop table if exists pagos;
-- ---------------------------------------------------------------------------
