"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, Sprout } from "lucide-react";
import { submitApplication } from "./actions";
import { PAISES, TIPOS_ORGANIZACION, paisPorNombre } from "@/lib/paises";
import { VERTICALS } from "@/lib/taxonomy";

/**
 * Postulación de proveedor, en tres pasos.
 *
 * ## Por qué tres pasos y no una lista larga
 *
 * El formulario pasó de ocho campos a trece: para dar de alta a la empresa en el
 * acto hacen falta el país, la forma jurídica, la identificación tributaria y el
 * consentimiento de datos. Trece campos de una sola tirada en un teléfono es una
 * pantalla que se abandona — la guía de formularios lo llama «no abrumar de
 * entrada», y aquí se nota más porque quien llena esto está decidiendo si entra
 * o no.
 *
 * Partido en tres, cada paso cabe sin desplazarse y tiene un asunto claro: quién
 * eres, cómo te encontramos, qué vendes.
 *
 * ## Los dos detalles que no son decoración
 *
 * **Se avanza sin validar contra el servidor.** La validación de verdad es la de
 * `submitApplication` con zod, que corre al final. Los pasos solo comprueban lo
 * que el navegador ya sabe (`checkValidity`), para no mandar a alguien al paso 3
 * con el correo vacío del paso 2.
 *
 * **Todos los campos viven montados todo el tiempo**, solo se ocultan con
 * `hidden`. Desmontarlos vaciaría lo escrito al volver atrás, y un `FormData`
 * del formulario entero sigue funcionando en el último paso sin llevar estado a
 * mano. El precio es que el navegador intenta validar campos ocultos al enviar:
 * por eso el `<form>` lleva `noValidate` y la comprobación por paso se hace a
 * mano.
 */

const PASOS = [
  { titulo: "Tu organización", detalle: "Quién eres y cómo estás constituido" },
  { titulo: "Contacto", detalle: "Dónde estás y cómo te escribimos" },
  { titulo: "Qué vendes", detalle: "Lo que va a ver un comprador" },
] as const;

/** Qué campo pertenece a qué paso, para poder saltar al error que devuelva el servidor. */
const PASO_DE_CAMPO: Record<string, number> = {
  name: 0,
  orgType: 0,
  country: 0,
  taxId: 0,
  contactName: 1,
  email: 1,
  phone: 1,
  department: 1,
  city: 1,
  website: 1,
  categories: 2,
  description: 2,
  consent: 2,
};

