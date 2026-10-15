import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { privada } from "@/lib/seo";

export const metadata: Metadata = {
  title: "No recibir más correos",
  ...privada(),
};

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * La baja de los correos de Seregenera a una empresa que no tiene cuenta.
 *
 * Llega aquí quien pulsa «date de baja» en el pie de una invitación. **Pide
 * confirmar con un botón** en vez de dar de baja al abrir la página: los
 * filtros de correo corporativo abren los enlaces para revisarlos, y una baja
 * al abrir daría de baja a empresas que nunca lo pidieron. El botón de Gmail
 * no pasa por aquí: va a `/api/baja`.
 */
async function confirmarBaja(datos: FormData) {
  "use server";
  const token = String(datos.get("t") ?? "");
  if (!UUID.test(token)) redirect("/baja");
  const db = await createClient();
  const { data, error } = await db.rpc("baja_de_prospecto", { _token: token });
  if (error) console.error(`[baja] ${error.code}: ${error.message}`);
  redirect(`/baja?hecho=${data ? "1" : "0"}`);
}

export default async function BajaPage(props: PageProps<"/baja">) {
  const sp = await props.searchParams;
  const token = typeof sp.t === "string" ? sp.t : "";
  const hecho = sp.hecho;

  return (
    <div className="container-page max-w-xl py-16">
      {hecho === "1" ? (
        <>
          <CheckCircle2 className="size-10 text-brand-600" aria-hidden />
          <h1 className="mt-4 font-display text-3xl text-ink">Listo, no te escribiremos más</h1>
          <p className="mt-3 text-muted">
            Tu empresa quedó fuera de nuestros envíos. Si algún día quieres vender
            en Seregenera, puedes darte de alta cuando quieras.
          </p>
          <Link href="/vender" className="mt-6 inline-block text-sm font-semibold text-brand-700 underline">
            Vender en Seregenera
          </Link>
        </>
      ) : hecho === "0" || !UUID.test(token) ? (
        <>
          <h1 className="font-display text-3xl text-ink">No encontramos esa dirección</h1>
          <p className="mt-3 text-muted">
            El enlace está incompleto o ya no existe. Si quieres que dejemos de
            escribirte, contesta cualquiera de nuestros correos con la palabra
            «Baja» y lo hacemos a mano.
          </p>
        </>
      ) : (
        <>
          <h1 className="font-display text-3xl text-ink">¿Dejamos de escribirte?</h1>
          <p className="mt-3 text-muted">
            No volverás a recibir invitaciones ni noticias de Seregenera en este
            correo.
          </p>
          <form action={confirmarBaja} className="mt-6">
            <input type="hidden" name="t" value={token} />
            <button
              type="submit"
              className="rounded-full bg-brand-700 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-800"
            >
              Sí, no quiero recibir más correos
            </button>
          </form>
        </>
      )}
    </div>
  );
}
