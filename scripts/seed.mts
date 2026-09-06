#!/usr/bin/env node
/**
 * Siembra el catálogo semilla en Postgres.
 *
 *   node --env-file=.env.local scripts/seed.mts
 *   node --env-file=.env.local scripts/seed.mts --resumen   (no escribe; solo cuenta)
 *
 * Lee `src/data/providers.ts` y `src/data/listings.ts` —los mismos datos que la
 * aplicación servía de memoria— y los deja en la base. Se queda en el
 * repositorio a propósito: cada entorno nuevo lo vuelve a necesitar.
 *
 * **Es idempotente.** Todo entra por `upsert` contra una clave natural (`slug`,
 * o el par único de las tablas puente), nunca por `insert`. Se va a correr más
 * de una vez —al crear el entorno de producción, al reconstruir una base que se
 * ensució— y correrlo dos veces tiene que dar el mismo resultado que correrlo
 * una.
 *
 * **El orden no es estético:** `certifications` antes que las de cada proveedor
 * porque hay una llave foránea, y los proveedores antes que las ofertas porque
 * `listings.provider_id` es otra.
 *
 * Usa la clave de servicio, así que **se salta RLS**. Es uno de sus tres usos
 * legítimos (importar catálogo, confirmar pagos, asignar roles) — ver la skill
 * `supabase-schema`.
 */

import { createAdminClient } from "../src/lib/supabase/admin.ts";
import { PROVIDERS } from "../src/data/providers.ts";
import { LISTINGS } from "../src/data/listings.ts";
import { CERTIFICATIONS } from "../src/lib/taxonomy.ts";

const soloResumen = process.argv.includes("--resumen");
const db = createAdminClient();

/** Aborta con un mensaje legible en vez de un volcado de PostgrestError. */
function reventar(paso: string, error: { message: string; details?: string | null }): never {
  console.error(`\nFALLO en ${paso}: ${error.message}`);
  if (error.details) console.error(`  ${error.details}`);
  process.exit(1);
}

async function contar(tabla: string): Promise<number> {
  const { count, error } = await db.from(tabla).select("*", { count: "exact", head: true });
  if (error) reventar(`contar ${tabla}`, error);
  return count ?? 0;
}

async function resumen(titulo: string) {
  const tablas = [
    "certifications",
    "providers",
    "provider_certifications",
    "sustainability_assessments",
    "listings",
    "listing_availability",
  ];
  console.log(`\n${titulo}`);
  for (const t of tablas) console.log(`  ${t.padEnd(28)} ${await contar(t)}`);
}

await resumen("Antes:");
if (soloResumen) process.exit(0);

// ---------------------------------------------------------------------------
// 1. Catálogo de certificaciones
//
// `provider_certifications.certification_code` apunta aquí, así que esto va
// primero o la llave foránea rechaza todo lo demás.
// ---------------------------------------------------------------------------
const certificaciones = Object.entries(CERTIFICATIONS).map(([code, c]) => ({
  code,
  label: c.label,
  issuer: c.issuer,
  points: c.points,
}));

{
  const { error } = await db.from("certifications").upsert(certificaciones, { onConflict: "code" });
  if (error) reventar("certifications", error);
  console.log(`\nOK  certifications: ${certificaciones.length}`);
}

// ---------------------------------------------------------------------------
// 2. Proveedores
//
// `sustainability_score` y `tier` NO se escriben aquí, aunque los datos semilla
// los traigan: los escribe el trigger `sustainability_approved` al aprobar una
// evaluación (paso 4). Sembrarlos a mano dejaría la base en un estado que la
// aplicación no sabe producir, y es justo el campo que el proveedor no puede
// tocar por diseño — invariante 13 de la skill `dominio-regenera`.
//
// La clave natural es `slug` y no `id`: en `src/data/` los ids son cadenas como
// "p-aromas-paramo" y en la base son uuid generados. El slug es lo único
// estable entre los dos mundos, y además es lo que va en la URL.
// ---------------------------------------------------------------------------
const filasProveedores = PROVIDERS.map((p) => ({
  slug: p.slug,
  name: p.name,
  legal_name: p.legalName ?? null,
  tax_id: p.taxId ?? null,
  tagline: p.tagline,
  description: p.description,
  logo_url: p.logoUrl ?? null,
  cover_url: p.coverUrl ?? null,
  department: p.department,
  city: p.city,
  website: p.website ?? null,
  email: p.email,
  phone: p.phone ?? null,
  status: p.status,
  founded_year: p.foundedYear ?? null,
  traits: p.traits,
  created_at: p.createdAt,
}));

