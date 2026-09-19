"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Cookie } from "lucide-react";
import {
  EVENTO_ABRIR_COOKIES,
  guardarEnNavegador,
  nuevoConsentimiento,
} from "@/lib/consentimiento";

/**
 * El aviso de cookies.
 *
 * ## No parpadea, y eso es una decisión de diseño con consecuencias
 *
 * `yaDecidido` lo calcula el layout en el servidor leyendo la cookie. Si se
 * calculara aquí con un efecto, el aviso aparecería y desaparecería en cada
 * carga para quien ya decidió — el defecto más común de estos banners, y el que
 * hace que la gente los odie.
 *
 * ## Qué se le pregunta a alguien, exactamente
 *
 * Hoy el sitio no mide nada, así que el aviso **informa** de las cookies
 * necesarias y **pregunta** por la medición que todavía no existe. Eso no es
 * pedir permiso de más: es dejar la decisión tomada antes de que haya algo que
 * medir. Lo que no se hace es fingir que ya hay analítica para que el banner se
 * vea más serio.
 *
 * Las dos opciones tienen **el mismo peso visual**. Un «aceptar» verde y grande
 * junto a un «rechazar» gris y pequeño es un patrón oscuro, y además invalida el
 * consentimiento que dice recoger: si hay que esforzarse para decir que no, la
 * respuesta no es libre.
 *
 * ## No bloquea la página
 *
 * Va abajo, fijo, y se puede ignorar. Un modal que tapa el sitio hasta que
 * alguien pulse algo convierte una obligación informativa en un peaje — y aquí
 * no hay nada que esperar, porque ninguna cookie de seguimiento se pone antes de
 * que alguien responda. No hay ninguna que poner.
 */
export function AvisoCookies({ yaDecidido }: { yaDecidido: boolean }) {
  const [visible, setVisible] = useState(!yaDecidido);

  // El enlace «Cookies» del pie vuelve a abrirlo, para que la decisión se pueda
  // cambiar. Sin esta salida, decir que no una vez sería irreversible salvo
  // borrando cookies a mano — que es justo lo que la política promete que no.
  useEffect(() => {
    function abrir() {
      setVisible(true);
    }
    window.addEventListener(EVENTO_ABRIR_COOKIES, abrir);
    return () => window.removeEventListener(EVENTO_ABRIR_COOKIES, abrir);
  }, []);

  if (!visible) return null;

  function decidir(medicion: boolean) {
    guardarEnNavegador(nuevoConsentimiento(medicion));
    setVisible(false);
  }

  return (
    <div
      // `role="region"` y no `dialog`: no atrapa el foco ni bloquea nada, así
      // que anunciarlo como diálogo modal le mentiría a un lector de pantalla.
      role="region"
      aria-label="Aviso de cookies"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-hairline bg-white/95 backdrop-blur"
    >
      <div className="container-page flex flex-col gap-4 py-4 md:flex-row md:items-center">
        <Cookie className="size-6 shrink-0 text-brand-600" aria-hidden />

        <p className="flex-1 text-sm text-muted">
          Usamos cookies para mantener tu sesión abierta y para reconocer los
          dispositivos en los que confías; sin ellas no podrías entrar ni
          comprar. Nos gustaría además medir cómo se usa el sitio, de forma
          agregada y sin identificarte.{" "}
          <Link
            href="/privacidad#cookies"
            className="font-medium text-brand-700 underline underline-offset-4"
          >
            Cuáles son y para qué
          </Link>
          .
        </p>

        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={() => decidir(false)}
            className="rounded-full px-5 py-2.5 text-sm font-semibold text-brand-700 ring-1 ring-control transition hover:bg-sand active:bg-sand"
          >
            Solo las necesarias
          </button>
          <button
            type="button"
            onClick={() => decidir(true)}
            className="rounded-full px-5 py-2.5 text-sm font-semibold text-brand-700 ring-1 ring-control transition hover:bg-sand active:bg-sand"
          >
            Aceptar también la medición
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * El enlace del pie que vuelve a abrir el aviso.
 *
 * Es un botón y no un `<Link>` a propósito: no lleva a ninguna parte, cambia
 * algo en esta misma página. Un enlace que no navega es una promesa rota para
 * quien usa teclado o lector de pantalla.
 */
export function BotonCookies({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(EVENTO_ABRIR_COOKIES))}
      className={className}
    >
      Cookies
    </button>
  );
}
