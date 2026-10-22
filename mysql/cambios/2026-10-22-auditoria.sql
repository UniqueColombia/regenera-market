-- Cambios de esquema de la auditoría del 2026-10-22, para la base que ya está en
-- producción. `mysql/esquema.sql` y `mysql/cuentas.sql` ya los traen para una
-- base nueva; esto los agrega a una existente. Se puede correr más de una vez.
-- Se aplica desde el servidor con `scripts/servidor/aplicar-sql.mjs`, seguido de
-- `mysql/logica.sql` (ver `docs/MODO-MYSQL.md`, «Cambiar el esquema»).

-- Cuándo comprobó el equipo el documento tributario de una empresa.
alter table providers add column if not exists documento_verificado_at datetime(6) after clave_tributaria;

-- Intentos de acceso fallidos por correo (`FALLOS` de `src/lib/mysql/cuentas.ts`).
create table if not exists intentos_fallidos (
  id        bigint not null auto_increment primary key,
  clave     varchar(400) collate utf8mb4_bin not null,
  creado_at datetime(6) not null default current_timestamp(6),
  key intentos_fallidos_clave (clave, creado_at)
) engine = innodb default charset = utf8mb4 collate = utf8mb4_uca1400_ai_ci;