const { data: proveedoresGuardados, error: eProv } = await db
  .from("providers")
  .upsert(filasProveedores, { onConflict: "slug" })
  .select("id, slug");
if (eProv) reventar("providers", eProv);
console.log(`OK  providers: ${proveedoresGuardados!.length}`);

/** slug → uuid recién asignado por la base. */
const idPorSlug = new Map(proveedoresGuardados!.map((p) => [p.slug, p.id as string]));
/** id viejo de `src/data/` → uuid, para poder resolver `listing.providerId`. */
const uuidPorIdSemilla = new Map(
  PROVIDERS.map((p) => [p.id, idPorSlug.get(p.slug)!] as const),
);

// ---------------------------------------------------------------------------
// 3. Certificaciones de cada proveedor
//
// `verified_at` se rellena porque en los datos semilla las certificaciones ya
// se dan por comprobadas: sin esa fecha no cuentan para el puntaje, y el
// proveedor aparecería con menos puntos de los que su ficha dice.
// ---------------------------------------------------------------------------
const filasCerts = PROVIDERS.flatMap((p) =>
  p.certifications
    // Una certificación que no esté en el catálogo rompería la llave foránea.
    // Mejor avisar que caerse a mitad del seed.
    .filter((code) => {
      if (code in CERTIFICATIONS) return true;
      console.warn(`  aviso: ${p.slug} declara "${code}", que no está en CERTIFICATIONS. Se omite.`);
      return false;
    })
    .map((code) => ({
      provider_id: uuidPorIdSemilla.get(p.id)!,
      certification_code: code,
      verified_at: new Date().toISOString(),
    })),
);

{
  const { error } = await db
    .from("provider_certifications")
    .upsert(filasCerts, { onConflict: "provider_id,certification_code" });
  if (error) reventar("provider_certifications", error);
  console.log(`OK  provider_certifications: ${filasCerts.length}`);
}

// ---------------------------------------------------------------------------
// 4. Evaluaciones aprobadas
//
// Este paso existe solo para disparar el trigger que baja puntaje y nivel al
// proveedor. Es la diferencia entre una base sembrada y una base que la
// aplicación podría haber producido sola.
//
// `answers` y `breakdown` quedan vacíos: los datos semilla traen el puntaje
// final pero no las respuestas que lo produjeron, y no se inventan. Consecuencia
// asumida: estos proveedores de demostración tienen un puntaje que no se puede
// auditar pregunta por pregunta. Los reales sí, porque llegarán por el
// formulario.
//
// La idempotencia aquí no puede ser un upsert —no hay clave natural— así que se
// comprueba antes: si el proveedor ya tiene una evaluación aprobada, se salta.
// Sin esto, cada corrida acumularía una evaluación más.
// ---------------------------------------------------------------------------
const { data: yaEvaluados, error: eYa } = await db
  .from("sustainability_assessments")
  .select("provider_id")
  .eq("status", "approved");
if (eYa) reventar("leer sustainability_assessments", eYa);
const conEvaluacion = new Set((yaEvaluados ?? []).map((a) => a.provider_id as string));

const filasEvaluaciones = PROVIDERS.filter(
  (p) => !conEvaluacion.has(uuidPorIdSemilla.get(p.id)!),
).map((p) => ({
  provider_id: uuidPorIdSemilla.get(p.id)!,
  answers: {},
  breakdown: {},
  score: p.sustainabilityScore,
  tier: p.tier,
  status: "approved" as const,
  submitted_at: p.createdAt,
  reviewed_at: new Date().toISOString(),
}));

if (filasEvaluaciones.length > 0) {
  const { error } = await db.from("sustainability_assessments").insert(filasEvaluaciones);
  if (error) reventar("sustainability_assessments", error);
}
console.log(
  `OK  sustainability_assessments: ${filasEvaluaciones.length} nuevas` +
    (conEvaluacion.size ? `, ${conEvaluacion.size} ya existían` : ""),
);

