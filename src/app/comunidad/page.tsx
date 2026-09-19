import type { Metadata } from "next";
import Link from "next/link";
import { MessagesSquare } from "lucide-react";
import { FormularioPublicacion } from "./formulario-publicacion";
import { HeroBanner } from "@/components/hero-banner";
import { TarjetaPublicacion } from "@/components/tarjeta-publicacion";
import { getSesion } from "@/lib/auth";
import { getCommunityPosts, getEmpresasQueGestiono } from "@/lib/repo";

export const metadata: Metadata = {
  title: "Comunidad",
  description:
    "Lo que cuentan compradores y proveedores de Seregenera: prácticas que funcionaron, noticias del sector y cómo les fue con sus pedidos.",
};

/** Por lo mismo que la portada: un muro congelado en el build no es un muro. */
export const dynamic = "force-dynamic";

export default async function ComunidadPage() {
  const sesion = await getSesion();

  // Las empresas solo se piden si hay sesión: sin ella la consulta devolvería
  // vacío por RLS igualmente, y es un viaje a la base por nada.
  const [posts, empresas] = await Promise.all([
    getCommunityPosts(30),
    sesion ? getEmpresasQueGestiono() : Promise.resolve([]),
  ]);

  return (
    <div>
      <HeroBanner
        foto="/img/secciones/hero-verificacion.webp"
        encuadreMovil="object-[50%_50%]"
        encabezado={
          <>
            <MessagesSquare className="size-4" />
            Comunidad
          </>
        }
        titulo="Lo que cuenta quien ya lo hizo"
      >
        <p className="mt-4 max-w-2xl text-lg text-brand-100">
          Compradores y proveedores comparten aquí lo que les funcionó, lo que
          no, y lo que está pasando en el sector. Escribe quien tenga cuenta.
        </p>
      </HeroBanner>

      <section className="container-page py-12">
        {sesion ? (
          <FormularioPublicacion empresas={empresas} />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-white p-6 ring-1 ring-hairline">
            <p className="text-sm text-muted">
              Para publicar necesitas una cuenta. Leer no la necesita.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/registro?volver=%2Fcomunidad"
                className="rounded-full bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800 active:bg-brand-800"
              >
                Crear cuenta
              </Link>
              <Link
                href="/entrar?volver=%2Fcomunidad"
                className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-brand-800 ring-1 ring-brand-200 transition hover:bg-brand-50 active:bg-brand-50"
              >
                Entrar
              </Link>
            </div>
          </div>
        )}

        {posts.length === 0 ? (
          /* Vacío con una propuesta, no un cartel de «no hay nada». Quien llega
             a un muro sin entradas y lee «sin publicaciones» se va; quien lee
             que puede ser el primero, a veces escribe. */
          <div className="mt-10 rounded-xl bg-sand p-10 text-center">
            <MessagesSquare className="mx-auto size-9 text-brand-600" />
            <h2 className="mt-4 font-display text-xl text-ink">
              Todavía no hay nada por aquí
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted">
              Sé el primero en contar algo. Lo que publiques abre la sección para
              los que vengan detrás.
            </p>
          </div>
        ) : (
          <ul className="mt-10 grid gap-5 lg:grid-cols-2">
            {posts.map((post) => (
              <li key={post.id}>
                <TarjetaPublicacion post={post} haySesion={Boolean(sesion)} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
