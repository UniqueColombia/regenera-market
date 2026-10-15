"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { ChevronDown, Loader2, ShieldCheck } from "lucide-react";
import {
  CATEGORIAS,
  CERTIFICATIONS,
  DEPARTMENTS,
  KIND_LABEL,
  VERTICALS,
  categoriaPorId,
} from "@/lib/taxonomy";
import { TRANSPORTADORAS } from "@/lib/envios";
import type { Despacho, Listing, ListingKind } from "@/lib/types";
import { CampoDinero } from "./campo-dinero";
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
 *   «Consultoría e implementación» aparece bloqueada si la empresa no tiene la
 *   evaluación verificada.
 *
 * La acción llega por props (`guardar`) en vez de importarse: cada modo tiene
 * la suya, con su propia comprobación de quién puede qué.
 *
 * ## Qué es obligatorio, y que se vea
 *
 * Un formulario de veintitantos campos hace pensar que hay que llenarlos todos,
 * y eso aleja a quien solo quiere vender. Por eso **cada campo obligatorio lleva
 * un `*`** y una línea arriba dice que el resto es opcional. La lista sale del
 * esquema (`CamposOferta` y `reglasDeOferta()` en `src/lib/ofertas.ts`): si se
 * agrega una regla allí, se marca aquí. Los que dependen de otro campo (el
 * envío de un producto que no es solo cotización) se marcan según su estado.
 *
 * **El impacto ambiental es opcional también para las empresas** (Jesús,
 * 2026-10-15): va en un bloque plegado, que se abre solo si la oferta ya trae
 * algo o si un campo suyo falla.
 *
 * ## Maquetación
 *
 * Cada bloque es una tarjeta, no un `fieldset` con borde arriba: con el borde,
 * el navegador dibuja el `legend` encima de la raya («Envío» pegado a una
 * línea). En pantalla ancha van dos columnas de tarjetas —lo que se vende, las
 * fotos y el origen a la izquierda; precio y envío o detalle del tipo a la
 * derecha—, y el impacto ocupa todo el ancho debajo. Así las dos columnas miden
 * casi lo mismo: con el origen a la derecha, la izquierda dejaba un hueco.
 *
 * En el teléfono los envoltorios de columna son `contents` y cada tarjeta lleva
 * su `order`, para que el orden sea el de quien llena (qué se vende, fotos,
 * precio, envío, origen) y no el de las columnas. En pantalla ancha esos
 * `order` no hacen nada: las columnas son bloques, no cuadrículas.
 */

const ESTADOS = [
  { value: "draft", label: "Borrador — no se ve en el sitio" },
  { value: "pending_review", label: "Esperando revisión" },
  { value: "approved", label: "Publicada en el catálogo" },
  { value: "rejected", label: "Rechazada" },
  { value: "suspended", label: "Suspendida" },
] as const;

