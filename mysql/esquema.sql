-- GENERADO por scripts/mysql/generar-esquema.mts desde el Postgres de producción.
-- No se edita a mano: se cambia la migración en supabase/migrations/ y se vuelve a generar.
--
-- Va después de `cuentas.sql` (las llaves que apuntaban a auth.users apuntan a
-- `usuarios`) y antes de `logica.sql` (funciones, triggers y vistas).

set foreign_key_checks = 0;
drop view if exists calificaciones_oferta;
drop view if exists calificaciones_proveedor;
drop view if exists listings_publicos;
drop table if exists campanas;
drop table if exists certifications;
drop table if exists community_post_log;
drop table if exists community_posts;
drop table if exists community_reactions;
drop table if exists envios_de_campana;
drop table if exists experience_events;
drop table if exists listing_availability;
drop table if exists listings;
drop table if exists order_items;
drop table if exists orders;
drop table if exists page_views;
drop table if exists pagos;
drop table if exists profiles;
drop table if exists prospectos;
drop table if exists provider_applications;
drop table if exists provider_certifications;
drop table if exists provider_members;
drop table if exists providers;
drop table if exists quotation_items;
drop table if exists quotations;
drop table if exists reviews;
drop table if exists sustainability_assessments;
drop table if exists trusted_devices;
drop table if exists user_roles;
set foreign_key_checks = 1;

create table campanas (
  id char(36) character set ascii collate ascii_bin not null,
  tipo text not null,
  asunto text not null,
  cuerpo text not null,
  creada_por char(36) character set ascii collate ascii_bin,
  created_at datetime(6) not null default current_timestamp(6),
  primary key (id),
  constraint campanas_asunto_check check (((char_length(trim(asunto)) >= 3) AND (char_length(trim(asunto)) <= 160))),
  constraint campanas_cuerpo_check check (((char_length(trim(cuerpo)) >= 10) AND (char_length(trim(cuerpo)) <= 8000))),
  constraint campanas_tipo_check check ((tipo  in ('invitacion', 'noticia')))
) engine = innodb default charset = utf8mb4 collate = utf8mb4_bin;

create table certifications (
  code varchar(255) not null,
  label text not null,
  issuer text not null,
  points int not null default 0,
  primary key (code)
) engine = innodb default charset = utf8mb4 collate = utf8mb4_bin;

create table community_post_log (
  author_id char(36) character set ascii collate ascii_bin not null,
  created_at datetime(6) not null default current_timestamp(6),
  key community_post_log_autor_fecha_idx (author_id, created_at DESC)
) engine = innodb default charset = utf8mb4 collate = utf8mb4_bin;

create table community_posts (
  id char(36) character set ascii collate ascii_bin not null default (uuid()),
  author_id char(36) character set ascii collate ascii_bin not null,
  author_name text not null default '',
  provider_id char(36) character set ascii collate ascii_bin,
  title text not null,
  body text not null,
  topic text not null default 'experiencia',
  status enum('draft','pending_review','approved','rejected','suspended') not null default 'approved',
  featured boolean not null default false,
  reaction_count int not null default 0,
  created_at datetime(6) not null default current_timestamp(6),
  reaction_counts json not null default ('{}'),
  edited_at datetime(6),
  primary key (id),
  key community_posts_author_idx (author_id),
  key community_posts_autor_fecha_idx (author_id, created_at DESC),
  key community_posts_provider_idx (provider_id),
  key community_posts_recientes_idx (created_at DESC),
  constraint community_posts_body_check check (((char_length(trim(body)) >= 80) AND (char_length(trim(body)) <= 4000))),
  constraint community_posts_reaction_count_check check ((reaction_count >= 0)),
  constraint community_posts_title_check check (((char_length(trim(title)) >= 6) AND (char_length(trim(title)) <= 140))),
  constraint community_posts_topic_check check ((topic  in ('experiencia', 'noticia', 'practica', 'pregunta')))
) engine = innodb default charset = utf8mb4 collate = utf8mb4_bin;

create table community_reactions (
  post_id char(36) character set ascii collate ascii_bin not null,
  user_id char(36) character set ascii collate ascii_bin not null,
  created_at datetime(6) not null default current_timestamp(6),
  kind varchar(255) not null default 'semilla',
  primary key (post_id, user_id, kind),
  key community_reactions_usuario_fecha_idx (user_id, created_at DESC),
  constraint community_reactions_kind_check check ((kind  in ('semilla', 'megusta', 'bien_hecho', 'idea', 'apoyo')))
) engine = innodb default charset = utf8mb4 collate = utf8mb4_bin;

