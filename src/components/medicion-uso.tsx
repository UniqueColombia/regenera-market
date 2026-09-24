"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Avisa a `/api/medicion` de cada página vista.
 *
 * **Solo se monta si hay permiso**: lo decide `src/app/layout.tsx` en el
 * servidor leyendo la cookie de consentimiento. Sin permiso, este código ni
 * siquiera llega al navegador.
 *
 * Es cliente porque tiene que enterarse de las navegaciones internas, que en
 * Next no recargan la página y por eso el servidor no las ve.
 *
 * Solo manda la ruta —sin la query, que es donde van las búsquedas— y, en la
 * primera página, de dónde llegó. En las siguientes el origen es el propio
 * sitio y no dice nada.
 *
 * `sendBeacon` y no `fetch` porque sobrevive a que la persona cierre la pestaña
 * justo después, y no compite con la carga de la página.
 */
export function MedicionUso() {
  const pathname = usePathname();
  const ultima = useRef<string | null>(null);

  useEffect(() => {
    // En desarrollo React monta dos veces cada efecto; sin esto cada página
    // contaría doble.
    if (ultima.current === pathname) return;
    const primera = ultima.current === null;
    ultima.current = pathname;

    const cuerpo = JSON.stringify({
      ruta: pathname,
      origen: primera ? document.referrer : "",
    });
    if (!navigator.sendBeacon?.("/api/medicion", cuerpo)) {
      fetch("/api/medicion", { method: "POST", body: cuerpo, keepalive: true }).catch(
        () => {},
      );
    }
  }, [pathname]);

  return null;
}
