-- Cuentas propias en MariaDB, sin Supabase Auth — experimento MySQL, etapa 4a.
--
-- Lo que hoy hace Supabase Auth (GoTrue) con `auth.users`, sus sesiones y sus
-- códigos de un solo uso, en tres tablas que maneja `src/lib/mysql/cuentas.ts`.
-- Nada más escribe en ellas: no hay triggers porque no hay otra puerta. La
-- seguridad está en lo que se guarda:
--
--   - De la contraseña, solo el hash scrypt (con su sal y sus parámetros).
--   - De la sesión, solo el sha256 del token de la cookie. Quien lea la tabla
--     no puede hacerse pasar por nadie.
--   - Del código de seis dígitos, solo su hash, con un tope de intentos y de
--     vida, y un solo uso.
--
-- Se rehace entera (empieza con `drop`): mientras dure el experimento no hay
-- cuentas de verdad aquí, solo las de las pruebas de `mysql/pruebas/`.

set foreign_key_checks = 0;
drop table if exists intentos_fallidos;
drop table if exists sesiones;
drop table if exists codigos;
drop table if exists usuarios;
set foreign_key_checks = 1;

create table usuarios (
  id                   char(36) character set ascii collate ascii_bin not null primary key,
  -- Siempre en minúsculas y sin espacios (`normalizarCorreo()`): la unicidad
  -- es binaria, así que «Ana@x.co» y «ana@x.co» serían dos cuentas si alguien
  -- escribiera sin normalizar.
  email                varchar(320) collate utf8mb4_bin not null unique,
  -- NULL = la cuenta no tiene contraseña y entra con código (las creadas por
  -- un administrador, o las importadas de Supabase, cuyo hash no se trae).
  clave                varchar(255) character set ascii collate ascii_bin,
  correo_confirmado_at datetime(6),
  -- El `user_metadata` de Supabase: nombre, teléfono, bienvenida…
  metadatos            json not null default ('{}'),
  creado_at            datetime(6) not null default current_timestamp(6),
  ultimo_acceso_at     datetime(6)
) engine = innodb default charset = utf8mb4 collate = utf8mb4_uca1400_ai_ci;

create table sesiones (
  token_hash  char(64) character set ascii collate ascii_bin not null primary key,
  usuario_id  char(36) character set ascii collate ascii_bin not null,
  creada_at   datetime(6) not null default current_timestamp(6),
  -- La última petición con esta sesión. Se toca como mucho una vez por minuto
  -- (`REFRESCO_ACTIVIDAD_SEGUNDOS`), no en cada petición.
  vista_at    datetime(6) not null default current_timestamp(6),
  aparato     varchar(200),
  key sesiones_usuario (usuario_id),
  constraint sesiones_usuario foreign key (usuario_id) references usuarios (id) on delete cascade
) engine = innodb default charset = utf8mb4 collate = utf8mb4_uca1400_ai_ci;

create table codigos (
  id          char(36) character set ascii collate ascii_bin not null primary key,
  email       varchar(320) collate utf8mb4_bin not null,
  proposito   enum('registro','acceso') not null,
  codigo_hash char(64) character set ascii collate ascii_bin not null,
  creado_at   datetime(6) not null default current_timestamp(6),
  vence_at    datetime(6) not null,
  intentos    int not null default 0,
  usado_at    datetime(6),
  key codigos_correo (email, proposito, creado_at)
) engine = innodb default charset = utf8mb4 collate = utf8mb4_uca1400_ai_ci;

-- Intentos de acceso fallidos, por correo (desde el 2026-10-22). Antes los
-- topes vivían en la memoria de cada proceso: se perdían al reiniciar y no se
-- sumaban entre procesos. Se cuentan **solo los fallos** —una contraseña bien
-- escrita no acerca a nadie al bloqueo— y se borran a los dos días
-- (`limpiarCuentas()`). `clave` es `clave:<correo>` o `codigo:<correo>`.
create table intentos_fallidos (
  id        bigint not null auto_increment primary key,
  clave     varchar(400) collate utf8mb4_bin not null,
  creado_at datetime(6) not null default current_timestamp(6),
  key intentos_fallidos_clave (clave, creado_at)
) engine = innodb default charset = utf8mb4 collate = utf8mb4_uca1400_ai_ci;
