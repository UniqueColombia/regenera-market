"use client";

import Link from "next/link";
import { useEffect } from "react";
import { RotateCw, TriangleAlert } from "lucide-react";

/**
 * Cuando algo revienta dentro de una página.
 *
 * Next monta este componente en lugar del árbol que falló, **conservando el
 * encabezado y el pie** — o sea que quien llega aquí sigue teniendo la
 * navegación entera. Eso es lo que hace que un error de una página no se sienta
 * como que se cayó el sitio.
 *
 * Tiene que ser cliente: recibe `reset`, que vuelve a montar el árbol sin
 * recargar. Es la primera salida que hay que ofrecer porque el fallo más común
 * aquí es transitorio —la base tardó de más, la red se cortó a mitad— y en ese
 * caso reintentar funciona.
 *
 * ## Lo que NO se enseña
 *
 * `error.message`. En producción Next ya lo sustituye por un texto genérico
 * para no filtrar detalles del servidor, pero aunque no lo hiciera: un mensaje
 * de Postgres con nombres de columnas y de políticas no le sirve a quien lo lee
 * y sí a quien está probando el formulario. Lo que sí se muestra es `digest`,
 * que es el identificador con el que ese error concreto se encuentra en los
 * registros del servidor. Sirve para que alguien pueda decir «me salió este
 * código» y que eso baste para buscarlo.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // A la consola del servidor en producción (Vercel lo recoge), y a la del
    // navegador en desarrollo. Sin esto, un error capturado por este límite
    // desaparece sin dejar rastro.
    console.error("[error]", error.digest ?? "", error.message);
  }, [error]);

  return (
    <div className="container-page max-w-2xl py-20">
      <TriangleAlert className="size-10 text-clay-600" aria-hidden />
      <h1 className="mt-4 font-display text-3xl text-ink">
        Algo se rompió de nuestro lado
      </h1>
      <p className="mt-3 text-muted">
        No es culpa de lo que hiciste. Vuelve a intentarlo: si fue un tropiezo
        pasajero, con esto basta.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={reset}
          className="flex items-center gap-2 rounded-full bg-brand-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 active:bg-brand-700"
        >
          <RotateCw className="size-4" aria-hidden />
          Reintentar
        </button>
        <Link
          href="/"
          className="flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-brand-700 ring-1 ring-control transition hover:bg-sand"
        >
          Ir al inicio
        </Link>
      </div>

      {error.digest && (
        <p className="mt-8 text-xs text-muted">
          Si vuelve a pasar, este es el código del fallo:{" "}
          <code className="rounded bg-sand px-1.5 py-0.5 tabular-nums text-ink">
            {error.digest}
          </code>
        </p>
      )}
    </div>
  );
}
