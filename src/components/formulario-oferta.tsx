"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import {
  CATEGORIAS,
  CERTIFICATIONS,
  DEPARTMENTS,
  KIND_LABEL,
  VERTICALS,
  categoriaPorId,
} from "@/lib/taxonomy";
import type { Listing, ListingKind } from "@/lib/types";
import { ImagenesOferta } from "./imagenes-oferta";
import type { ResultadoImagenUI } from "./selector-imagen";

/**
 * El formulario de oferta. Es el más grande del proyecto y tenía que serlo:
 * `listings` tiene campos comunes y campos que solo existen para un tipo.
 *
 * **Las secciones por tipo se muestran según `kind`, y el estado de `kind` vive
 * aquí** — es la razón principal por la que esto es un componente de cliente.
 * Enseñar «punto de encuentro» al crear un producto no es un detalle estético:
 * es invitar a llenar un dato que el servidor va a tirar (`filaDeOferta()`
 * limpia los campos del otro tipo a propósito).
 *
 * El envío arma el objeto a mano en vez de pasar el `FormData` entero porque hay
 * tres cosas que un `Object.fromEntries` deja mal: las casillas múltiples
 * (verticales, certificaciones) pierden todos los valores menos el último, las
 * casillas sueltas llegan como `"on"` o ausentes en vez de booleanas, y las
 * listas por línea necesitan quedarse como texto para que Zod las parta.
 *
 * ## Dos modos, un formulario
 *
 * Vivía en `src/app/admin/ofertas/` y lo usaba solo el equipo. Desde el
 * 2026-09-26 lo usa también cada empresa para publicar lo suyo desde
 * `/cuenta/empresa/ofertas`, y por eso está en `src/components/` (dos rutas,
 * regla de `componentizacion`). Lo que cambia con `modo`:
 *
 * - **admin** elige el proveedor, el estado y si se destaca.
 * - **empresa** no ve nada de eso: la oferta es de su empresa, nace en borrador
 *   o en revisión, y la publica el equipo. Lo impone el trigger
 *   `listings_proteger_proveedor` de la 0012; aquí solo no se ofrece. Además,
 *   **lo que aporta y lo que cuesta al ambiente son obligatorios**, y
 *   «Consultoría e implementación» aparece bloqueada si la empresa no tiene la
 *   evaluación verificada.
 *
 * La acción llega por props (`guardar`) en vez de importarse: cada modo tiene
 * la suya, con su propia comprobación de quién puede qué.
 */

const ESTADOS = [
  { value: "draft", label: "Borrador — no se ve en el sitio" },
  { value: "pending_review", label: "Esperando revisión" },
  { value: "approved", label: "Publicada en el catálogo" },
  { value: "rejected", label: "Rechazada" },
  { value: "suspended", label: "Suspendida" },
] as const;

export interface ProveedorOpcion {
  id: string;
  name: string;
  aprobado: boolean;
}

export type ResultadoGuardarOferta =
  | { ok: true; id: string; slug: string }
  | { ok: false; errors: Record<string, string> };

