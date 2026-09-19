import type { Metadata } from "next";
import Link from "next/link";
import { MessagesSquare } from "lucide-react";
import { FormularioPublicacion } from "./formulario-publicacion";
import { HeroBanner } from "@/components/hero-banner";
import { TarjetaPublicacion } from "@/components/tarjeta-publicacion";
import { getSesion } from "@/lib/auth";
import { getCommunityPosts, getEmpresasQueGestiono } from "@/lib/repo";
import { publica } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Comunidad",
  description:
    "Lo que cuentan compradores y proveedores de Seregenera: prácticas que funcionaron, noticias del sector y cómo les fue con sus pedidos.",
  ...publica("/comunidad"),
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
        titulo="Cuéntanos cómo te fue"
      >
        <p className="mt-4 max-w-2xl text-lg text-brand-100">
          ¿Cambiaste algo en tu operación y funcionó? ¿Tienes una duda que
          seguro otro ya resolvió? Este es el lugar para contarlo, preguntar y
          leer lo que están haciendo otros.
        </p>
      </HeroBanner>

      <section className="container-page py-12">
        {sesion ? (
          <FormularioPublicacion empresas={empresas} />
        ) : (
          /* El requisito de tener cuenta va como nota al pie y no como un
             cartel con dos botones grandes. Es una condición mecánica, no lo
             que esta página tiene que decirle a nadie: quien llega viene a
             leer, y se entera de que hay que registrarse cuando le nazcan
             ganas de escribir. Ver la skill `redaccion-producto`. */
          <p className="text-sm text-muted">
            Para escribir aquí hace falta una cuenta.{" "}
            <Link
              href="/registro?volver=%2Fcomunidad"
              className="font-medium text-brand-700 underline underline-offset-4"
            >
              Crea la tuya
            </Link>{" "}
            en un minuto, o{" "}
            <Link
              href="/entrar?volver=%2Fcomunidad"
              className="font-medium text-brand-700 underline underline-offset-4"
            >
              entra
            </Link>{" "}
            si ya la tienes.
          </p>
        )}

        {posts.length === 0 ? (
          /* Vacío con una invitación, no un cartel de «no hay nada». Quien
             llega a un muro y lee «sin publicaciones» se va. */
          <div className="mt-10 rounded-xl bg-sand p-10 text-center">
            <MessagesSquare className="mx-auto size-9 text-brand-600" />
            <h2 className="mt-4 font-display text-xl text-ink">
              Todavía no hay nada por aquí
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted">
              Anímate a escribir lo primero.
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
