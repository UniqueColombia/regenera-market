"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { guardarOferta } from "./actions";
import { CATEGORIES, DEPARTMENTS, KIND_LABEL, VERTICALS, CERTIFICATIONS } from "@/lib/taxonomy";
import type { Listing, ListingKind } from "@/lib/types";

/**
 * El formulario de oferta. Es el más grande del proyecto y tenía que serlo:
 * `listings` tiene campos comunes y campos que solo existen para un tipo.
 *
 * **Las secciones por tipo se muestran según `kind`, y el estado de `kind` vive
 * aquí** — es la única razón por la que esto es un componente de cliente.
 * Enseñar «punto de encuentro» al crear un producto no es un detalle estético:
 * es invitar a llenar un dato que el servidor va a tirar (`guardarOferta` limpia
 * los campos del otro tipo a propósito).
 *
 * El envío arma el objeto a mano en vez de pasar el `FormData` entero porque hay
 * tres cosas que un `Object.fromEntries` deja mal: las casillas múltiples
 * (verticales, certificaciones) pierden todos los valores menos el último, las
 * casillas sueltas llegan como `"on"` o ausentes en vez de booleanas, y las
 * listas por línea necesitan quedarse como texto para que Zod las parta.
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

export function FormularioOferta({
  proveedores,
  oferta,
}: {
  proveedores: ProveedorOpcion[];
  /** Sin oferta, el formulario crea. Con oferta, edita. */
  oferta?: Listing;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<ListingKind>(oferta?.kind ?? "product");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pendiente, iniciar] = useTransition();

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    const datos = {
      id: oferta?.id ?? "",
      providerId: fd.get("providerId"),
      kind: fd.get("kind"),
      title: fd.get("title"),
      slug: fd.get("slug"),
      summary: fd.get("summary"),
      description: fd.get("description"),
      category: fd.get("category"),
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
    };

    iniciar(async () => {
      const r = await guardarOferta(datos);
      if (!r.ok) {
        setErrors(r.errors);
        // El error puede estar arriba del todo y la persona haber enviado desde
        // el final de un formulario largo.
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      setErrors({});
      router.refresh();
      router.push("/admin/ofertas");
    });
  }

  return (
    <form onSubmit={enviar} className="mt-8 space-y-8">
      {errors.form && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-100">
          {errors.form}
        </p>
      )}

      <fieldset className="space-y-4" disabled={pendiente}>
        <legend className="font-display text-xl text-ink">Qué se vende</legend>

        <div className="grid gap-4 sm:grid-cols-2">
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

          <Campo
            label="Tipo"
            error={errors.kind}
            ayuda="Cambia qué campos pide el formulario más abajo."
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
            className={entrada(errors.title)}
          />
        </Campo>

        {oferta && (
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
            defaultValue={oferta?.summary}
            className={entrada(errors.summary)}
          />
        </Campo>

        <Campo label="Descripción" error={errors.description}>
          <textarea
            name="description"
            rows={6}
            defaultValue={oferta?.description}
            className={entrada(errors.description)}
          />
        </Campo>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Categoría" error={errors.category}>
            <select
              name="category"
              defaultValue={oferta?.category ?? ""}
              required
              className={entrada(errors.category)}
            >
              <option value="">Elige…</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Campo>

          <Campo
            label="Unidad"
            error={errors.unit}
            ayuda="«unidad», «kit», «persona», «hora», «mes»…"
          >
            <input
              name="unit"
              defaultValue={oferta?.unit ?? "unidad"}
              required
              className={entrada(errors.unit)}
            />
          </Campo>
        </div>

        <Campo
          label="Verticales a las que sirve"
          ayuda="Son los filtros del menú. Puede ser más de una."
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

        <Campo
          label="Imágenes"
          error={errors.images}
          ayuda="Una dirección por línea. Mientras no haya subida de archivos, van rutas de /public o URLs externas; si se deja vacío, la ficha dibuja un tapiz de color."
        >
          <textarea
            name="images"
            rows={3}
            defaultValue={oferta?.images.join("\n")}
            className={entrada(errors.images)}
          />
        </Campo>
      </fieldset>

      <fieldset className="space-y-4 border-t border-hairline pt-8" disabled={pendiente}>
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
            Las <strong className="font-semibold">fechas con cupo</strong>{" "}
            todavía no se editan desde aquí: viven en la tabla{" "}
            <code>listing_availability</code> y hoy se siembran con el script.
            Mientras no exista esa pantalla, una experiencia nueva se puede
            comprar sin fecha.
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
        <legend className="font-display text-xl text-ink">Impacto y origen</legend>

        <p className="rounded-xl bg-sand p-4 text-sm text-muted">
          Estas cifras son <strong>por unidad</strong> y se multiplican por la
          cantidad en el certificado del comprador. Es mejor dejarlas vacías que
          inventarlas: una cifra sin sustento es lo que convierte el impacto en
          decoración.
        </p>

        <div className="grid gap-4 sm:grid-cols-3">
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
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Departamento" error={errors.department}>
            <select
              name="department"
              defaultValue={oferta?.department ?? ""}
              className={entrada(errors.department)}
            >
              <option value="">El del proveedor</option>
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
          ayuda="Las del proveedor van en su ficha. Estas son las del producto."
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

      <div className="flex flex-wrap items-center gap-3 border-t border-hairline pt-6">
        <button
          type="submit"
          disabled={pendiente}
          className="flex items-center justify-center gap-2 rounded-full bg-brand-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:bg-muted"
        >
          {pendiente && <Loader2 className="size-4 animate-spin" />}
          {oferta ? "Guardar cambios" : "Crear la oferta"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin/ofertas")}
          className="rounded-full px-5 py-3 text-sm text-muted transition hover:bg-sand hover:text-brand-700"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** Clases del control, con el borde rojo cuando el campo trae error. */
function entrada(error?: string): string {
  return `w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 ${
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