export function FormularioOferta({
  modo = "admin",
  proveedores = [],
  oferta,
  guardar,
  destino,
  verificada = false,
  subirImagen,
}: {
  modo?: "admin" | "empresa";
  proveedores?: ProveedorOpcion[];
  /** Sin oferta, el formulario crea. Con oferta, edita. */
  oferta?: Listing;
  guardar: (datos: unknown) => Promise<ResultadoGuardarOferta>;
  /** A dónde volver al guardar o al cancelar. */
  destino: string;
  /** Solo en modo empresa: ¿tiene la evaluación verificada por Seregenera? */
  verificada?: boolean;
  /** Sube una foto de la oferta y devuelve su URL. Cambia según quién edite. */
  subirImagen: (datos: FormData) => Promise<ResultadoImagenUI>;
}) {
  const formulario = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const esEmpresa = modo === "empresa";
  const [kind, setKind] = useState<ListingKind>(oferta?.kind ?? "product");
  const [categoria, setCategoria] = useState(oferta?.category ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pendiente, iniciar] = useTransition();

  const subcategorias = categoriaPorId(categoria)?.subcategorias ?? [];

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    // Qué botón se pulsó: en modo empresa hay dos —«enviar a revisión» y
    // «guardar borrador»— y `FormData` no incluye el botón por sí solo.
    const boton = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;

    const datos = {
      id: oferta?.id ?? "",
      providerId: fd.get("providerId"),
      kind: fd.get("kind"),
      title: fd.get("title"),
      slug: fd.get("slug"),
      summary: fd.get("summary"),
      description: fd.get("description"),
      category: fd.get("category"),
      subcategory: fd.get("subcategory") ?? "",
      verticals: fd.getAll("verticals"),
      images: fd.get("images"),
      priceCop: fd.get("priceCop"),
      wholesalePriceCop: fd.get("wholesalePriceCop"),
      wholesaleMinQty: fd.get("wholesaleMinQty"),
      unit: fd.get("unit"),
      quoteOnly: fd.get("quoteOnly") === "on",
      stock: fd.get("stock"),
      co2KgSaved: fd.get("co2KgSaved"),
      waterLitersSaved: fd.get("waterLitersSaved"),
      wasteKgReduced: fd.get("wasteKgReduced"),
      aporteAmbiental: fd.get("aporteAmbiental"),
      consecuenciaAmbiental: fd.get("consecuenciaAmbiental"),
      huellaCo2Kg: fd.get("huellaCo2Kg"),
      certifications: fd.getAll("certifications"),
      department: fd.get("department"),
      city: fd.get("city"),
      status: fd.get("status"),
      featured: fd.get("featured") === "on",
      durationHours: fd.get("durationHours"),
      minPeople: fd.get("minPeople"),
      maxPeople: fd.get("maxPeople"),
      meetingPoint: fd.get("meetingPoint"),
      includes: fd.get("includes"),
      deliveryTime: fd.get("deliveryTime"),
      scope: fd.get("scope"),
      enviar: boton?.value === "borrador" ? "borrador" : "revision",
    };

    iniciar(async () => {
      const r = await guardar(datos);
      if (!r.ok) {
        setErrors(r.errors);
        // El error puede estar lejos de donde la persona envió: en un
        // formulario largo, «campos marcados en rojo» sin llevarla al primero
        // la deja buscando. Se lleva la vista al primer campo con error (si no
        // hay ninguno visible, al aviso de arriba).
        requestAnimationFrame(() => {
          const primero = Object.keys(r.errors)
            .map((k) => formulario.current?.querySelector<HTMLElement>(`[name="${k}"]`))
            .find(Boolean);
          if (primero) {
            primero.scrollIntoView({ behavior: "smooth", block: "center" });
            primero.focus({ preventScroll: true });
          } else {
            window.scrollTo({ top: 0, behavior: "smooth" });
          }
        });
        return;
      }
      setErrors({});
      router.refresh();
      router.push(destino);
    });
  }

  const hayErrores = Object.keys(errors).length > 0;
  // Los nombres de los campos con error, para decirlos en el aviso en vez de
  // pedir que se busquen «los marcados en rojo» por todo el formulario.
  const camposConError = Object.keys(errors)
    .filter((k) => k !== "form")
    .map((k) => ETIQUETA_CAMPO[k] ?? k);

  return (
    <form ref={formulario} onSubmit={enviar} className="mt-8 space-y-8">
      {(errors.form || hayErrores) && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-100">
          {errors.form ??
            `Falta corregir ${camposConError.length === 1 ? "este campo" : "estos campos"}: ${camposConError.join(", ")}. Te llevamos al primero.`}
        </p>
      )}

      {/* En pantalla ancha el formulario va en dos columnas: lo que se vende a
          la izquierda, y precio, detalle e impacto a la derecha. En el teléfono
          es una sola columna, en ese mismo orden. */}
      <div className="grid gap-8 lg:grid-cols-2 lg:items-start lg:gap-x-12">
      <div className="space-y-8">
      <fieldset className="space-y-4" disabled={pendiente}>
        <legend className="font-display text-xl text-ink">Qué se vende</legend>

        <div className="grid gap-4 sm:grid-cols-2">
          {!esEmpresa && (
            <Campo label="Proveedor" error={errors.providerId}>
              <select
                name="providerId"
                defaultValue={oferta?.providerId ?? ""}
                required
                className={entrada(errors.providerId)}
              >
                <option value="">Elige…</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {!p.aprobado ? " (sin aprobar)" : ""}
                  </option>
                ))}
              </select>
            </Campo>
          )}

          <Campo
            label="Tipo"
            error={errors.kind}
            ayuda="Producto, experiencia o servicio. Cambia qué campos pide el formulario más abajo."
          >
            <select
              name="kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as ListingKind)}
              className={entrada(errors.kind)}
            >
              {(["product", "experience", "service"] as const).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </Campo>
        </div>

        <Campo label="Título" error={errors.title}>
          <input
            name="title"
            defaultValue={oferta?.title}
            required
            maxLength={140}
            className={entrada(errors.title)}
          />
        </Campo>

        {oferta && !esEmpresa && (
          <Campo
            label="Dirección (slug)"
            error={errors.slug}
            ayuda="Cambiarlo rompe los enlaces que alguien ya tenga guardados. Se cambia si el título estaba mal, no si suena mejor."
          >
            <input name="slug" defaultValue={oferta.slug} className={entrada(errors.slug)} />
          </Campo>
        )}

        <Campo
          label="Resumen"
          error={errors.summary}
          ayuda="Una o dos líneas. Es lo que se lee en la tarjeta del catálogo."
        >
          <textarea
            name="summary"
            rows={2}
            maxLength={300}
            defaultValue={oferta?.summary}
            className={entrada(errors.summary)}
          />
        </Campo>

        <Campo label="Descripción" error={errors.description}>
          <textarea
            name="description"
            rows={6}
            maxLength={5000}
            defaultValue={oferta?.description}
            className={entrada(errors.description)}
          />
        </Campo>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            label="Categoría"
            error={errors.category}
            ayuda={categoriaPorId(categoria)?.descripcion ?? "Qué resuelve lo que vendes."}
          >
            <select
              name="category"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              required
              className={entrada(errors.category)}
            >
              <option value="">Elige…</option>
              {CATEGORIAS.map((c) => {
                // La consultoría exige el sello: una empresa sin él la ve,
                // porque saber que existe es lo que la anima a pedirlo, pero no
                // la puede elegir. La base la rechazaría igual.
                const bloqueada = esEmpresa && c.avanzada && !verificada;
                return (
                  <option key={c.id} value={c.id} disabled={bloqueada}>
                    {c.label}
                    {bloqueada ? " (requiere el sello verificado)" : ""}
                  </option>
                );
              })}
            </select>
          </Campo>

          <Campo
            label="Subcategoría"
            error={errors.subcategory}
            ayuda="Opcional. Ayuda a que te encuentre quien busca algo concreto."
          >
            {/* `key` para que al cambiar de categoría el desplegable se vacíe:
                una subcategoría de «Agua» no tiene sentido en «Energía». */}
            <select
              key={categoria}
              name="subcategory"
              defaultValue={oferta?.category === categoria ? (oferta?.subcategory ?? "") : ""}
              disabled={subcategorias.length === 0}
              className={entrada(errors.subcategory)}
            >
              <option value="">Ninguna en particular</option>
              {subcategorias.map((sc) => (
                <option key={sc.id} value={sc.id}>
                  {sc.label}
                </option>
              ))}
            </select>
          </Campo>
        </div>

        {esEmpresa && categoria === "consultoria" && verificada && (
          <p className="flex items-start gap-2 rounded-xl bg-brand-50 p-4 text-sm text-brand-800 ring-1 ring-brand-100">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
            Tu empresa tiene el sello verificado por Seregenera, así que puedes
            ofrecer consultoría e implementación.
          </p>
        )}

        <Campo
          label="El precio es por…"
          error={errors.unit}
          ayuda="Escribe a qué corresponde el precio. Si cobras $50.000 por cada persona, escribe «persona»; si vendes por kilo, «kilo»; si es una noche de alojamiento, «noche». Se ve en la ficha como «$50.000 / persona»."
        >
          <input
            name="unit"
            list="unidades-sugeridas"
            defaultValue={oferta?.unit ?? "unidad"}
            placeholder="Ej.: unidad, kilo, persona, noche"
            required
            maxLength={40}
            className={entrada(errors.unit)}
          />
          <datalist id="unidades-sugeridas">
            {["unidad", "kilo", "litro", "caja", "kit", "persona", "noche", "hora", "día", "mes", "servicio"].map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </Campo>

        <Campo
          label="Tipos de negocio a los que sirve"
          error={errors.verticals}
          ayuda="Son los filtros del catálogo. Puede ser más de uno."
        >
          <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
            {VERTICALS.map((v) => (
              <label key={v.id} className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  name="verticals"
                  value={v.id}
                  defaultChecked={oferta?.verticals.includes(v.id)}
                  className="size-4 rounded border-control text-brand-700 focus:ring-brand-500"
                />
                {v.label}
              </label>
            ))}
          </div>
        </Campo>

        <div>
          <span className="mb-1 block text-xs font-medium text-muted">Fotos</span>
          <ImagenesOferta
            iniciales={oferta?.images ?? []}
            subir={subirImagen}
            // En administración el proveedor se elige en el propio formulario:
            // la carpeta de la foto es la de ese proveedor.
            datosExtra={() => {
              const f = formulario.current?.elements.namedItem("providerId");
              return f instanceof HTMLSelectElement ? { providerId: f.value } : ({} as Record<string, string>);
            }}
          />
          {errors.images && <span className="mt-1 block text-xs text-red-700">{errors.images}</span>}
        </div>
      </fieldset>

      </div>

      <div className="space-y-8">
      <fieldset className="space-y-4 border-t border-hairline pt-8 lg:border-t-0 lg:pt-0" disabled={pendiente}>
        <legend className="font-display text-xl text-ink">Precio</legend>

        <p className="rounded-xl bg-sand p-4 text-sm text-muted">
          Todo en pesos colombianos enteros, sin centavos ni puntos. La comisión
          de Seregenera sale de lo que recibe el proveedor:{" "}
          <strong className="font-semibold">no se le suma al comprador</strong>,
          así que este es el precio que se ve en la ficha.
        </p>

        <div className="grid gap-4 sm:grid-cols-3">
          <Campo label="Precio al público" error={errors.priceCop}>
            <input
              name="priceCop"
              type="number"
              min={0}
              step={1}
              defaultValue={oferta?.priceCop ?? ""}
              required
              className={entrada(errors.priceCop)}
            />
          </Campo>

          <Campo label="Precio mayorista" error={errors.wholesalePriceCop}>
            <input
              name="wholesalePriceCop"
              type="number"
              min={0}
              step={1}
              defaultValue={oferta?.wholesalePriceCop ?? ""}
              className={entrada(errors.wholesalePriceCop)}
            />
          </Campo>

          <Campo
            label="Desde cuántas unidades"
            error={errors.wholesaleMinQty}
            ayuda="Obligatorio si pusiste precio mayorista."
          >
            <input
              name="wholesaleMinQty"
              type="number"
              min={1}
              step={1}
              defaultValue={oferta?.wholesaleMinQty ?? ""}
              className={entrada(errors.wholesaleMinQty)}
            />
          </Campo>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            label="Stock"
            error={errors.stock}
            ayuda="Vacío = no se lleva inventario de esto."
          >
            <input
              name="stock"
              type="number"
              min={0}
              step={1}
              defaultValue={oferta?.stock ?? ""}
              className={entrada(errors.stock)}
            />
          </Campo>

          <Campo label="Modo de venta">
            <label className="flex items-start gap-2 pt-2 text-sm text-ink">
              <input
                type="checkbox"
                name="quoteOnly"
                defaultChecked={oferta?.quoteOnly}
                className="mt-0.5 size-4 rounded border-control text-brand-700 focus:ring-brand-500"
              />
              <span>
                Solo cotización — no se compra directo y no entra en ningún
                total del carrito.
              </span>
            </label>
          </Campo>
        </div>
      </fieldset>

      {kind === "experience" && (
        <fieldset className="space-y-4 border-t border-hairline pt-8" disabled={pendiente}>
          <legend className="font-display text-xl text-ink">De la experiencia</legend>

          <div className="grid gap-4 sm:grid-cols-3">
            <Campo label="Duración (horas)" error={errors.durationHours}>
              <input
                name="durationHours"
                type="number"
                min={1}
                step={1}
                defaultValue={oferta?.experience?.durationHours ?? ""}
                className={entrada(errors.durationHours)}
              />
            </Campo>
            <Campo label="Mínimo de personas" error={errors.minPeople}>
              <input
                name="minPeople"
                type="number"
                min={1}
                step={1}
                defaultValue={oferta?.experience?.minPeople ?? ""}
                className={entrada(errors.minPeople)}
              />
            </Campo>
            <Campo label="Máximo de personas" error={errors.maxPeople}>
              <input
                name="maxPeople"
                type="number"
                min={1}
                step={1}
                defaultValue={oferta?.experience?.maxPeople ?? ""}
                className={entrada(errors.maxPeople)}
              />
            </Campo>
          </div>

          <Campo label="Punto de encuentro" error={errors.meetingPoint}>
            <input
              name="meetingPoint"
              defaultValue={oferta?.experience?.meetingPoint ?? ""}
              className={entrada(errors.meetingPoint)}
            />
          </Campo>

          <Campo label="Qué incluye" ayuda="Una por línea.">
            <textarea
              name="includes"
              rows={4}
              defaultValue={oferta?.experience?.includes.join("\n")}
              className={entrada()}
            />
          </Campo>

          <p className="rounded-xl bg-clay-100 p-4 text-sm text-clay-700">
            {esEmpresa ? (
              <>
                Las <strong className="font-semibold">fechas con cupo</strong>{" "}
                las cargamos nosotros al revisar tu experiencia: escríbenos cuáles
                quieres abrir y para cuántas personas. Hasta entonces se puede
                reservar sin fecha.
              </>
            ) : (
              <>
                Las <strong className="font-semibold">fechas con cupo</strong>{" "}
                todavía no se editan desde aquí: viven en la tabla{" "}
                <code>listing_availability</code> y hoy se siembran con el script.
                Mientras no exista esa pantalla, una experiencia nueva se puede
                comprar sin fecha.
              </>
            )}
          </p>
        </fieldset>
      )}

      {kind === "service" && (
        <fieldset className="space-y-4 border-t border-hairline pt-8" disabled={pendiente}>
          <legend className="font-display text-xl text-ink">Del servicio</legend>

          <Campo
            label="Tiempo de entrega"
            error={errors.deliveryTime}
            ayuda="«Entrega en 15 días hábiles», «Ciclo de 3 meses»…"
          >
            <input
              name="deliveryTime"
              defaultValue={oferta?.service?.deliveryTime ?? ""}
              className={entrada(errors.deliveryTime)}
            />
          </Campo>

          <Campo label="Alcance" ayuda="Una línea por entregable.">
            <textarea
              name="scope"
              rows={4}
              defaultValue={oferta?.service?.scope.join("\n")}
              className={entrada()}
            />
          </Campo>
        </fieldset>
      )}

      <fieldset className="space-y-4 border-t border-hairline pt-8" disabled={pendiente}>
        <legend className="font-display text-xl text-ink">Impacto ambiental</legend>

        <p className="rounded-xl bg-sand p-4 text-sm text-muted">
          Cuéntalo en las dos direcciones: <strong>lo que aporta</strong> y{" "}
          <strong>lo que cuesta</strong>. Nada de lo que se produce tiene huella
          cero, y una ficha que la declara se lee como información, no como
          publicidad. Las cifras son <strong>por unidad</strong>; es mejor
          dejarlas vacías que inventarlas.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            label={esEmpresa ? "Lo que aporta al ambiente" : "Lo que aporta al ambiente (opcional)"}
            error={errors.aporteAmbiental}
            ayuda="Qué evita, qué regenera o qué devuelve al territorio. Ej.: «Sustituye 40 botellitas plásticas de amenities por cada dispensador»."
          >
            <textarea
              name="aporteAmbiental"
              rows={4}
              maxLength={1000}
              required={esEmpresa}
              defaultValue={oferta?.aporteAmbiental}
              className={entrada(errors.aporteAmbiental)}
            />
          </Campo>
          <Campo
            label={esEmpresa ? "Lo que cuesta al ambiente" : "Lo que cuesta al ambiente (opcional)"}
            error={errors.consecuenciaAmbiental}
            ayuda="Su huella: qué consume, de dónde viene, cómo se transporta, qué queda al final. Ej.: «Se envía por carretera desde Pasto; el envase es de vidrio retornable»."
          >
            <textarea
              name="consecuenciaAmbiental"
              rows={4}
              maxLength={1000}
              required={esEmpresa}
              defaultValue={oferta?.consecuenciaAmbiental}
              className={entrada(errors.consecuenciaAmbiental)}
            />
          </Campo>
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
          <Campo label="CO₂ evitado (kg)" error={errors.co2KgSaved}>
            <input
              name="co2KgSaved"
              type="number"
              step="0.01"
              min={0}
              defaultValue={oferta?.impact.co2KgSaved ?? ""}
              className={entrada(errors.co2KgSaved)}
            />
          </Campo>
          <Campo label="Agua ahorrada (litros)" error={errors.waterLitersSaved}>
            <input
              name="waterLitersSaved"
              type="number"
              step="0.01"
              min={0}
              defaultValue={oferta?.impact.waterLitersSaved ?? ""}
              className={entrada(errors.waterLitersSaved)}
            />
          </Campo>
          <Campo label="Residuos evitados (kg)" error={errors.wasteKgReduced}>
            <input
              name="wasteKgReduced"
              type="number"
              step="0.01"
              min={0}
              defaultValue={oferta?.impact.wasteKgReduced ?? ""}
              className={entrada(errors.wasteKgReduced)}
            />
          </Campo>
          <Campo
            label="Huella de CO₂ (kg)"
            error={errors.huellaCo2Kg}
            ayuda="Lo que emite producir y entregar una unidad, si lo sabes."
          >
            <input
              name="huellaCo2Kg"
              type="number"
              step="0.01"
              min={0}
              defaultValue={oferta?.huellaCo2Kg ?? ""}
              className={entrada(errors.huellaCo2Kg)}
            />
          </Campo>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Departamento" error={errors.department}>
            <select
              name="department"
              defaultValue={oferta?.department ?? ""}
              className={entrada(errors.department)}
            >
              <option value="">{esEmpresa ? "El de mi empresa" : "El del proveedor"}</option>
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </Campo>

          <Campo label="Ciudad o municipio" error={errors.city}>
            <input name="city" defaultValue={oferta?.city ?? ""} className={entrada(errors.city)} />
          </Campo>
        </div>

        <Campo
          label="Certificaciones de esta oferta"
          ayuda={
            esEmpresa
              ? "Las revisamos antes de publicar: ten a mano el documento vigente."
              : "Las del proveedor van en su ficha. Estas son las del producto."
          }
        >
          <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
            {Object.entries(CERTIFICATIONS).map(([code, cert]) => (
              <label key={code} className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  name="certifications"
                  value={code}
                  defaultChecked={oferta?.certifications.includes(code)}
                  className="size-4 rounded border-control text-brand-700 focus:ring-brand-500"
                />
                {cert.label}
              </label>
            ))}
          </div>
        </Campo>
      </fieldset>

      {!esEmpresa && (
        <fieldset className="space-y-4 border-t border-hairline pt-8" disabled={pendiente}>
          <legend className="font-display text-xl text-ink">Publicación</legend>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              label="Estado"
              error={errors.status}
              ayuda="Solo «Publicada» se ve en el catálogo, y únicamente si su proveedor también está aprobado."
            >
              <select
                name="status"
                defaultValue={oferta?.status ?? "draft"}
                className={entrada(errors.status)}
              >
                {ESTADOS.map((e) => (
                  <option key={e.value} value={e.value}>
                    {e.label}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo label="Destacada">
              <label className="flex items-start gap-2 pt-2 text-sm text-ink">
                <input
                  type="checkbox"
                  name="featured"
                  defaultChecked={oferta?.featured}
                  className="mt-0.5 size-4 rounded border-control text-brand-700 focus:ring-brand-500"
                />
                <span>Aparece primero en el catálogo y en la portada.</span>
              </label>
            </Campo>
          </div>
        </fieldset>
      )}

      </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-hairline pt-6">
        <button
          type="submit"
          value="revision"
          disabled={pendiente}
          className="flex items-center justify-center gap-2 rounded-full bg-brand-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:bg-muted"
        >
          {pendiente && <Loader2 className="size-4 animate-spin" />}
          {esEmpresa
            ? "Enviar a revisión"
            : oferta
              ? "Guardar cambios"
              : "Crear la oferta"}
        </button>
        {esEmpresa && (
          <button
            type="submit"
            value="borrador"
            disabled={pendiente}
            className="rounded-full px-5 py-3 text-sm font-semibold text-brand-700 ring-1 ring-control transition hover:bg-sand disabled:opacity-50"
          >
            Guardar como borrador
          </button>
        )}
        <button
          type="button"
          onClick={() => router.push(destino)}
          className="rounded-full px-5 py-3 text-sm text-muted transition hover:bg-sand hover:text-brand-700"
        >
          Cancelar
        </button>
      </div>

      {esEmpresa && (
        <p className="text-xs text-muted">
          La revisamos antes de publicarla —sobre todo las cifras de impacto— y
          te avisamos. Si editas una oferta ya publicada, vuelve a revisión.
        </p>
      )}
    </form>
  );
}

/** Cómo se llama cada campo en pantalla, para nombrarlos en el aviso de errores. */
const ETIQUETA_CAMPO: Record<string, string> = {
  providerId: "Proveedor",
  kind: "Tipo",
  title: "Título",
  slug: "Dirección web",
  summary: "Resumen",
  description: "Descripción",
  category: "Categoría",
  subcategory: "Subcategoría",
  unit: "El precio es por…",
  verticals: "Tipos de negocio",
  images: "Fotos",
  priceCop: "Precio al público",
  wholesalePriceCop: "Precio mayorista",
  wholesaleMinQty: "Desde cuántas unidades",
  stock: "Existencias",
  durationHours: "Duración",
  minPeople: "Mínimo de personas",
  maxPeople: "Máximo de personas",
  meetingPoint: "Punto de encuentro",
  deliveryTime: "Tiempo de entrega",
  aporteAmbiental: "Lo que aporta al ambiente",
  consecuenciaAmbiental: "Lo que cuesta al ambiente",
  co2KgSaved: "CO₂ evitado",
  waterLitersSaved: "Agua ahorrada",
  wasteKgReduced: "Residuos evitados",
  huellaCo2Kg: "Huella de CO₂",
  department: "Departamento",
  city: "Ciudad o municipio",
  status: "Estado",
};

/** Clases del control, con el borde rojo cuando el campo trae error. */
function entrada(error?: string): string {
  return `w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 disabled:bg-sand disabled:text-muted ${
    error ? "border-red-500" : "border-control"
  }`;
}

/**
 * Etiqueta + control + ayuda + error, siempre en el mismo orden.
 *
 * Existe porque el formulario tiene veintitantos campos y repetir la estructura
 * a mano garantiza que a alguno se le olvide la etiqueta o el error. La ayuda va
 * debajo del control y el error la reemplaza: dos textos pequeños en gris uno
 * encima del otro no los lee nadie.
 */
function Campo({
  label,
  error,
  ayuda,
  children,
}: {
  label: string;
  error?: string;
  ayuda?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-red-700">{error}</span>
      ) : ayuda ? (
        <span className="mt-1 block text-xs text-muted">{ayuda}</span>
      ) : null}
    </label>
  );
}