/** Los campos del bloque de impacto: si uno falla, el bloque se abre. */
const CAMPOS_DE_IMPACTO = [
  "aporteAmbiental",
  "consecuenciaAmbiental",
  "co2KgSaved",
  "waterLitersSaved",
  "wasteKgReduced",
  "huellaCo2Kg",
];

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
  logistica = false,
  zonas = false,
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
  /** ¿Está la 0014? Entonces un producto dice cómo se despacha. */
  logistica?: boolean;
  /** ¿Está la 0017? Entonces dice también la tarifa local, la de cada unidad, peso y medidas. */
  zonas?: boolean;
}) {
  const formulario = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const esEmpresa = modo === "empresa";
  const [kind, setKind] = useState<ListingKind>(oferta?.kind ?? "product");
  const [categoria, setCategoria] = useState(oferta?.category ?? "");
  const [despacho, setDespacho] = useState<Despacho | "">(oferta?.envio?.despacho ?? "");
  const [soloCotizacion, setSoloCotizacion] = useState(oferta?.quoteOnly ?? false);
  // El impacto es opcional: plegado salvo que la oferta ya traiga algo.
  const [impactoAbierto, setImpactoAbierto] = useState(
    !!oferta &&
      !!(
        oferta.aporteAmbiental ||
        oferta.consecuenciaAmbiental ||
        oferta.huellaCo2Kg ||
        oferta.impact.co2KgSaved ||
        oferta.impact.waterLitersSaved ||
        oferta.impact.wasteKgReduced
      ),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pendiente, iniciar] = useTransition();
  // La llave de una oferta nueva: su `id`. Se genera al primer envío y se
  // reutiliza en los reintentos, para que mandar dos veces no cree dos.
  const clave = useRef<string | null>(null);

  const subcategorias = categoriaPorId(categoria)?.subcategorias ?? [];
  // Lo que `reglasDeOferta()` exige a un producto físico que no es solo cotización.
  const envioObligatorio = kind === "product" && logistica && !soloCotizacion;

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
      despacho: fd.get("despacho"),
      transportadora: fd.get("transportadora"),
      envioCop: fd.get("envioCop"),
      entregaDiasMin: fd.get("entregaDiasMin"),
      entregaDiasMax: fd.get("entregaDiasMax"),
      envioLocalCop: fd.get("envioLocalCop"),
      envioAdicionalCop: fd.get("envioAdicionalCop"),
      pesoKg: fd.get("pesoKg"),
      largoCm: fd.get("largoCm"),
      anchoCm: fd.get("anchoCm"),
      altoCm: fd.get("altoCm"),
      // Como texto: el esquema lo convierte con `numeroOpcional`, igual que el
      // resto de números del formulario.
      version: oferta?.version !== undefined ? String(oferta.version) : null,
      clave: oferta ? null : (clave.current ??= crypto.randomUUID()),
      enviar: boton?.value === "borrador" ? "borrador" : "revision",
    };

    iniciar(async () => {
      const r = await guardar(datos);
      if (!r.ok) {
        setErrors(r.errors);
        // Un error en el impacto, que está plegado, no se vería: se abre antes
        // de llevar la vista al campo.
        if (Object.keys(r.errors).some((k) => CAMPOS_DE_IMPACTO.includes(k))) setImpactoAbierto(true);
        // El error puede estar lejos de donde la persona envió: en un
        // formulario largo, «campos marcados en rojo» sin llevarla al primero
        // la deja buscando. Se lleva la vista al primer campo con error (si no
        // hay ninguno visible, al aviso de arriba).
        requestAnimationFrame(() => {
          const primero = Object.keys(r.errors)
            // `data-campo` primero: en `CampoDinero` el `name` lo lleva un
            // campo oculto, que no se puede enfocar ni tiene dónde desplazarse.
            .map((k) =>
              formulario.current?.querySelector<HTMLElement>(
                `[data-campo="${k}"], [name="${k}"]:not([type="hidden"])`,
              ),
            )
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
    <form
      ref={formulario}
      onSubmit={enviar}
      // Un `type="number"` con el foco cambia de valor con la rueda del mouse.
      // En un formulario tan largo se recorre con la rueda, y el stock o los
      // días cambiaban sin que nadie lo viera. Soltar el foco deja pasar el
      // desplazamiento a la página.
      onWheelCapture={(e) => {
        const t = e.target;
        if (t instanceof HTMLInputElement && t.type === "number" && t === document.activeElement) t.blur();
      }}
      className="mt-6 space-y-6"
    >
      {(errors.form || hayErrores) && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-100">
          {errors.form ??
            `Falta corregir ${camposConError.length === 1 ? "este campo" : "estos campos"}: ${camposConError.join(", ")}. Te llevamos al primero.`}
        </p>
      )}

      <p className="text-sm text-muted">
        Lo que lleva <Estrella /> es lo único obligatorio. Todo lo demás es
        opcional: puedes dejarlo para después.
      </p>

      {/* En pantalla ancha, dos columnas de tarjetas: lo que se vende y las
          fotos a la izquierda; precio, envío y origen a la derecha. En el
          teléfono es una sola columna, en ese mismo orden. */}
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="contents lg:block lg:space-y-6">
          <Tarjeta className="order-1">
            <fieldset className="space-y-4" disabled={pendiente}>
              <legend className="font-display text-xl text-ink">Qué se vende</legend>

              {!esEmpresa && (
                <Campo label="Proveedor" error={errors.providerId} requerido>
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

              <div className="grid gap-4 sm:grid-cols-[13rem_minmax(0,1fr)]">
                <Campo
                  label="Tipo"
                  error={errors.kind}
                  ayuda="Cambia lo que pide el formulario."
                  requerido
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

                <Campo label="Título" error={errors.title} requerido>
                  <input
                    name="title"
                    defaultValue={oferta?.title}
                    required
                    maxLength={140}
                    className={entrada(errors.title)}
                  />
                </Campo>
              </div>

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
                  rows={5}
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
                  requerido
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
                  ayuda="Ayuda a que te encuentre quien busca algo concreto."
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
            </fieldset>
          </Tarjeta>

          <Tarjeta className="order-2">
            <fieldset className="space-y-3" disabled={pendiente}>
              <legend className="font-display text-xl text-ink">Fotos</legend>
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
              {errors.images && <span className="block text-xs text-red-700">{errors.images}</span>}
            </fieldset>
          </Tarjeta>

          <Tarjeta className="order-5">
            <fieldset className="space-y-4" disabled={pendiente}>
              <legend className="font-display text-xl text-ink">Origen y certificaciones</legend>

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
          </Tarjeta>
        </div>

        <div className="contents lg:block lg:space-y-6">
          <Tarjeta className="order-3">
            <fieldset className="space-y-4" disabled={pendiente}>
              <legend className="font-display text-xl text-ink">Precio</legend>

              <p className="rounded-xl bg-sand p-3 text-sm text-muted">
                Todo en pesos colombianos, sin centavos. La comisión de Seregenera
                sale de lo que recibe el proveedor:{" "}
                <strong className="font-semibold">no se le suma al comprador</strong>,
                así que este es el precio que se ve en la ficha.
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <Campo label="Precio al público" error={errors.priceCop} requerido>
                  <CampoDinero
                    name="priceCop"
                    defaultValue={oferta?.priceCop}
                    required
                    invalido={!!errors.priceCop}
                    className={entrada(errors.priceCop)}
                  />
                </Campo>

                <Campo
                  label="El precio es por…"
                  error={errors.unit}
                  ayuda="Ej.: persona, kilo, noche. Se ve como «$50.000 / persona»."
                  requerido
                >
                  <input
                    name="unit"
                    list="unidades-sugeridas"
                    defaultValue={oferta?.unit ?? "unidad"}
                    placeholder="unidad, kilo, persona, noche"
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

                <Campo label="Precio mayorista" error={errors.wholesalePriceCop}>
                  <CampoDinero
                    name="wholesalePriceCop"
                    defaultValue={oferta?.wholesalePriceCop}
                    invalido={!!errors.wholesalePriceCop}
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
                      checked={soloCotizacion}
                      onChange={(e) => setSoloCotizacion(e.target.checked)}
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
          </Tarjeta>

          {kind === "product" && logistica && (
            <Tarjeta className="order-4">
              <fieldset className="space-y-4" disabled={pendiente}>
                <legend className="font-display text-xl text-ink">Envío</legend>

                <p className="rounded-xl bg-sand p-3 text-sm text-muted">
                  Tú decides cómo llega: lo llevas tú o lo mandas por la transportadora
                  que prefieras. El comprador paga el envío junto con el pedido y{" "}
                  <strong className="font-semibold">te llega entero, sin comisión</strong>.
                  Cuando lo despaches, cargas la guía en «Pedidos» y el comprador la ve.
                  {soloCotizacion && " Como es solo cotización, aquí no tienes que llenar nada."}
                </p>

                <div>
                  <span className="mb-1 block text-xs font-medium text-muted">
                    ¿Quién lo lleva?
                    {envioObligatorio && <Estrella />}
                  </span>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(
                      [
                        ["vendedor", "Lo llevo yo", "Con tu vehículo, un mensajero o en mano."],
                        ["transportadora", "Por transportadora", "Aveonline, Servientrega, Coordinadora…"],
                      ] as const
                    ).map(([valor, titulo, detalle]) => (
                      <label
                        key={valor}
                        className={`flex cursor-pointer items-start gap-2 rounded-lg p-3 text-sm ring-1 transition ${
                          despacho === valor ? "bg-brand-50 ring-brand-400" : "ring-control hover:bg-sand"
                        }`}
                      >
                        <input
                          type="radio"
                          name="despacho"
                          value={valor}
                          checked={despacho === valor}
                          onChange={() => setDespacho(valor)}
                          className="mt-0.5 size-4 text-brand-700 focus:ring-brand-500"
                        />
                        <span>
                          <span className="block font-medium text-ink">{titulo}</span>
                          <span className="block text-xs text-muted">{detalle}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                  {errors.despacho && <span className="mt-1 block text-xs text-red-700">{errors.despacho}</span>}
                </div>

                {despacho === "transportadora" && (
                  <Campo
                    label="Transportadora"
                    error={errors.transportadora}
                    ayuda="Elige una de la lista o escribe otra."
                    requerido={envioObligatorio}
                  >
                    <input
                      name="transportadora"
                      list="transportadoras-sugeridas"
                      defaultValue={oferta?.envio?.transportadora ?? ""}
                      maxLength={60}
                      className={entrada(errors.transportadora)}
                    />
                    <datalist id="transportadoras-sugeridas">
                      {TRANSPORTADORAS.map((t) => (
                        <option key={t} value={t} />
                      ))}
                    </datalist>
                  </Campo>
                )}

                {/* Con la 0017 el envío depende del destino y de las unidades: la
                    tarifa nacional sigue siendo la obligatoria, y las otras dos solo
                    la afinan. Un proveedor que no las llena cobra como antes. */}
                {zonas && (
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Campo
                      label="Al resto del país"
                      error={errors.envioCop}
                      ayuda="Una unidad, a cualquier destino. 0 = gratis."
                      requerido={envioObligatorio}
                    >
                      <CampoDinero
                        name="envioCop"
                        defaultValue={oferta?.envio?.costoCop}
                        invalido={!!errors.envioCop}
                        className={entrada(errors.envioCop)}
                      />
                    </Campo>
                    <Campo
                      label="Dentro de tu departamento"
                      error={errors.envioLocalCop}
                      ayuda="Si el pedido va al departamento de donde sale (en «Origen y certificaciones»)."
                    >
                      <CampoDinero
                        name="envioLocalCop"
                        defaultValue={oferta?.envio?.costoLocalCop}
                        invalido={!!errors.envioLocalCop}
                        className={entrada(errors.envioLocalCop)}
                      />
                    </Campo>
                    <Campo
                      label="Cada unidad adicional"
                      error={errors.envioAdicionalCop}
                      ayuda="Lo que suma cada unidad después de la primera."
                    >
                      <CampoDinero
                        name="envioAdicionalCop"
                        defaultValue={oferta?.envio?.adicionalCop}
                        invalido={!!errors.envioAdicionalCop}
                        className={entrada(errors.envioAdicionalCop)}
                      />
                    </Campo>
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-3">
                  {!zonas && (
                    <Campo
                      label="Costo del envío"
                      error={errors.envioCop}
                      ayuda="Por pedido, sin importar cuántas unidades. 0 = gratis."
                      requerido={envioObligatorio}
                    >
                      <CampoDinero
                        name="envioCop"
                        defaultValue={oferta?.envio?.costoCop}
                        invalido={!!errors.envioCop}
                        className={entrada(errors.envioCop)}
                      />
                    </Campo>
                  )}
                  <Campo label="Llega desde (días)" error={errors.entregaDiasMin}>
                    <input
                      name="entregaDiasMin"
                      type="number"
                      min={0}
                      max={90}
                      step={1}
                      defaultValue={oferta?.envio?.diasMin ?? ""}
                      className={entrada(errors.entregaDiasMin)}
                    />
                  </Campo>
                  <Campo
                    label="Llega hasta (días)"
                    error={errors.entregaDiasMax}
                    ayuda="Días hábiles después del pago."
                    requerido={envioObligatorio}
                  >
                    <input
                      name="entregaDiasMax"
                      type="number"
                      min={1}
                      max={90}
                      step={1}
                      defaultValue={oferta?.envio?.diasMax ?? ""}
                      className={entrada(errors.entregaDiasMax)}
                    />
                  </Campo>
                </div>

                {zonas && (
                  <div>
                    <p className="text-sm font-medium text-ink">Peso y medidas del paquete</p>
                    <p className="mt-0.5 text-xs text-muted">
                      Opcional. De una unidad ya empacada: es lo que pide una
                      transportadora para cotizar.
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
                      <Campo label="Peso (kg)" error={errors.pesoKg}>
                        <input
                          name="pesoKg"
                          type="number"
                          min={0.01}
                          max={10000}
                          step={0.01}
                          inputMode="decimal"
                          defaultValue={oferta?.envio?.pesoKg ?? ""}
                          className={entrada(errors.pesoKg)}
                        />
                      </Campo>
                      {(
                        [
                          ["largoCm", "Largo (cm)", oferta?.envio?.medidasCm?.largo],
                          ["anchoCm", "Ancho (cm)", oferta?.envio?.medidasCm?.ancho],
                          ["altoCm", "Alto (cm)", oferta?.envio?.medidasCm?.alto],
                        ] as const
                      ).map(([nombre, etiqueta, valor]) => (
                        <Campo key={nombre} label={etiqueta} error={errors[nombre]}>
                          <input
                            name={nombre}
                            type="number"
                            min={1}
                            max={1000}
                            step={1}
                            inputMode="numeric"
                            defaultValue={valor ?? ""}
                            className={entrada(errors[nombre])}
                          />
                        </Campo>
                      ))}
                    </div>
                  </div>
                )}
              </fieldset>
            </Tarjeta>
          )}

          {kind === "experience" && (
            <Tarjeta className="order-4">
              <fieldset className="space-y-4" disabled={pendiente}>
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

                <p className="rounded-xl bg-clay-100 p-3 text-sm text-clay-700">
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
            </Tarjeta>
          )}

          {kind === "service" && (
            <Tarjeta className="order-4">
              <fieldset className="space-y-4" disabled={pendiente}>
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
            </Tarjeta>
          )}
        </div>
      </div>

      {/* El impacto ocupa todo el ancho y va plegado: es opcional, y desplegarlo
          de entrada hace pensar que hay que llenarlo. Los campos siguen en el
          formulario aunque el bloque esté cerrado, así que nada se pierde. */}
      <details
        open={impactoAbierto}
        onToggle={(e) => setImpactoAbierto(e.currentTarget.open)}
        className="group rounded-xl bg-white ring-1 ring-hairline"
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 sm:p-6 [&::-webkit-details-marker]:hidden">
          <span>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-display text-xl text-ink">Impacto ambiental</span>
              <span className="rounded-full bg-sand px-2.5 py-0.5 text-xs font-medium text-muted">Opcional</span>
            </span>
            <span className="mt-1 block text-sm text-muted">
              Cuéntalo solo si quieres destacar lo que tu oferta hace por el ambiente.
            </span>
          </span>
          <ChevronDown
            className="size-5 shrink-0 text-brand-700 transition-transform duration-200 group-open:rotate-180"
            aria-hidden
          />
        </summary>

        <fieldset className="animate-desplegar space-y-4 px-5 pb-6 sm:px-6" disabled={pendiente}>
          <legend className="sr-only">Impacto ambiental</legend>

          <p className="rounded-xl bg-sand p-3 text-sm text-muted">
            Si lo cuentas, cuéntalo en las dos direcciones: <strong>lo que aporta</strong> y{" "}
            <strong>lo que cuesta</strong>. Nada de lo que se produce tiene huella
            cero, y una ficha que la declara se lee como información, no como
            publicidad. Las cifras son <strong>por unidad</strong>; es mejor
            dejarlas vacías que inventarlas.
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            <Campo
              label="Lo que aporta al ambiente"
              error={errors.aporteAmbiental}
              ayuda="Qué evita, qué regenera o qué devuelve al territorio. Ej.: «Sustituye 40 botellitas plásticas de amenities por cada dispensador»."
            >
              <textarea
                name="aporteAmbiental"
                rows={3}
                maxLength={1000}
                defaultValue={oferta?.aporteAmbiental}
                className={entrada(errors.aporteAmbiental)}
              />
            </Campo>
            <Campo
              label="Lo que cuesta al ambiente"
              error={errors.consecuenciaAmbiental}
              ayuda="Su huella: qué consume, de dónde viene, cómo se transporta, qué queda al final. Ej.: «Se envía por carretera desde Pasto; el envase es de vidrio retornable»."
            >
              <textarea
                name="consecuenciaAmbiental"
                rows={3}
                maxLength={1000}
                defaultValue={oferta?.consecuenciaAmbiental}
                className={entrada(errors.consecuenciaAmbiental)}
              />
            </Campo>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
        </fieldset>
      </details>

      {!esEmpresa && (
        <Tarjeta>
          <fieldset className="space-y-4" disabled={pendiente}>
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
        </Tarjeta>
      )}

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
          La revisamos antes de publicarla —sobre todo las cifras de impacto, si
          las pusiste— y te avisamos. Si editas una oferta ya publicada, vuelve
          a revisión.
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
  includes: "Qué incluye",
  deliveryTime: "Tiempo de entrega",
  scope: "Alcance",
  despacho: "Quién lo lleva",
  transportadora: "Transportadora",
  envioCop: "Costo del envío",
  envioLocalCop: "Envío dentro de tu departamento",
  envioAdicionalCop: "Envío por unidad adicional",
  pesoKg: "Peso",
  largoCm: "Largo",
  anchoCm: "Ancho",
  altoCm: "Alto",
  entregaDiasMin: "Llega desde",
  entregaDiasMax: "Llega hasta",
  version: "Versión",
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
// `text-base` en móvil: Safari de iOS amplía la página al tocar un campo de
// menos de 16 px y no la devuelve a su tamaño.
function entrada(error?: string): string {
  return `w-full rounded-lg border bg-white px-3 py-2 text-base sm:text-sm outline-none transition focus:border-brand-500 disabled:bg-sand disabled:text-muted ${
    error ? "border-red-500" : "border-control"
  }`;
}

/**
 * El asterisco de «obligatorio». Va en el terracota del acento y con el texto
 * para lectores de pantalla: un `*` solo no dice nada a quien no lo ve.
 */
function Estrella() {
  return (
    <>
      <span aria-hidden className="ml-0.5 font-semibold text-clay-600">
        *
      </span>
      <span className="sr-only"> (obligatorio)</span>
    </>
  );
}

/**
 * Un bloque del formulario. Es una tarjeta y no un `fieldset` con borde
 * arriba: con el borde, el navegador pinta el `legend` encima de la raya, y la
 * palabra «Envío» quedaba pegada a una línea.
 */
function Tarjeta({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-xl bg-white p-5 ring-1 ring-hairline sm:p-6 ${className}`}>{children}</section>;
}

/**
 * Etiqueta + control + ayuda + error, siempre en el mismo orden.
 *
 * Existe porque el formulario tiene veintitantos campos y repetir la estructura
 * a mano garantiza que a alguno se le olvide la etiqueta o el error. La ayuda va
 * debajo del control y el error la reemplaza: dos textos pequeños en gris uno
 * encima del otro no los lee nadie. `requerido` pone el asterisco.
 */
function Campo({
  label,
  error,
  ayuda,
  requerido = false,
  children,
}: {
  label: string;
  error?: string;
  ayuda?: string;
  requerido?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">
        {label}
        {requerido && <Estrella />}
      </span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-red-700">{error}</span>
      ) : ayuda ? (
        <span className="mt-1 block text-xs text-muted">{ayuda}</span>
      ) : null}
    </label>
  );
}