export function ApplicationForm() {
  const [paso, setPaso] = useState(0);
  const [pais, setPais] = useState(PAISES[0].nombre);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [hecho, setHecho] = useState<{
    activada: boolean;
    slug?: string;
    correoEnviado: boolean;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  const formRef = useRef<HTMLFormElement>(null);

  /**
   * Marca de cuándo se pintó el formulario, para la trampa de tiempo del
   * servidor.
   *
   * Se escribe en el DOM desde un efecto, y no se guarda en estado. Las dos
   * cosas son a propósito: `Date.now()` durante el render es impuro —un render
   * tiene que poder repetirse dando lo mismo— y un `setState` dentro de un
   * efecto vuelve a renderizar el formulario entero para un campo oculto que
   * nadie mira. `FormData` lo lee del elemento al enviar, así que con ponerlo
   * ahí basta.
   *
   * Hasta que el efecto corre, el campo va vacío. El servidor lo trata como «no
   * se pudo medir» y deja pasar: ninguna persona manda el formulario antes de
   * que hidrate, y un robot que no ejecute JavaScript tampoco lo habría
   * rellenado.
   */
  useEffect(() => {
    const campo = formRef.current?.elements.namedItem("abiertoEn");
    if (campo instanceof HTMLInputElement) campo.value = String(Date.now());
  }, []);

  const paisElegido = paisPorNombre(pais);
  const ultimo = paso === PASOS.length - 1;

  /** ¿Los campos visibles de este paso pasan la validación del navegador? */
  function pasoValido(): boolean {
    const form = formRef.current;
    if (!form) return true;
    const campos = form.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >(`[data-paso="${paso}"]`);
    for (const campo of campos) {
      if (!campo.checkValidity()) {
        campo.reportValidity();
        return false;
      }
    }
    return true;
  }

  function siguiente() {
    if (!pasoValido()) return;
    setPaso((p) => Math.min(p + 1, PASOS.length - 1));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ultimo) return siguiente();
    if (!pasoValido()) return;

    const fd = new FormData(e.currentTarget);
    const datos = {
      ...Object.fromEntries(fd),
      // `getAll` porque son casillas con el mismo nombre; `Object.fromEntries`
      // se queda solo con la última y perdería todas las demás categorías.
      categories: fd.getAll("categories").map(String),
    };

    startTransition(async () => {
      const resultado = await submitApplication(datos);
      if (resultado.ok) {
        setErrors({});
        setHecho({
          activada: resultado.activada,
          slug: resultado.slug,
          correoEnviado: resultado.correoEnviado,
        });
        return;
      }
      setErrors(resultado.errors);
      // Al primer campo con error, aunque esté en otro paso. Sin esto, un error
      // en el correo deja al usuario mirando el paso 3 sin nada marcado en rojo.
      const primero = Object.keys(resultado.errors).find((k) => k in PASO_DE_CAMPO);
      if (primero) setPaso(PASO_DE_CAMPO[primero]);
    });
  }

  if (hecho) return <Listo {...hecho} />;

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      noValidate
      className="rounded-xl bg-white p-6 ring-1 ring-hairline"
    >
      <Progreso paso={paso} />

      <input type="hidden" name="abiertoEn" />

      {/* Campo trampa: ningún humano lo ve, y un robot que rellena todo lo
          escribe. `aria-hidden` y `tabIndex={-1}` para que tampoco lo encuentre
          quien navegue con teclado o con lector de pantalla. */}
      <div aria-hidden className="absolute left-[-9999px] top-0 h-0 w-0 overflow-hidden">
        <label htmlFor="sitioWeb2">No llenar</label>
        <input id="sitioWeb2" name="sitioWeb2" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {/* ---------------------------------------------------------------- 1 */}
      <fieldset hidden={paso !== 0} disabled={pending} className="mt-6 space-y-4">
        <legend className="sr-only">Tu organización</legend>

        <Campo
          paso={0}
          name="name"
          label="Nombre de tu empresa, cooperativa o comunidad"
          autoComplete="organization"
          error={errors.name}
          required
        />

        <Select
          paso={0}
          name="orgType"
          label="¿Qué tipo de organización eres?"
          error={errors.orgType}
          opciones={TIPOS_ORGANIZACION.map((t) => ({ valor: t.id, texto: t.label }))}
          ayuda="Un artesano que factura a su nombre también puede vender aquí."
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            paso={0}
            name="country"
            label="País"
            error={errors.country}
            valor={pais}
            onChange={setPais}
            opciones={PAISES.map((p) => ({ valor: p.nombre, texto: p.nombre }))}
            sinVacio
          />
          <Campo
            paso={0}
            name="taxId"
            /* La etiqueta cambia con el país: en Colombia dice NIT, en Perú RUC,
               en México RFC. Decirle «RUT» a todo el mundo es lo que hacía que
               este formulario se leyera como colombiano —o peor, chileno. */
            label={`${paisElegido.documento} de tu organización`}
            error={errors.taxId}
            required
            ayuda={
              paisElegido.codigo === "XX"
                ? "El número con el que facturas en tu país."
                : `Tu identificación tributaria en ${paisElegido.nombre}.`
            }
          />
        </div>
      </fieldset>

      {/* ---------------------------------------------------------------- 2 */}
      <fieldset hidden={paso !== 1} disabled={pending} className="mt-6 space-y-4">
        <legend className="sr-only">Contacto</legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            paso={1}
            name="contactName"
            label="Tu nombre"
            autoComplete="name"
            error={errors.contactName}
            required
          />
          <Campo
            paso={1}
            name="email"
            label="Correo"
            type="email"
            autoComplete="email"
            error={errors.email}
            required
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            paso={1}
            name="phone"
            label="Teléfono o WhatsApp"
            type="tel"
            autoComplete="tel"
            error={errors.phone}
            required
          />
          <Campo
            paso={1}
            name="department"
            /* Departamento en Colombia, Región en Chile y Perú, Estado en
               México. La palabra sale de la tabla de países. */
            label={paisElegido.division}
            error={errors.department}
            required
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            paso={1}
            name="city"
            label="Ciudad o municipio"
            error={errors.city}
            required
          />
          <Campo
            paso={1}
            name="website"
            label="Sitio web o red social (opcional)"
            type="url"
            placeholder="https://"
            error={errors.website}
          />
        </div>
      </fieldset>

      {/* ---------------------------------------------------------------- 3 */}
      <fieldset hidden={paso !== 2} disabled={pending} className="mt-6 space-y-5">
        <legend className="sr-only">Qué vendes</legend>

        <div>
          <p className="mb-2 block text-xs font-medium text-muted">
            ¿A quién le sirve lo que vendes? (elige las que apliquen)
          </p>
          <div className="flex flex-wrap gap-2">
            {VERTICALS.map((v) => (
              <label
                key={v.id}
                className="group cursor-pointer rounded-full ring-1 ring-hairline transition has-[:checked]:bg-brand-50 has-[:checked]:ring-brand-400 hover:ring-brand-300"
              >
                <input
                  type="checkbox"
                  name="categories"
                  value={v.id}
                  data-paso={2}
                  className="peer sr-only"
                />
                <span className="block px-3.5 py-2 text-sm text-muted transition peer-checked:font-medium peer-checked:text-brand-700">
                  {v.label}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label
            htmlFor="description"
            className="mb-1 block text-xs font-medium text-muted"
          >
            ¿Qué produces y por qué es regenerativo?
          </label>
          <textarea
            id="description"
            name="description"
            data-paso={2}
            rows={6}
            required
            minLength={120}
            maxLength={2000}
            placeholder="Qué vendes, de qué está hecho, quién lo produce y qué deja en el territorio. Este texto es el que va a leer un hotel en tu ficha, así que escríbelo para él."
            aria-invalid={errors.description ? true : undefined}
            className={`w-full rounded-lg border px-3 py-2 text-sm leading-relaxed outline-none transition focus:border-brand-500 ${
              errors.description ? "border-red-600" : "border-control"
            }`}
          />
          <p className="mt-1 text-xs text-muted">
            Mínimo 120 caracteres. Es el primer párrafo de tu ficha pública.
          </p>
          {errors.description && (
            <p className="mt-1 text-xs font-medium text-red-700">
              {errors.description}
            </p>
          )}
        </div>

        <div className="rounded-lg bg-sand p-4">
          <label className="flex cursor-pointer items-start gap-3 text-sm text-ink">
            <input
              type="checkbox"
              name="consent"
              data-paso={2}
              required
              className="mt-0.5 size-4 shrink-0 accent-brand-700"
            />
            <span>
              Autorizo a Seregenera a tratar mis datos personales para gestionar
              mi postulación y mi cuenta de proveedor, conforme a la Ley 1581 de
              2012.{" "}
              <Link
                href="/verificacion"
                className="text-brand-700 underline underline-offset-2"
              >
                Cómo usamos tus datos
              </Link>
              .
            </span>
          </label>
          {errors.consent && (
            <p className="mt-2 text-xs font-medium text-red-700">{errors.consent}</p>
          )}
        </div>
      </fieldset>

      {errors.form && (
        <p
          role="alert"
          className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-800 ring-1 ring-red-200"
        >
          {errors.form}
        </p>
      )}

      <div className="mt-7 flex items-center gap-3">
        {paso > 0 && (
          <button
            type="button"
            onClick={() => setPaso((p) => p - 1)}
            disabled={pending}
            className="flex items-center gap-1.5 rounded-full px-4 py-3 text-sm font-semibold text-muted transition hover:bg-sand hover:text-ink active:bg-sand"
          >
            <ArrowLeft className="size-4" />
            Atrás
          </button>
        )}

        <button
          type="submit"
          disabled={pending}
          className="flex flex-1 items-center justify-center gap-2 rounded-full bg-brand-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-800 active:bg-brand-800 disabled:bg-muted"
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          {ultimo ? "Crear mi cuenta de proveedor" : "Continuar"}
          {!ultimo && <ArrowRight className="size-4" />}
        </button>
      </div>
    </form>
  );
}

/**
 * Indicador de paso.
 *
 * Es el «paso 2 de 3» que pide la guía de formularios: sin él, quien llena un
 * formulario partido no sabe si le quedan dos campos o veinte, y esa
 * incertidumbre es la que hace abandonar.
 */
function Progreso({ paso }: { paso: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-lg text-ink">{PASOS[paso].titulo}</h3>
        <span className="shrink-0 text-xs font-medium tabular-nums text-muted">
          Paso {paso + 1} de {PASOS.length}
        </span>
      </div>
      <p className="mt-0.5 text-sm text-muted">{PASOS[paso].detalle}</p>

      <div
        className="mt-4 flex gap-1.5"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={PASOS.length}
        aria-valuenow={paso + 1}
        aria-label={`Paso ${paso + 1} de ${PASOS.length}`}
      >
        {PASOS.map((p, i) => (
          <span
            key={p.titulo}
            className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
              i <= paso ? "bg-brand-600" : "bg-hairline"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Lo que se ve al terminar.
 *
 * **Dos desenlaces distintos, dos pantallas distintas.** Quien postuló con
 * sesión ya tiene su empresa creada y no está esperando nada: decirle «te
 * responderemos pronto» sería mentirle y, peor, dejarlo sin hacer lo único que
 * tiene que hacer ahora, que es publicar. Quien postuló sin cuenta sí tiene un
 * paso pendiente, y la pantalla es ese paso.
 */
function Listo({
  activada,
  slug,
  correoEnviado,
}: {
  activada: boolean;
  slug?: string;
  correoEnviado: boolean;
}) {
  return (
    <div className="animate-desplegar rounded-xl bg-brand-50 p-8 text-center ring-1 ring-brand-200 motion-reduce:animate-none">
      {activada ? (
        <Sprout className="mx-auto size-10 text-brand-600" />
      ) : (
        <CheckCircle2 className="mx-auto size-10 text-brand-600" />
      )}

      <h3 className="mt-4 font-display text-2xl text-brand-900">
        {activada ? "Ya estás dentro" : "Recibimos tu postulación"}
      </h3>

      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-brand-800">
        {activada ? (
          <>
            Tu ficha ya existe y entras como <strong>Semilla</strong>. No hay
            nada que aprobar: puedes publicar lo que vendes desde hoy, y tu nivel
            —y con él tu comisión— mejora según vendas y entregues.
          </>
        ) : (
          <>
            Guardamos lo que nos contaste. Falta un solo paso: crea tu cuenta con
            el mismo correo que escribiste y tu empresa queda activa en el acto.
            No revisamos ni aprobamos nada.
          </>
        )}
      </p>

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {activada ? (
          <>
            {slug && (
              <Link
                href={`/proveedor/${slug}`}
                className="rounded-full bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800 active:bg-brand-800"
              >
                Ver mi ficha
              </Link>
            )}
            <Link
              href="/niveles"
              className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-brand-800 ring-1 ring-brand-200 transition hover:bg-brand-50"
            >
              Cómo subo de nivel
            </Link>
          </>
        ) : (
          <Link
            href="/registro"
            className="rounded-full bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800 active:bg-brand-800"
          >
            Crear mi cuenta
          </Link>
        )}
      </div>

      {/* Solo se promete un correo si de verdad salió. Un «te escribimos» que no
          se cumple es peor que no decir nada: la persona espera en vez de
          actuar. */}
      {correoEnviado && (
        <p className="mt-5 text-xs text-brand-800/80">
          Te mandamos una copia de todo esto por correo.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Campos
// ---------------------------------------------------------------------------

function Campo({
  paso,
  name,
  label,
  type = "text",
  error,
  required,
  placeholder,
  autoComplete,
  ayuda,
}: {
  paso: number;
  name: string;
  label: string;
  type?: string;
  error?: string;
  required?: boolean;
  placeholder?: string;
  autoComplete?: string;
  ayuda?: string;
}) {
  const idAyuda = ayuda ? `${name}-ayuda` : undefined;
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-xs font-medium text-muted">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        data-paso={paso}
        required={required}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={idAyuda}
        className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition focus:border-brand-500 ${
          error ? "border-red-600" : "border-control"
        }`}
      />
      {ayuda && (
        <p id={idAyuda} className="mt-1 text-xs text-muted">
          {ayuda}
        </p>
      )}
      {error && <p className="mt-1 text-xs font-medium text-red-700">{error}</p>}
    </div>
  );
}

function Select({
  paso,
  name,
  label,
  opciones,
  error,
  valor,
  onChange,
  ayuda,
  sinVacio,
}: {
  paso: number;
  name: string;
  label: string;
  opciones: { valor: string; texto: string }[];
  error?: string;
  valor?: string;
  onChange?: (v: string) => void;
  ayuda?: string;
  sinVacio?: boolean;
}) {
  const idAyuda = ayuda ? `${name}-ayuda` : undefined;
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-xs font-medium text-muted">
        {label}
      </label>
      <select
        id={name}
        name={name}
        data-paso={paso}
        required
        aria-describedby={idAyuda}
        aria-invalid={error ? true : undefined}
        {...(valor !== undefined
          ? { value: valor, onChange: (e) => onChange?.(e.target.value) }
          : { defaultValue: "" })}
        className={`w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 ${
          error ? "border-red-600" : "border-control"
        }`}
      >
        {!sinVacio && (
          <option value="" disabled>
            Elige…
          </option>
        )}
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </select>
      {ayuda && (
        <p id={idAyuda} className="mt-1 text-xs text-muted">
          {ayuda}
        </p>
      )}
      {error && <p className="mt-1 text-xs font-medium text-red-700">{error}</p>}
    </div>
  );
}
