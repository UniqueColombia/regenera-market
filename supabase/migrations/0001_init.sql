-- Regenera Market — esquema inicial
--
-- Marketplace multi-proveedor: terceros publican, los compradores compran o
-- piden cotización, y la plataforma retiene comisión. Todo el control de acceso
-- vive en RLS: la aplicación nunca es la única barrera.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type app_role as enum ('buyer', 'provider', 'admin');
create type listing_kind as enum ('product', 'experience', 'service');
create type review_status as enum ('draft', 'pending_review', 'approved', 'rejected', 'suspended');
create type tier as enum ('unverified', 'semilla', 'raiz', 'bosque');
create type order_status as enum ('pending_payment', 'paid', 'in_progress', 'fulfilled', 'cancelled', 'refunded');
create type vertical as enum ('hoteles', 'hostales', 'restaurantes', 'transporte', 'agencias');

-- ---------------------------------------------------------------------------
-- Identidad
-- ---------------------------------------------------------------------------

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text not null,
  phone text,
  company_name text,
  -- NIT del comprador empresarial, necesario para facturar
  tax_id text,
  created_at timestamptz not null default now()
);

-- Los roles van en su propia tabla, nunca en profiles: si el usuario pudiera
-- actualizar su propia fila de perfil, podría autoasignarse admin.
create table user_roles (
  user_id uuid not null references auth.users on delete cascade,
  role app_role not null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

-- security definer para que las políticas puedan consultar roles sin recursión
create or replace function has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from user_roles where user_id = _user_id and role = _role
  );
$$;

create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select has_role(auth.uid(), 'admin');
$$;

-- ---------------------------------------------------------------------------
-- Proveedores
-- ---------------------------------------------------------------------------

create table providers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  legal_name text,
  tax_id text,
  tagline text not null default '',
  description text not null default '',
  logo_url text,
  cover_url text,
  department text not null,
  city text not null,
  website text,
  email text not null,
  phone text,
  status review_status not null default 'draft',
  -- Derivados de la evaluación aprobada; los escribe un trigger, no el proveedor
  sustainability_score int not null default 0 check (sustainability_score between 0 and 100),
  tier tier not null default 'unverified',
  founded_year int,
  traits text[] not null default '{}',
  -- Datos de dispersión de pagos, solo visibles para el propio proveedor y admin
  payout_bank text,
  payout_account_masked text,
  created_at timestamptz not null default now()
);

create index providers_status_idx on providers (status);
create index providers_department_idx on providers (department);

-- Un proveedor puede tener varias personas gestionándolo
create table provider_members (
  provider_id uuid not null references providers on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  is_owner boolean not null default false,
  primary key (provider_id, user_id)
);

