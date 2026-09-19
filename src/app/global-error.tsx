"use client";

import { useEffect } from "react";
import "./globals.css";

/**
 * El último recurso: cuando lo que falla es el propio layout.
 *
 * `error.tsx` conserva encabezado y pie porque el layout siguió en pie. Aquí no:
 * si lo que reventó fue `RootLayout` —por ejemplo leyendo la sesión—, no hay
 * encabezado que conservar. Por eso este componente **tiene que traer su propio
 * `<html>` y su propio `<body>`**: sustituye al documento entero.
 *
 * Consecuencias de eso, que son la razón de que este archivo se vea distinto a
 * todos los demás:
 *
 * - **No hay fuentes.** Las variables `--font-inter` y `--font-fraunces` las
 *   declara el layout que acaba de fallar, así que `font-display` aquí caería a
 *   la serif del sistema. Se usan las familias por defecto a propósito, en vez
 *   de fingir una tipografía que no cargó.
 * - **Sí hay hoja de estilos.** `globals.css` la emite el build y se importa
 *   aquí directamente, así que los tokens de color siguen existiendo. Por eso
 *   no hay ni un color literal, que es la regla de `diseno-visual`.
 * - **No hay enlaces de `next/link`.** Un `<a>` normal fuerza una carga limpia
 *   del documento, que es justo lo que se quiere cuando el árbol de React se
 *   quedó en un estado imposible.
 *
 * Esta pantalla casi nunca se ve. Existe porque la alternativa —cuando no
 * existe— es la página en blanco del navegador con un mensaje en inglés.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[error-global]", error.digest ?? "", error.message);
  }, [error]);

  return (
    <html lang="es-CO">
      <body className="bg-cream text-ink">
        <div className="mx-auto max-w-xl px-5 py-20">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-brand-600">
            Seregenera
          </p>
          <h1 className="mt-4 text-3xl font-semibold">
            El sitio no pudo cargar
          </h1>
          <p className="mt-3 text-muted">
            Es un fallo nuestro, no de tu conexión. Vuelve a cargar la página; si
            sigue igual, inténtalo dentro de un rato.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={reset}
              className="rounded-full bg-brand-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-700"
            >
              Volver a cargar
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages --
                `<Link>` navega con el enrutador de React, y aquí el árbol de
                React es justo lo que acaba de morir: el enlace se quedaría sin
                hacer nada. Un `<a>` fuerza una carga limpia del documento, que
                es la única salida fiable desde esta pantalla. */}
            <a
              href="/"
              className="rounded-full px-6 py-3 text-sm font-semibold text-brand-700 ring-1 ring-control transition hover:bg-sand"
            >
              Ir al inicio
            </a>
          </div>

          {error.digest && (
            <p className="mt-8 text-xs text-muted">
              Código del fallo:{" "}
              <code className="rounded bg-sand px-1.5 py-0.5">
                {error.digest}
              </code>
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