create table envios_de_campana (
  campana_id char(36) character set ascii collate ascii_bin not null,
  prospecto_id char(36) character set ascii collate ascii_bin not null,
  estado text not null default 'pendiente',
  error text,
  enviado_at datetime(6) not null default current_timestamp(6),
  primary key (campana_id, prospecto_id),
  key envios_de_campana_fecha_idx (enviado_at),
  constraint envios_de_campana_error_check check (((error IS NULL) OR (char_length(error) <= 300))),
  constraint envios_de_campana_estado_check check ((estado  in ('pendiente', 'enviado', 'fallido', 'omitido')))
) engine = innodb default charset = utf8mb4 collate = utf8mb4_bin;

create table experience_events (
  id char(36) character set ascii collate ascii_bin not null default (uuid()),
  provider_id char(36) character set ascii collate ascii_bin not null,
  clave varchar(255) not null,
  puntos int not null,
  referencia varchar(255),
  created_at datetime(6) not null default current_timestamp(6),
  referencia_clave varchar(255) generated always as (coalesce(referencia, '')) stored,
  primary key (id),
  unique key experience_events_unicos (provider_id, clave, referencia_clave),
  key experience_events_provider_idx (provider_id, created_at DESC),
  key experience_events_referencia_idx (referencia),
  constraint experience_events_puntos_check check ((puntos > 0))
) engine = innodb default charset = utf8mb4 collate = utf8mb4_bin;

create table listing_availability (
  id char(36) character set ascii collate ascii_bin not null default (uuid()),
  listing_id char(36) character set ascii collate ascii_bin not null,
  date date not null,
  slots_total int not null,
  slots_taken int not null default 0,
  primary key (id),
  unique key listing_availability_listing_id_date_key (listing_id, date),
  constraint listing_availability_slots_taken_check check ((slots_taken >= 0)),
  constraint listing_availability_slots_total_check check ((slots_total >= 0)),
  constraint no_overbooking check ((slots_taken <= slots_total))
) engine = innodb default charset = utf8mb4 collate = utf8mb4_bin;