create or replace function manages_provider(_provider_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from provider_members
    where provider_id = _provider_id and user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Verificación de sostenibilidad
-- ---------------------------------------------------------------------------

-- Catálogo de certificaciones reconocidas y cuántos puntos aporta cada una
create table certifications (
  code text primary key,
  label text not null,
  issuer text not null,
  points int not null default 0
);

create table provider_certifications (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references providers on delete cascade,
  certification_code text not null references certifications,
  document_url text,
  issued_at date,
  expires_at date,
  -- Solo cuenta para el puntaje cuando un admin la verifica
  verified_at timestamptz,
  verified_by uuid references auth.users,
  unique (provider_id, certification_code)
);

create table sustainability_assessments (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references providers on delete cascade,
  -- { "amb_residuos": 0, "amb_energia": 2, ... } índice de la opción elegida
  answers jsonb not null default '{}'::jsonb,
  -- Desglose por dimensión, para poder mostrar y auditar el puntaje
  breakdown jsonb not null default '{}'::jsonb,
  score int not null default 0 check (score between 0 and 100),
  tier tier not null default 'unverified',
  status review_status not null default 'draft',
  reviewer_notes text,
  reviewed_by uuid references auth.users,
  reviewed_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default now()
);

create index sustainability_provider_idx on sustainability_assessments (provider_id);

-- Al aprobar una evaluación, el puntaje y el nivel bajan al proveedor.
-- Se hace en trigger para que el proveedor no pueda escribirlos por su cuenta.
create or replace function sync_provider_score()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved' then
    update providers
      set sustainability_score = new.score,
          tier = new.tier
      where id = new.provider_id;
  end if;
  return new;
end;
$$;

create trigger sustainability_approved
  after insert or update of status on sustainability_assessments
  for each row execute function sync_provider_score();

-- ---------------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------------

create table listings (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  provider_id uuid not null references providers on delete cascade,
  kind listing_kind not null,
  title text not null,
  summary text not null default '',
  description text not null default '',
  category text not null,
  verticals vertical[] not null default '{}',
  images text[] not null default '{}',
  -- COP sin decimales: en Colombia no se factura en centavos
  price_cop int not null check (price_cop >= 0),
  wholesale_price_cop int check (wholesale_price_cop >= 0),
  wholesale_min_qty int,
  unit text not null default 'unidad',
  quote_only boolean not null default false,
  stock int,
  co2_kg_saved numeric(10,2),
  water_liters_saved numeric(10,2),
  waste_kg_reduced numeric(10,2),
  certifications text[] not null default '{}',
  department text,
  city text,
  status review_status not null default 'draft',
  featured boolean not null default false,
  -- Campos propios de experiencias
  duration_hours int,
  min_people int,
  max_people int,
  meeting_point text,
  includes text[],
  -- Campos propios de servicios
  delivery_time text,
  scope text[],
  created_at timestamptz not null default now(),

  constraint wholesale_needs_qty check (
    wholesale_price_cop is null or wholesale_min_qty is not null
  )
);

create index listings_status_idx on listings (status);
create index listings_provider_idx on listings (provider_id);
create index listings_kind_idx on listings (kind);
create index listings_category_idx on listings (category);
create index listings_verticals_idx on listings using gin (verticals);

-- Cupos por fecha. Solo aplica a experiencias.
create table listing_availability (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings on delete cascade,
  date date not null,
  slots_total int not null check (slots_total >= 0),
  slots_taken int not null default 0 check (slots_taken >= 0),
  unique (listing_id, date),
  constraint no_overbooking check (slots_taken <= slots_total)
);

-- ---------------------------------------------------------------------------
-- Órdenes
-- ---------------------------------------------------------------------------

create table orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  buyer_id uuid references auth.users on delete set null,
  buyer_email text not null,
  buyer_name text not null,
  buyer_company text,
  buyer_phone text,
  subtotal_cop int not null default 0,
  commission_total_cop int not null default 0,
  total_cop int not null default 0,
  status order_status not null default 'pending_payment',
  -- Referencia de la transacción en la pasarela (Wompi)
  payment_provider text,
  payment_reference text,
  notes text,
  created_at timestamptz not null default now()
);

create index orders_buyer_idx on orders (buyer_id);
create index orders_status_idx on orders (status);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders on delete cascade,
  listing_id uuid references listings on delete set null,
  -- El proveedor va en el ítem: una orden puede repartirse entre varios
  provider_id uuid not null references providers,
  -- Se congela el título y el precio: si el proveedor los cambia mañana, la
  -- orden histórica debe seguir diciendo lo que el comprador aceptó
  title_snapshot text not null,
  unit_price_cop int not null,
  qty int not null check (qty > 0),
  date date,
  commission_cop int not null default 0,
  created_at timestamptz not null default now()
);

create index order_items_order_idx on order_items (order_id);
create index order_items_provider_idx on order_items (provider_id);

-- ---------------------------------------------------------------------------
-- Cotizaciones (flujo B2B, para servicios y compras mayoristas)
-- ---------------------------------------------------------------------------

create table quotations (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  buyer_id uuid references auth.users on delete set null,
  buyer_email text not null,
  buyer_name text not null,
  buyer_company text,
  buyer_phone text,
  message text,
  status text not null default 'requested',
  responded_at timestamptz,
  created_at timestamptz not null default now()
);

create table quotation_items (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references quotations on delete cascade,
  listing_id uuid references listings on delete set null,
  provider_id uuid not null references providers,
  title_snapshot text not null,
  qty int not null check (qty > 0),
  -- Lo llena el proveedor al responder
  quoted_unit_price_cop int
);

-- ---------------------------------------------------------------------------
-- Reseñas
-- ---------------------------------------------------------------------------

