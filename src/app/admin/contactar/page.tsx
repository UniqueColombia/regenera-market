import type { Metadata } from "next";
import { Send } from "lucide-react";
import { ImportarProspectos } from "./importar-prospectos";
import { NuevoProspecto } from "./nuevo-prospecto";
import { TablaProspectos } from "./tabla-prospectos";
import { Paginacion } from "@/components/paginacion";
import { getEnviadorCorreo } from "@/lib/correo";
import { leerPagina } from "@/lib/paginacion";
import { ENCAJES, ESTADOS, TOPE_DIARIO, type Encaje, type EstadoProspecto } from "@/lib/prospectos";
import {
  contactarDisponible,
  getProspectos,
  getResumenProspectos,
  type FiltrosProspectos,
} from "@/lib/repo";

export const metadata: Metadata = { title: "Contactar proveedores" };

export const dynamic = "force-dynamic";

/**
 * Contactar proveedores: las empresas que todavía no están en Seregenera, para
 * invitarlas a vender o mandarles noticias, en bloque.
 *
 * Los prospectos se cargan desde una planilla (la que sale del prospector,
 * `outputs/prospectos-proveedores-*.xlsx`, sirve tal cual) o a mano, y viven en
 * la base —nunca en el repositorio; ver la migración 0018—. Desde aquí se les
 * escribe por correo, en lotes y con tope diario, o por WhatsApp, uno a uno.
 */
function uno(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function ContactarPage(props: PageProps<"/admin/contactar">) {
  if (!(await contactarDisponible())) {
    return (
      <div className="mt-8 max-w-2xl rounded-xl bg-white p-6 ring-1 ring-hairline">
        <h1 className="font-display text-2xl text-ink">Contactar proveedores</h1>
        <p className="mt-3 text-muted">
          Falta aplicar la migración{" "}
          <code className="rounded bg-sand px-1.5 py-0.5 text-sm">0018_contactar_proveedores.sql</code>{" "}
          en el editor SQL de Supabase. En cuanto esté, esta pantalla se enciende
          sola en menos de un minuto.
        </p>
      </div>
    );
  }

  const sp = await props.searchParams;
  const estado = uno(sp.estado);
  const encaje = uno(sp.encaje);
  const contacto = uno(sp.contacto);
  const filtros: FiltrosProspectos = {
    estado: estado && (estado in ESTADOS || estado === "baja") ? (estado as EstadoProspecto | "baja") : undefined,
    encaje: encaje && encaje in ENCAJES ? (encaje as Encaje) : undefined,
    contacto: contacto === "correo" || contacto === "telefono" || contacto === "ninguno" ? contacto : undefined,
    q: uno(sp.q)?.slice(0, 100) || undefined,
  };

  const [pagina, resumen] = await Promise.all([
    getProspectos(filtros, leerPagina(sp.pagina)),
    getResumenProspectos(),
  ]);
  const correoListo = getEnviadorCorreo().nombre !== "consola";
  const sitio = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

  const cifras = [
    ["Prospectos", resumen.total],
    ["Con correo", resumen.conCorreo],
    ["Invitados", resumen.invitados],
    ["Interesados", resumen.interesados],
    ["Pidieron la baja", resumen.bajas],
    [`Correos hoy (tope ${TOPE_DIARIO})`, resumen.enviadosHoy],
  ] as const;

  return (
    <div className="mt-8">
      <h1 className="flex items-center gap-2 font-display text-3xl text-ink sm:text-4xl">
        <Send className="size-7 text-brand-600" aria-hidden />
        Contactar proveedores
      </h1>
      <p className="mt-2 max-w-3xl text-muted">
        Las empresas que todavía no venden en Seregenera. Invítalas por correo
        —a varias a la vez— o por WhatsApp, una a una, y sigue en qué quedó cada
        una. Cuando una se da de alta con el mismo correo o NIT, aparece como
        «Ya está en Seregenera».
      </p>

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cifras.map(([etiqueta, valor]) => (
          <div key={etiqueta} className="rounded-xl bg-white p-4 ring-1 ring-hairline">
            <dt className="text-xs text-muted">{etiqueta}</dt>
            <dd className="mt-1 font-display text-2xl tabular-nums text-ink">{valor}</dd>
          </div>
        ))}
      </dl>

      {!correoListo && (
        <p className="mt-5 rounded-xl bg-clay-100 p-4 text-sm text-clay-700 ring-1 ring-clay-300/60">
          <strong className="font-semibold">Los correos todavía no salen:</strong> faltan
          las variables SMTP_* en Vercel (pendiente con Ivan, ver docs/ESTADO.md). Puedes
          preparar la lista e invitar por WhatsApp mientras tanto.
        </p>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <ImportarProspectos />
        <NuevoProspecto />
      </div>

      <form method="get" className="mt-8 flex flex-wrap items-end gap-3 rounded-xl bg-white p-4 ring-1 ring-hairline">
        <label className="block min-w-48 flex-1">
          <span className="mb-1 block text-xs font-medium text-muted">Buscar</span>
          <input
            name="q"
            defaultValue={filtros.q}
            placeholder="Nombre, ciudad, correo, NIT…"
            className="w-full rounded-lg border border-control bg-white px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Estado</span>
          <select name="estado" defaultValue={estado ?? ""} className="rounded-lg border border-control bg-white px-3 py-2 text-sm">
            <option value="">Todos</option>
            {Object.entries(ESTADOS).map(([valor, e]) => (
              <option key={valor} value={valor}>
                {e.texto}
              </option>
            ))}
            <option value="baja">Pidieron la baja</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Encaje</span>
          <select name="encaje" defaultValue={encaje ?? ""} className="rounded-lg border border-control bg-white px-3 py-2 text-sm">
            <option value="">Todos</option>
            {Object.entries(ENCAJES).map(([valor, texto]) => (
              <option key={valor} value={valor}>
                {texto}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Contacto</span>
          <select name="contacto" defaultValue={contacto ?? ""} className="rounded-lg border border-control bg-white px-3 py-2 text-sm">
            <option value="">Cualquiera</option>
            <option value="correo">Con correo</option>
            <option value="telefono">Con teléfono</option>
            <option value="ninguno">Sin correo ni teléfono</option>
          </select>
        </label>
        <button type="submit" className="rounded-full bg-brand-700 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-800">
          Filtrar
        </button>
      </form>

      <TablaProspectos
        filas={pagina.filas}
        total={pagina.total}
        filtros={filtros}
        sitio={sitio}
        correoListo={correoListo}
      />

      <Paginacion ruta="/admin/contactar" params={sp} pagina={pagina.pagina} paginas={pagina.paginas} />
    </div>
  );
}