create table listings (
  id char(36) character set ascii collate ascii_bin not null default (uuid()),
  slug varchar(255) not null,
  provider_id char(36) character set ascii collate ascii_bin not null,
  kind enum('product','experience','service') not null,
  title text not null,
  summary text not null default '',
  description text not null default '',
  category varchar(255) not null,
  verticals json not null default ('[]'),
  images json not null default ('[]'),
  price_cop int not null,
  wholesale_price_cop int,
  wholesale_min_qty int,
  unit text not null default 'unidad',
  quote_only boolean not null default false,
  stock int,
  co2_kg_saved decimal(10,2),
  water_liters_saved decimal(10,2),
  waste_kg_reduced decimal(10,2),
  certifications json not null default ('[]'),
  department text,
  city text,
  status enum('draft','pending_review','approved','rejected','suspended') not null default 'draft',
  featured boolean not null default false,
  duration_hours int,
  min_people int,
  max_people int,
  meeting_point text,
  includes json,
  delivery_time text,
  scope json,
  created_at datetime(6) not null default current_timestamp(6),
  busqueda text collate utf8mb4_uca1400_ai_ci generated always as (concat_ws(' ', coalesce(title, ''), coalesce(summary, ''), coalesce(description, ''), coalesce(category, ''))) stored,
  impacto decimal(20,6) generated always as (coalesce(co2_kg_saved, 0) + coalesce(water_liters_saved, 0) / 100 + coalesce(waste_kg_reduced, 0) * 2) stored,
  subcategory varchar(255),
  aporte_ambiental text,
  consecuencia_ambiental text,
  huella_co2_kg decimal(10,2),
  despacho text,
  transportadora text,
  envio_cop int,
  entrega_dias_min int,
  entrega_dias_max int,
  version int not null default 1,
  envio_local_cop int,
  envio_adicional_cop int,
  peso_kg decimal(8,2),
  largo_cm int,
  ancho_cm int,
  alto_cm int,
  primary key (id),
  unique key listings_slug_key (slug),
  key listings_category_idx (category),
  key listings_impacto_idx (impacto DESC),
  key listings_kind_idx (kind),
  key listings_provider_idx (provider_id),
  key listings_status_idx (status),
  key listings_subcategory_idx (subcategory),
  constraint listings_envio_valido check ((((despacho IS NULL) OR (despacho  in ('vendedor', 'transportadora'))) AND ((transportadora IS NULL) OR ((char_length(transportadora) >= 2) AND (char_length(transportadora) <= 60))) AND ((envio_cop IS NULL) OR ((envio_cop >= 0) AND (envio_cop <= 10000000))) AND ((entrega_dias_min IS NULL) OR ((entrega_dias_min >= 0) AND (entrega_dias_min <= 90))) AND ((entrega_dias_max IS NULL) OR ((entrega_dias_max >= 1) AND (entrega_dias_max <= 90))) AND ((entrega_dias_min IS NULL) OR (entrega_dias_max IS NULL) OR (entrega_dias_min <= entrega_dias_max)))),
  constraint listings_envio_zona_valido check ((((envio_local_cop IS NULL) OR ((envio_local_cop >= 0) AND (envio_local_cop <= 10000000))) AND ((envio_adicional_cop IS NULL) OR ((envio_adicional_cop >= 0) AND (envio_adicional_cop <= 10000000))) AND ((peso_kg IS NULL) OR ((peso_kg > 0) AND (peso_kg <= 10000))) AND ((largo_cm IS NULL) OR ((largo_cm >= 1) AND (largo_cm <= 1000))) AND ((ancho_cm IS NULL) OR ((ancho_cm >= 1) AND (ancho_cm <= 1000))) AND ((alto_cm IS NULL) OR ((alto_cm >= 1) AND (alto_cm <= 1000))))),
  constraint listings_huella_positiva check (((huella_co2_kg IS NULL) OR (huella_co2_kg >= 0))),
  constraint listings_price_cop_check check ((price_cop >= 0)),
  constraint listings_textos_ambientales check ((((aporte_ambiental IS NULL) OR (char_length(aporte_ambiental) <= 1000)) AND ((consecuencia_ambiental IS NULL) OR (char_length(consecuencia_ambiental) <= 1000)))),
  constraint listings_wholesale_price_cop_check check ((wholesale_price_cop >= 0)),
  constraint wholesale_needs_qty check (((wholesale_price_cop IS NULL) OR (wholesale_min_qty IS NOT NULL)))
) engine = innodb default charset = utf8mb4 collate = utf8mb4_bin;

create table order_items (
  id char(36) character set ascii collate ascii_bin not null default (uuid()),
  order_id char(36) character set ascii collate ascii_bin not null,
  listing_id char(36) character set ascii collate ascii_bin,
  provider_id char(36) character set ascii collate ascii_bin not null,
  title_snapshot text not null,
  unit_price_cop int not null,
  qty int not null,
  date date,
  commission_cop int not null default 0,
  created_at datetime(6) not null default current_timestamp(6),
  commission_rate decimal(5,4),
  envio_cop int not null default 0,
  despacho text,
  transportadora text,
  entrega_dias_min int,
  entrega_dias_max int,
  envio_estado varchar(255),
  guia text,
  despachado_at datetime(6),
  entregado_at datetime(6),
  stock_descontado boolean not null default false,
  cupo_descontado boolean not null default false,
  primary key (id),
  key order_items_envio_pendiente_idx (provider_id, envio_estado),
  key order_items_order_idx (order_id),
  key order_items_provider_idx (provider_id),
  constraint order_items_commission_rate_check check (((commission_rate IS NULL) OR ((commission_rate >= 0) AND (commission_rate <= 1)))),
  constraint order_items_envio_valido check (((envio_cop >= 0) AND ((envio_estado IS NULL) OR (envio_estado  in ('pendiente', 'despachado', 'entregado'))) AND ((guia IS NULL) OR (char_length(guia) <= 80)) AND ((transportadora IS NULL) OR (char_length(transportadora) <= 60)))),
  constraint order_items_qty_check check ((qty > 0))
) engine = innodb default charset = utf8mb4 collate = utf8mb4_bin;