// ---------------------------------------------------------------------------
// 5. Ofertas
// ---------------------------------------------------------------------------
const filasListings = LISTINGS.map((l) => {
  const providerId = uuidPorIdSemilla.get(l.providerId);
  if (!providerId) {
    console.error(`FALLO: la oferta "${l.slug}" apunta al proveedor "${l.providerId}", que no existe.`);
    process.exit(1);
  }
  return {
    slug: l.slug,
    provider_id: providerId,
    kind: l.kind,
    title: l.title,
    summary: l.summary,
    description: l.description,
    category: l.category,
    verticals: l.verticals,
    images: l.images,
    price_cop: l.priceCop,
    wholesale_price_cop: l.wholesalePriceCop ?? null,
    wholesale_min_qty: l.wholesaleMinQty ?? null,
    unit: l.unit,
    quote_only: l.quoteOnly,
    stock: l.stock ?? null,
    co2_kg_saved: l.impact.co2KgSaved ?? null,
    water_liters_saved: l.impact.waterLitersSaved ?? null,
    waste_kg_reduced: l.impact.wasteKgReduced ?? null,
    certifications: l.certifications,
    department: l.department ?? null,
    city: l.city ?? null,
    status: l.status,
    featured: l.featured,
    duration_hours: l.experience?.durationHours ?? null,
    min_people: l.experience?.minPeople ?? null,
    max_people: l.experience?.maxPeople ?? null,
    meeting_point: l.experience?.meetingPoint ?? null,
    includes: l.experience?.includes ?? null,
    delivery_time: l.service?.deliveryTime ?? null,
    scope: l.service?.scope ?? null,
    created_at: l.createdAt,
  };
});

const { data: listingsGuardados, error: eList } = await db
  .from("listings")
  .upsert(filasListings, { onConflict: "slug" })
  .select("id, slug");
if (eList) reventar("listings", eList);
console.log(`OK  listings: ${listingsGuardados!.length}`);

const idListingPorSlug = new Map(listingsGuardados!.map((l) => [l.slug, l.id as string]));

// ---------------------------------------------------------------------------
// 6. Cupos de las experiencias
//
// El dato semilla es `slotsLeft` (lo que queda) y la base guarda `slots_total` y
// `slots_taken` (lo vendido). Se siembra total = lo que queda y vendido = 0:
// una base recién sembrada no tiene ventas, así que "lo que queda" y "el total"
// coinciden. Si algún día el seed corre sobre una base con reservas hechas, este
// upsert las pisaría — por eso `slots_taken` se deja fuera del update.
// ---------------------------------------------------------------------------
const filasCupos = LISTINGS.flatMap((l) =>
  (l.experience?.availability ?? []).map((a) => ({
    listing_id: idListingPorSlug.get(l.slug)!,
    date: a.date,
    slots_total: a.slotsLeft,
  })),
);

if (filasCupos.length > 0) {
  const { error } = await db
    .from("listing_availability")
    .upsert(filasCupos, { onConflict: "listing_id,date" });
  if (error) reventar("listing_availability", error);
}
console.log(`OK  listing_availability: ${filasCupos.length}`);

// ---------------------------------------------------------------------------
// Comprobación: que el trigger hizo su trabajo
// ---------------------------------------------------------------------------
// No basta con buscar quién quedó en "unverified": hay proveedores semilla que
// deben quedar así —`tejido-wayuu` viene con puntaje 0 y `pending_review` justo
// para ejercitar que el catálogo solo muestra lo aprobado. Lo que se comprueba
// es que la base coincida con el origen, proveedor por proveedor.
const { data: guardados, error: eSin } = await db
  .from("providers")
  .select("slug, sustainability_score, tier");
if (eSin) reventar("comprobar puntajes", eSin);

const porSlug = new Map(guardados!.map((p) => [p.slug as string, p]));
const descuadres = PROVIDERS.filter((p) => {
  const enBase = porSlug.get(p.slug);
  return (
    !enBase ||
    enBase.sustainability_score !== p.sustainabilityScore ||
    enBase.tier !== p.tier
  );
});

if (descuadres.length > 0) {
  console.warn(
    `\nAVISO: ${descuadres.length} proveedores no coinciden con los datos semilla. ` +
      "El trigger sustainability_approved no corrió o la evaluación no quedó aprobada:",
  );
  for (const p of descuadres) {
    const b = porSlug.get(p.slug);
    console.warn(
      `  ${p.slug}: esperado ${p.sustainabilityScore}/${p.tier}, ` +
        `en base ${b ? `${b.sustainability_score}/${b.tier}` : "no existe"}`,
    );
  }
} else {
  console.log("OK  puntaje y nivel de los 13 proveedores coinciden con el origen");
}

await resumen("Después:");
