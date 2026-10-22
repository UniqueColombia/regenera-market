/**
 * Las columnas que `src/lib/repo.ts` le pide a la base para una oferta y para
 * un proveedor, según qué migraciones estén aplicadas.
 *
 * Viven aparte de `repo.ts` para que las pueda importar una prueba:
 * `supabase/pruebas/vista-del-catalogo.test.ts` comprueba que la vista
 * `listings_publicos` y la tabla `listings` tienen **todas** las que el código
 * pide. `repo.ts` no se puede importar desde una prueba de la base, porque trae
 * el cliente de sesión de Next.
 *
 * Esa prueba existe por el 2026-10-14: la 0017 agregó columnas a `listings` sin
 * recrear la vista —que es `l.*`, y Postgres congela el `*` al crearla—, el
 * código las pidió a la vista y el catálogo entero dejó de cargar.
 */

/** Columnas de `listings_publicos`. La vista es `listings.*` más las del proveedor. */
export const COLUMNAS_LISTING_BASE = `
  id, slug, provider_id, kind, title, summary, description, category, verticals,
  images, price_cop, wholesale_price_cop, wholesale_min_qty, unit, quote_only,
  stock, co2_kg_saved, water_liters_saved, waste_kg_reduced, certifications,
  department, city, status, featured, duration_hours, min_people, max_people,
  meeting_point, includes, delivery_time, scope, created_at,
  listing_availability(date, slots_total, slots_taken)
`;

export const COLUMNAS_PROVIDER_BASE = `
  id, slug, name, legal_name, tax_id, tagline, description, logo_url, cover_url,
  department, city, website, email, phone, status, sustainability_score, tier,
  experience_points, sustainability_verified_at, documento_verificado_at, founded_year, traits, created_at,
  provider_certifications(certification_code)
`;

/** Lo que la migración 0012 agrega a cada tabla. */
export const DE_LA_0012_LISTING = "subcategory, aporte_ambiental, consecuencia_ambiental, huella_co2_kg";
export const DE_LA_0012_PROVIDER = "giros";

/** Lo que la 0014 agrega a `listings`: cómo se despacha y la versión de la fila. */
export const DE_LA_0014_LISTING =
  "despacho, transportadora, envio_cop, entrega_dias_min, entrega_dias_max, version";

/**
 * Lo que la 0017 agrega a `listings`: envío por zona y por unidad, peso y
 * medidas. **En la vista solo desde la 0020**, que la recrea.
 */
export const DE_LA_0017_LISTING = "envio_local_cop, envio_adicional_cop, peso_kg, largo_cm, ancho_cm, alto_cm";