create table orders (
  id char(36) character set ascii collate ascii_bin not null default (uuid()),
  reference varchar(255) not null,
  buyer_id char(36) character set ascii collate ascii_bin,
  buyer_email text not null,
  buyer_name text not null,
  buyer_company text,
  buyer_phone text,
  subtotal_cop int not null default 0,
  commission_total_cop int not null default 0,
  total_cop int not null default 0,
  status enum('pending_payment','paid','in_progress','fulfilled','cancelled','refunded') not null default 'pending_payment',
  payment_provider text,
  payment_reference text,
  notes text,
  created_at datetime(6) not null default current_timestamp(6),
  co2_kg_saved decimal(12,2),
  water_liters_saved decimal(12,2),
  waste_kg_reduced decimal(12,2),
  buyer_provider_id char(36) character set ascii collate ascii_bin,
  buyer_tax_id text,
  envio_total_cop int not null default 0,
  envio_departamento text,
  envio_ciudad text,
  envio_direccion text,
  envio_indicaciones text,
  primary key (id),
  unique key orders_reference_key (reference),
  key orders_buyer_fecha_idx (buyer_id, created_at DESC),
  key orders_buyer_idx (buyer_id),
  key orders_buyer_provider_idx (buyer_provider_id),
  key orders_sin_pagar_idx (created_at),
  key orders_status_fecha_idx (status, created_at DESC),
  key orders_status_idx (status),
  constraint orders_buyer_tax_id_largo check (((buyer_tax_id IS NULL) OR (char_length(buyer_tax_id) <= 40))),
  constraint orders_envio_valido check (((envio_total_cop >= 0) AND ((envio_departamento IS NULL) OR (char_length(envio_departamento) <= 60)) AND ((envio_ciudad IS NULL) OR (char_length(envio_ciudad) <= 80)) AND ((envio_direccion IS NULL) OR (char_length(envio_direccion) <= 200)) AND ((envio_indicaciones IS NULL) OR (char_length(envio_indicaciones) <= 300))))
) engine = innodb default charset = utf8mb4 collate = utf8mb4_bin;

create table page_views (
  id bigint not null auto_increment,
  path text not null,
  referrer_host text,
  visitor text not null,
  device text not null,
  country text,
  created_at datetime(6) not null default current_timestamp(6),
  primary key (id),
  key page_views_created_idx (created_at),
  constraint page_views_country_check check ((country regexp '^[A-Z]{2}$')),
  constraint page_views_device_check check ((device  in ('movil', 'tableta', 'escritorio'))),
  constraint page_views_path_check check (((path regexp '^/') AND (char_length(path) <= 200))),
  constraint page_views_referrer_host_check check ((char_length(referrer_host) <= 100)),
  constraint page_views_visitor_check check ((visitor regexp '^[0-9a-f]{64}$'))
) engine = innodb default charset = utf8mb4 collate = utf8mb4_bin;

create table pagos (
  id char(36) character set ascii collate ascii_bin not null default (uuid()),
  order_id char(36) character set ascii collate ascii_bin not null,
  pasarela varchar(255) not null,
  transaccion varchar(255) not null,
  estado varchar(255) not null,
  monto_cop int not null,
  metodo text,
  created_at datetime(6) not null default current_timestamp(6),
  primary key (id),
  unique key pagos_pasarela_transaccion_estado_key (pasarela, transaccion, estado),
  key pagos_order_idx (order_id),
  constraint pagos_estado_check check ((estado  in ('aprobado', 'rechazado', 'anulado', 'monto-distinto'))),
  constraint pagos_metodo_check check (((metodo IS NULL) OR (char_length(metodo) <= 40))),
  constraint pagos_monto_cop_check check ((monto_cop >= 0)),
  constraint pagos_pasarela_check check (((char_length(pasarela) >= 2) AND (char_length(pasarela) <= 30))),
  constraint pagos_transaccion_check check (((char_length(transaccion) >= 1) AND (char_length(transaccion) <= 100)))
) engine = innodb default charset = utf8mb4 collate = utf8mb4_bin;

create table profiles (
  id char(36) character set ascii collate ascii_bin not null,
  full_name text not null,
  phone text,
  company_name text,
  tax_id text,
  created_at datetime(6) not null default current_timestamp(6),
  avatar_url text,
  primary key (id)
) engine = innodb default charset = utf8mb4 collate = utf8mb4_bin;

