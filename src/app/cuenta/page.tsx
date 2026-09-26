import type { Metadata } from "next";
import Link from "next/link";
import { Building2, KeyRound, Receipt, ShieldCheck, UserRound } from "lucide-react";
import { Dispositivos, type DispositivoVisible } from "./dispositivos";
import { guardarFoto, quitarFoto } from "./actions";
import { ProgresoNivel } from "@/components/progreso-nivel";
import { SelectorImagen } from "@/components/selector-imagen";
import { getSesion, requireUser } from "@/lib/auth";
import { getMiEmpresa } from "@/lib/repo";
import { getPedidosDe } from "@/lib/orders";
import { COLOR_ESTADO, ETIQUETA_ESTADO } from "@/lib/order-status";
import { longDate, money } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { hashDispositivo, leerIdDispositivo } from "@/lib/dispositivos";
import { mostrarTelefono } from "@/lib/telefono";

export const metadata: Metadata = {
  title: "Tu cuenta",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

/**
 * La cuenta de quien mira: sus datos, su contraseña y los dispositivos en los
 * que no se le vuelve a pedir el código.
 *
 * El nombre y el teléfono salen de `profiles` y no de los metadatos del usuario.
 * Son el mismo dato escrito dos veces —el trigger `handle_new_user` lo copia—,
 * pero `profiles` es el que puede leer el resto de la aplicación por RLS, y el
 * que un día editará esta misma pantalla.
 *
 * La foto vive solo en `profiles.avatar_url` (migración 0008) y no se duplica en
 * los metadatos: el encabezado no la pinta, y duplicar un dato que hay que
 * mantener en dos sitios se paga el día que alguien actualiza uno solo.
 */
export default async function CuentaPage() {
  const user = await requireUser("/cuenta");
  const sesion = await getSesion();
  const supabase = await createClient();

  const { data: perfil } = await supabase
    .from("profiles")
    .select("full_name, phone, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  // Sin `.eq("user_id", ...)`: la política `trusted_devices_own` ya limita la
  // consulta a los del usuario. Escribir el filtro a mano aquí sería pedirle al
  // código que garantice lo que garantiza la base — y el día que se olvide en
  // otra consulta, ahí sí habría fuga.
  const { data: aparatos } = await supabase
    .from("trusted_devices")
    .select("id, label, last_seen_at, created_at, device_hash")
    .order("last_seen_at", { ascending: false });

  // `getMiEmpresa()` sale de `provider_members` y pasa por RLS: quien no
  // gestione ninguna recibe `undefined` y el bloque del nivel no se pinta. No se
  // mira `sesion.esProveedor` — el rol dice que alguien vende, no de qué
  // empresa, y son dos preguntas distintas.
  const [empresa, pedidos] = await Promise.all([getMiEmpresa(), getPedidosDe(user.id)]);

  const idActual = await leerIdDispositivo();
  const hashActual = idActual ? hashDispositivo(idActual) : null;

  const items: DispositivoVisible[] = (aparatos ?? []).map((d) => ({
    id: d.id,
    label: d.label,
    lastSeenAt: d.last_seen_at,
    createdAt: d.created_at,
    esEste: hashActual !== null && d.device_hash === hashActual,
  }));

  const tieneClave = user.user_metadata?.tiene_clave === true;

  return (
    <div className="container-page max-w-2xl py-12">
      <p className="flex items-center gap-2 text-sm font-medium uppercase tracking-[0.2em] text-brand-600">
        <UserRound className="size-4" />
        Tu cuenta
      </p>
      <h1 className="mt-3 font-display text-3xl text-ink">
        {perfil?.full_name || sesion?.nombre}
      </h1>

      <div className="mt-6 rounded-xl bg-white p-5 ring-1 ring-hairline">
        <SelectorImagen
          nombre={perfil?.full_name || sesion?.nombre || "Tu cuenta"}
          imagenUrl={perfil?.avatar_url ?? undefined}
          forma="redonda"
          guardar={guardarFoto}
          quitar={quitarFoto}
          ayuda="Te identifica en lo que publicas en la Comunidad. La recortamos a cuadrado desde el centro."
        />
      </div>

      <dl className="mt-6 grid gap-3 rounded-xl bg-white p-5 ring-1 ring-hairline sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium text-muted">Correo</dt>
          <dd className="text-sm text-ink">{user.email}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted">Teléfono</dt>
          <dd className="text-sm text-ink">
            {mostrarTelefono(perfil?.phone) || "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted">Qué puedes hacer</dt>
          {/* **Nadie deja de ser comprador por vender.** Antes esto decía
              «Proveedor» a secas para quien tuviera el rol, y era falso en lo
              práctico: un hotel que además vende sus excedentes sigue pudiendo
              comprar, y lo hace. Decir «Proveedor» le sugería que esa parte del
              sitio ya no era para él.

              Y se decide por la empresa, no por el rol. `user_roles` dice que
              alguien vende; `provider_members` dice **de qué empresa** — y sin
              empresa no hay nada que vender, aunque el rol esté puesto. */}
          <dd className="text-sm text-ink">
            {empresa ? "Comprar y vender" : "Comprar"}
            {sesion?.esAdmin && " · Administración"}
          </dd>
        </div>
      </dl>

      {sesion?.esAdmin && (
        <Link
          href="/admin"
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800"
        >
          <ShieldCheck className="size-4" />
          Ir al panel de administración
        </Link>
      )}

      {empresa && (
        <section className="mt-10">
          <h2 className="font-display text-xl text-ink">Tu empresa</h2>
          <div className="mt-3 rounded-xl bg-white p-6 ring-1 ring-hairline">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 font-display text-lg text-ink">
                <Building2 className="size-4 text-brand-600" aria-hidden />
                {empresa.name}
              </p>
            </div>
            <div className="mt-4">
              <ProgresoNivel puntos={empresa.experiencePoints} compacto />
            </div>
          </div>
        </section>
      )}

      {/* Lo que compraste. Es el sitio donde queda registrado cada pedido
          después de confirmarlo, y desde donde se vuelve a las instrucciones
          de pago sin buscar el correo. */}
      <section id="pedidos" className="mt-10 scroll-mt-24">
        <h2 className="font-display text-xl text-ink">Tus pedidos</h2>
        {pedidos.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            Todavía no has comprado nada.{" "}
            <Link
              href="/catalogo"
              className="font-medium text-brand-700 underline underline-offset-4"
            >
              Mira el catálogo
            </Link>
            .
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-hairline rounded-xl bg-white ring-1 ring-hairline">
            {pedidos.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/orden/${o.reference}`}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-4 transition hover:bg-sand"
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 font-mono text-sm text-ink">
                      <Receipt className="size-4 text-brand-600" aria-hidden />
                      {o.reference}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted">
                      {longDate(o.createdAt)} ·{" "}
                      {o.items.map((i) => i.titleSnapshot).join(", ")}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${COLOR_ESTADO[o.status]}`}
                    >
                      {ETIQUETA_ESTADO[o.status]}
                    </span>
                    <span className="font-display text-base tabular-nums text-ink">
                      {money(o.totalCop)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl text-ink">Contraseña</h2>
        <div className="mt-3 flex flex-col gap-3 rounded-xl bg-white p-5 ring-1 ring-hairline sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted">
            {tieneClave
              ? "Tu cuenta tiene contraseña."
              : "Tu cuenta todavía entra solo con código. Ponerte una contraseña hace el acceso más rápido."}
          </p>
          <Link
            href="/cuenta/clave"
            className="flex shrink-0 items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-brand-700 ring-1 ring-control transition hover:bg-sand"
          >
            <KeyRound className="size-4" />
            {tieneClave ? "Cambiarla" : "Crear contraseña"}
          </Link>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl text-ink">Dispositivos de confianza</h2>
        <p className="mt-1 text-sm text-muted">
          En estos no te pedimos el código de seis dígitos. Si usaste un
          computador prestado, quítalo de aquí.
        </p>
        <Dispositivos items={items} />
      </section>
    </div>
  );
}