create table reviews (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings on delete cascade,
  author_id uuid not null references auth.users on delete cascade,
  -- Solo se puede reseñar lo que se compró
  order_item_id uuid not null references order_items on delete cascade,
  rating int not null check (rating between 1 and 5),
  body text not null default '',
  created_at timestamptz not null default now(),
  unique (order_item_id)
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table profiles enable row level security;
alter table user_roles enable row level security;
alter table providers enable row level security;
alter table provider_members enable row level security;
alter table certifications enable row level security;
alter table provider_certifications enable row level security;
alter table sustainability_assessments enable row level security;
alter table listings enable row level security;
alter table listing_availability enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table quotations enable row level security;
alter table quotation_items enable row level security;
alter table reviews enable row level security;

-- Perfiles: cada quien el suyo
create policy profiles_own on profiles
  for all using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_admin on profiles
  for select using (is_admin());

-- Roles: de solo lectura para el propio usuario. Asignarlos es tarea del
-- service role o de un admin; nadie se autoasciende.
create policy user_roles_read_own on user_roles
  for select using (user_id = auth.uid() or is_admin());
create policy user_roles_admin_write on user_roles
  for all using (is_admin()) with check (is_admin());

-- Proveedores: el público solo ve los aprobados
create policy providers_public_read on providers
  for select using (status = 'approved' or manages_provider(id) or is_admin());
create policy providers_member_update on providers
  for update using (manages_provider(id)) with check (manages_provider(id));
create policy providers_insert on providers
  for insert with check (auth.uid() is not null);
create policy providers_admin_all on providers
  for all using (is_admin()) with check (is_admin());

create policy provider_members_read on provider_members
  for select using (user_id = auth.uid() or manages_provider(provider_id) or is_admin());
create policy provider_members_admin on provider_members
  for all using (is_admin()) with check (is_admin());

-- Catálogo de certificaciones: público
create policy certifications_read on certifications for select using (true);
create policy certifications_admin on certifications
  for all using (is_admin()) with check (is_admin());

-- Certificaciones del proveedor: el documento nunca es público
create policy provider_certs_read on provider_certifications
  for select using (manages_provider(provider_id) or is_admin());
create policy provider_certs_write on provider_certifications
  for insert with check (manages_provider(provider_id));
create policy provider_certs_admin on provider_certifications
  for all using (is_admin()) with check (is_admin());

-- Evaluaciones: el proveedor edita mientras está en borrador; el admin decide
create policy assessments_read on sustainability_assessments
  for select using (manages_provider(provider_id) or is_admin());
create policy assessments_write on sustainability_assessments
  for insert with check (manages_provider(provider_id));
create policy assessments_update_draft on sustainability_assessments
  for update using (manages_provider(provider_id) and status in ('draft', 'rejected'))
  with check (manages_provider(provider_id) and status in ('draft', 'pending_review'));
create policy assessments_admin on sustainability_assessments
  for all using (is_admin()) with check (is_admin());

-- Listings: el público solo ve lo aprobado de proveedores aprobados
create policy listings_public_read on listings
  for select using (
    (status = 'approved' and exists (
      select 1 from providers p where p.id = provider_id and p.status = 'approved'
    ))
    or manages_provider(provider_id)
    or is_admin()
  );
create policy listings_provider_write on listings
  for all using (manages_provider(provider_id)) with check (manages_provider(provider_id));
create policy listings_admin on listings
  for all using (is_admin()) with check (is_admin());

create policy availability_read on listing_availability for select using (true);
create policy availability_write on listing_availability
  for all using (exists (
    select 1 from listings l where l.id = listing_id and manages_provider(l.provider_id)
  ))
  with check (exists (
    select 1 from listings l where l.id = listing_id and manages_provider(l.provider_id)
  ));

-- Órdenes: las ve el comprador, y el proveedor solo las que lo involucran
create policy orders_buyer_read on orders
  for select using (buyer_id = auth.uid() or is_admin());
create policy orders_provider_read on orders
  for select using (exists (
    select 1 from order_items oi
    where oi.order_id = id and manages_provider(oi.provider_id)
  ));
create policy orders_admin on orders
  for all using (is_admin()) with check (is_admin());

create policy order_items_read on order_items
  for select using (
    manages_provider(provider_id)
    or exists (select 1 from orders o where o.id = order_id and o.buyer_id = auth.uid())
    or is_admin()
  );
create policy order_items_admin on order_items
  for all using (is_admin()) with check (is_admin());

-- Cotizaciones: mismo criterio que las órdenes
create policy quotations_read on quotations
  for select using (
    buyer_id = auth.uid()
    or is_admin()
    or exists (
      select 1 from quotation_items qi
      where qi.quotation_id = id and manages_provider(qi.provider_id)
    )
  );
create policy quotations_insert on quotations
  for insert with check (auth.uid() is not null);
create policy quotations_admin on quotations
  for all using (is_admin()) with check (is_admin());

create policy quotation_items_read on quotation_items
  for select using (
    manages_provider(provider_id)
    or exists (select 1 from quotations q where q.id = quotation_id and q.buyer_id = auth.uid())
    or is_admin()
  );
create policy quotation_items_provider_quote on quotation_items
  for update using (manages_provider(provider_id)) with check (manages_provider(provider_id));

-- Reseñas: públicas para leer, y solo escribe quien compró
create policy reviews_public_read on reviews for select using (true);
create policy reviews_author_write on reviews
  for insert with check (
    author_id = auth.uid()
    and exists (
      select 1 from order_items oi
      join orders o on o.id = oi.order_id
      where oi.id = order_item_id and o.buyer_id = auth.uid() and o.status in ('paid', 'fulfilled')
    )
  );
create policy reviews_author_update on reviews
  for update using (author_id = auth.uid()) with check (author_id = auth.uid());