create table prospectos (
  id char(36) character set ascii collate ascii_bin not null default (uuid()),
  nombre text not null,
  nit varchar(255),
  correo text,
  telefono text,
  sitio_web text,
  instagram text,
  ciudad text,
  departamento text,
  categoria text,
  encaje text,
  fuente text,
  notas text,
  estado varchar(255) not null default 'nuevo',
  ultimo_envio_at datetime(6),
  token char(36) character set ascii collate ascii_bin not null default (uuid()),
  baja_at datetime(6),
  created_at datetime(6) not null default current_timestamp(6),
  updated_at datetime(6) not null default current_timestamp(6),
  correo_unico varchar(255) generated always as (lower(correo)) stored,
  primary key (id),
  unique key prospectos_token_key (token),
  unique key prospectos_correo_idx (correo_unico),
  key prospectos_estado_idx (estado, created_at DESC),
  unique key prospectos_nit_idx (nit),
  constraint prospectos_categoria_check check (((categoria IS NULL) OR (char_length(categoria) <= 200))),
  constraint prospectos_ciudad_check check (((ciudad IS NULL) OR (char_length(ciudad) <= 80))),
  constraint prospectos_correo_check check (((correo IS NULL) OR ((char_length(correo) <= 200) AND (correo regexp '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$')))),
  constraint prospectos_departamento_check check (((departamento IS NULL) OR (char_length(departamento) <= 80))),
  constraint prospectos_encaje_check check (((encaje IS NULL) OR (encaje  in ('alto', 'medio', 'bajo', 'descartar')))),
  constraint prospectos_estado_check check ((estado  in ('nuevo', 'invitado', 'interesado', 'descartado'))),
  constraint prospectos_fuente_check check (((fuente IS NULL) OR (char_length(fuente) <= 300))),
  constraint prospectos_instagram_check check (((instagram IS NULL) OR (char_length(instagram) <= 300))),
  constraint prospectos_nit_check check (((nit IS NULL) OR (char_length(nit) <= 30))),
  constraint prospectos_nombre_check check (((char_length(trim(nombre)) >= 2) AND (char_length(trim(nombre)) <= 200))),
  constraint prospectos_notas_check check (((notas IS NULL) OR (char_length(notas) <= 2000))),
  constraint prospectos_sitio_web_check check (((sitio_web IS NULL) OR (char_length(sitio_web) <= 300))),
  constraint prospectos_telefono_check check (((telefono IS NULL) OR (char_length(telefono) <= 40)))
) engine = innodb default charset = utf8mb4 collate = utf8mb4_bin;

create table provider_applications (
  id char(36) character set ascii collate ascii_bin not null default (uuid()),
  user_id char(36) character set ascii collate ascii_bin,
  name text not null,
  contact_name text not null,
  email text not null,
  phone text not null,
  department text not null,
  city text not null,
  website text,
  description text not null,
  status enum('draft','pending_review','approved','rejected','suspended') not null default 'pending_review',
  reviewer_notes text,
  reviewed_by char(36) character set ascii collate ascii_bin,
  reviewed_at datetime(6),
  provider_id char(36) character set ascii collate ascii_bin,
  created_at datetime(6) not null default current_timestamp(6),
  country text not null default 'Colombia',
  org_type text,
  tax_id_kind text,
  tax_id text,
  categories json not null default ('[]'),
  consent_at datetime(6),
  primary key (id),
  key provider_applications_status_idx (status)
) engine = innodb default charset = utf8mb4 collate = utf8mb4_bin;

create table provider_certifications (
  id char(36) character set ascii collate ascii_bin not null default (uuid()),
  provider_id char(36) character set ascii collate ascii_bin not null,
  certification_code varchar(255) not null,
  document_url text,
  issued_at date,
  expires_at date,
  verified_at datetime(6),
  verified_by char(36) character set ascii collate ascii_bin,
  primary key (id),
  unique key provider_certifications_provider_id_certification_code_key (provider_id, certification_code)
) engine = innodb default charset = utf8mb4 collate = utf8mb4_bin;

create table provider_members (
  provider_id char(36) character set ascii collate ascii_bin not null,
  user_id char(36) character set ascii collate ascii_bin not null,
  is_owner boolean not null default false,
  primary key (provider_id, user_id),
  key provider_members_user_idx (user_id)
) engine = innodb default charset = utf8mb4 collate = utf8mb4_bin;

create table providers (
  id char(36) character set ascii collate ascii_bin not null default (uuid()),
  slug varchar(255) not null,
  name text not null,
  legal_name text,
  tax_id text,
  tagline text not null default '',
  description text not null default '',
  logo_url text,
  cover_url text,
  department varchar(255) not null,
  city text not null,
  website text,
  email text not null,
  phone text,
  status enum('draft','pending_review','approved','rejected','suspended') not null default 'draft',
  sustainability_score int not null default 0,
  tier enum('unverified','semilla','raiz','bosque') not null default 'unverified',
  founded_year int,
  traits json not null default ('[]'),
  payout_bank text,
  payout_account_masked text,
  created_at datetime(6) not null default current_timestamp(6),
  busqueda text collate utf8mb4_uca1400_ai_ci generated always as (coalesce(name, '')) stored,
  experience_points int not null default 0,
  sustainability_verified_at datetime(6),
  country text not null default 'Colombia',
  giros json not null default ('[]'),
  cerrada_at datetime(6),
  cerrada_por char(36) character set ascii collate ascii_bin,
  clave_tributaria varchar(255),
  -- Cuándo comprobó el equipo el documento tributario (2026-10-22). Solo lo
  -- escribe un administrador (`providers_antes_de_cambiar`).
  documento_verificado_at datetime(6),
  primary key (id),
  unique key providers_slug_key (slug),
  key providers_clave_tributaria_idx (clave_tributaria),
  key providers_department_idx (department),
  key providers_status_idx (status),
  constraint providers_experience_points_check check ((experience_points >= 0)),
  constraint providers_sustainability_score_check check (((sustainability_score >= 0) AND (sustainability_score <= 100)))
  -- providers_giros_validos: en un trigger de logica.sql (MariaDB no lo puede expresar como CHECK)
) engine = innodb default charset = utf8mb4 collate = utf8mb4_bin;

create table quotation_items (
  id char(36) character set ascii collate ascii_bin not null default (uuid()),
  quotation_id char(36) character set ascii collate ascii_bin not null,
  listing_id char(36) character set ascii collate ascii_bin,
  provider_id char(36) character set ascii collate ascii_bin not null,
  title_snapshot text not null,
  qty int not null,
  quoted_unit_price_cop int,
  primary key (id),
  constraint quotation_items_qty_check check ((qty > 0))
) engine = innodb default charset = utf8mb4 collate = utf8mb4_bin;

create table quotations (
  id char(36) character set ascii collate ascii_bin not null default (uuid()),
  reference varchar(255) not null,
  buyer_id char(36) character set ascii collate ascii_bin,
  buyer_email text not null,
  buyer_name text not null,
  buyer_company text,
  buyer_phone text,
  message text,
  status text not null default 'requested',
  responded_at datetime(6),
  created_at datetime(6) not null default current_timestamp(6),
  primary key (id),
  unique key quotations_reference_key (reference)
) engine = innodb default charset = utf8mb4 collate = utf8mb4_bin;

create table reviews (
  id char(36) character set ascii collate ascii_bin not null default (uuid()),
  listing_id char(36) character set ascii collate ascii_bin not null,
  author_id char(36) character set ascii collate ascii_bin not null,
  order_item_id char(36) character set ascii collate ascii_bin not null,
  rating int not null,
  body text not null default '',
  created_at datetime(6) not null default current_timestamp(6),
  oculta boolean not null default false,
  autor_nombre text,
  updated_at datetime(6),
  primary key (id),
  unique key reviews_order_item_id_key (order_item_id),
  key reviews_listing_idx (listing_id, created_at DESC),
  constraint reviews_rating_check check (((rating >= 1) AND (rating <= 5))),
  constraint reviews_textos check (((char_length(body) <= 2000) AND ((autor_nombre IS NULL) OR (char_length(autor_nombre) <= 80))))
) engine = innodb default charset = utf8mb4 collate = utf8mb4_bin;

create table sustainability_assessments (
  id char(36) character set ascii collate ascii_bin not null default (uuid()),
  provider_id char(36) character set ascii collate ascii_bin not null,
  answers json not null default ('{}'),
  breakdown json not null default ('{}'),
  score int not null default 0,
  tier enum('unverified','semilla','raiz','bosque') not null default 'unverified',
  status enum('draft','pending_review','approved','rejected','suspended') not null default 'draft',
  reviewer_notes text,
  reviewed_by char(36) character set ascii collate ascii_bin,
  reviewed_at datetime(6),
  submitted_at datetime(6),
  created_at datetime(6) not null default current_timestamp(6),
  primary key (id),
  key sustainability_provider_idx (provider_id),
  constraint sustainability_assessments_score_check check (((score >= 0) AND (score <= 100)))
) engine = innodb default charset = utf8mb4 collate = utf8mb4_bin;

create table trusted_devices (
  id char(36) character set ascii collate ascii_bin not null default (uuid()),
  user_id char(36) character set ascii collate ascii_bin not null,
  device_hash varchar(255) not null,
  label text not null default 'Dispositivo',
  last_seen_at datetime(6) not null default current_timestamp(6),
  created_at datetime(6) not null default current_timestamp(6),
  primary key (id),
  unique key trusted_devices_user_id_device_hash_key (user_id, device_hash),
  key trusted_devices_user_idx (user_id)
) engine = innodb default charset = utf8mb4 collate = utf8mb4_bin;

create table user_roles (
  user_id char(36) character set ascii collate ascii_bin not null,
  role enum('buyer','provider','admin') not null,
  granted_at datetime(6) not null default current_timestamp(6),
  primary key (user_id, role)
) engine = innodb default charset = utf8mb4 collate = utf8mb4_bin;

-- Llaves foráneas, al final: así el orden de las tablas no importa.
alter table campanas add constraint campanas_creada_por_fkey FOREIGN KEY (creada_por) REFERENCES usuarios(id) ON DELETE SET NULL;
alter table community_post_log add constraint community_post_log_author_id_fkey FOREIGN KEY (author_id) REFERENCES usuarios(id) ON DELETE CASCADE;
alter table community_posts add constraint community_posts_author_id_fkey FOREIGN KEY (author_id) REFERENCES usuarios(id) ON DELETE CASCADE;
alter table community_posts add constraint community_posts_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE SET NULL;
alter table community_reactions add constraint community_reactions_post_id_fkey FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE;
alter table community_reactions add constraint community_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE CASCADE;
alter table envios_de_campana add constraint envios_de_campana_campana_id_fkey FOREIGN KEY (campana_id) REFERENCES campanas(id) ON DELETE CASCADE;
alter table envios_de_campana add constraint envios_de_campana_prospecto_id_fkey FOREIGN KEY (prospecto_id) REFERENCES prospectos(id) ON DELETE CASCADE;
alter table experience_events add constraint experience_events_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE;
alter table listing_availability add constraint listing_availability_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE;
alter table listings add constraint listings_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE;
alter table order_items add constraint order_items_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE SET NULL;
alter table order_items add constraint order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table order_items add constraint order_items_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES providers(id);
alter table orders add constraint orders_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES usuarios(id) ON DELETE SET NULL;
alter table orders add constraint orders_buyer_provider_id_fkey FOREIGN KEY (buyer_provider_id) REFERENCES providers(id) ON DELETE SET NULL;
alter table pagos add constraint pagos_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT;
alter table profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES usuarios(id) ON DELETE CASCADE;
alter table provider_applications add constraint provider_applications_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE SET NULL;
alter table provider_applications add constraint provider_applications_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES usuarios(id);
alter table provider_applications add constraint provider_applications_user_id_fkey FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE SET NULL;
alter table provider_certifications add constraint provider_certifications_certification_code_fkey FOREIGN KEY (certification_code) REFERENCES certifications(code);
alter table provider_certifications add constraint provider_certifications_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE;
alter table provider_certifications add constraint provider_certifications_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES usuarios(id);
alter table provider_members add constraint provider_members_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE;
alter table provider_members add constraint provider_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE CASCADE;
alter table quotation_items add constraint quotation_items_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE SET NULL;
alter table quotation_items add constraint quotation_items_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES providers(id);
alter table quotation_items add constraint quotation_items_quotation_id_fkey FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE;
alter table quotations add constraint quotations_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES usuarios(id) ON DELETE SET NULL;
alter table reviews add constraint reviews_author_id_fkey FOREIGN KEY (author_id) REFERENCES usuarios(id) ON DELETE CASCADE;
alter table reviews add constraint reviews_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE;
alter table reviews add constraint reviews_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE;
alter table sustainability_assessments add constraint sustainability_assessments_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE;
alter table sustainability_assessments add constraint sustainability_assessments_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES usuarios(id);
alter table trusted_devices add constraint trusted_devices_user_id_fkey FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE CASCADE;
alter table user_roles add constraint user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE CASCADE;
