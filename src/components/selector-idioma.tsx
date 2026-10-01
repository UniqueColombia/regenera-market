"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Globe } from "lucide-react";

/**
 * Selector de idioma propio, con Google Translate como motor y sin su interfaz.
 *
 * Google solo pone el motor: se monta en un contenedor oculto y esta pieza le
 * dice qué idioma aplicar a través del `<select class="goog-te-combo">` que él
 * mismo genera. El menú, el aspecto y el teclado son nuestros.
 *
 * ## Por qué el script de Google se carga bajo demanda
 *
 * Cargarlo en cada página mandaría la visita de **todos** a Google, hablen
 * español o no, y el sitio tiene un aviso de cookies que promete lo contrario.
 * Solo se pide el script cuando alguien elige un idioma, o cuando ya había
 * elegido uno antes (cookie `googtrans`) y hay que reaplicarlo.
 *
 * ## Las dos trampas que justifican el código de abajo
 *
 * 1. Google envuelve los textos en `<font>` y los mueve. React, al reconciliar,
 *    llama `removeChild` sobre un nodo que ya no está donde él lo dejó y revienta
 *    con «The node to be removed is not a child of this node». `parchearDom`
 *    tolera ese caso. Sin él, navegar traducido tumba la página.
 * 2. Google inyecta una barra superior y empuja el `<body>` con `top: 40px`.
 *    El CSS (`globals.css`) la oculta y el observador devuelve el `top` a 0
 *    cada vez que Google lo reescribe.
 *
 * Para volver al español se borra la cookie y se recarga: es lo único que
 * restaura el DOM original sin dejar `<font>` huérfanos.
 */

const IDIOMAS = [
  { codigo: "es", nombre: "Español" },
  { codigo: "en", nombre: "English" },
  { codigo: "pt", nombre: "Português" },
  { codigo: "fr", nombre: "Français" },
  { codigo: "de", nombre: "Deutsch" },
  { codigo: "it", nombre: "Italiano" },
] as const;

const ORIGINAL = "es";
const CONTENEDOR = "google_translate_element";
const SCRIPT_ID = "google-translate-script";

declare global {
  interface Window {
    googleTranslateElementInit?: () => void;
    google?: {
      translate: {
        TranslateElement: new (
          opciones: Record<string, unknown>,
          id: string,
        ) => unknown;
      };
    };
    __parcheTraductor?: boolean;
  }
}

function idiomaDeCookie(): string {
  const m = document.cookie.match(/(?:^|;\s*)googtrans=\/[^/]*\/([^;]+)/);
  const codigo = m?.[1];
  return IDIOMAS.some((i) => i.codigo === codigo) ? codigo! : ORIGINAL;
}

function borrarCookie() {
  // Google la escribe en el host y, según el entorno, también en el dominio
  // raíz: se borran las dos o el idioma «vuelve» tras recargar.
  const caducada = "googtrans=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  document.cookie = caducada;
  const partes = location.hostname.split(".");
  if (partes.length > 1) {
    document.cookie = `${caducada}; domain=.${partes.slice(-2).join(".")}`;
  }
  document.cookie = `${caducada}; domain=${location.hostname}`;
}

function parchearDom() {
  if (window.__parcheTraductor) return;
  window.__parcheTraductor = true;

  const quitar = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(this: Node, hijo: T): T {
    if (hijo.parentNode !== this) return hijo;
    return quitar.call(this, hijo) as T;
  };

  const insertar = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(
    this: Node,
    nuevo: T,
    ref: Node | null,
  ): T {
    if (ref && ref.parentNode !== this) return nuevo;
    return insertar.call(this, nuevo, ref) as T;
  };
}

function quitarBarraDeGoogle() {
  document
    .querySelectorAll<HTMLElement>(".goog-te-banner-frame, iframe.skiptranslate")
    .forEach((el) => el.style.setProperty("display", "none", "important"));
  if (document.body.style.top && document.body.style.top !== "0px") {
    document.body.style.setProperty("top", "0px", "important");
  }
}

let cargaPendiente: Promise<void> | null = null;

function cargarMotor(): Promise<void> {
  if (window.google?.translate) return Promise.resolve();
  if (cargaPendiente) return cargaPendiente;

  cargaPendiente = new Promise<void>((resolver, rechazar) => {
    window.googleTranslateElementInit = () => {
      new window.google!.translate.TranslateElement(
        {
          pageLanguage: ORIGINAL,
          includedLanguages: IDIOMAS.filter((i) => i.codigo !== ORIGINAL)
            .map((i) => i.codigo)
            .join(","),
          autoDisplay: false,
        },
        CONTENEDOR,
      );
      resolver();
    };
    const s = document.createElement("script");
    s.id = SCRIPT_ID;
    s.async = true;
    s.src =
      "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
    s.onerror = () => {
      cargaPendiente = null;
      rechazar(new Error("No se pudo cargar el traductor"));
    };
    document.head.appendChild(s);
  });
  return cargaPendiente;
}

/** El combo aparece unos instantes después de que el motor avisa que está listo. */
function esperarCombo(): Promise<HTMLSelectElement | null> {
  return new Promise((resolver) => {
    let intentos = 0;
    const t = setInterval(() => {
      const combo = document.querySelector<HTMLSelectElement>(".goog-te-combo");
      if (combo || ++intentos > 40) {
        clearInterval(t);
        resolver(combo);
      }
    }, 100);
  });
}

async function aplicar(codigo: string): Promise<boolean> {
  await cargarMotor();
  const combo = await esperarCombo();
  if (!combo) return false;
  combo.value = codigo;
  combo.dispatchEvent(new Event("change"));
  return true;
}

export function SelectorIdioma() {
  const [actual, setActual] = useState<string>(ORIGINAL);
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [fallo, setFallo] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);

  // Al llegar: si ya había un idioma elegido, se reaplica (y solo entonces se
  // pide el script de Google). Se hace en un efecto y no en el estado inicial
  // porque `document` no existe en el servidor y el HTML debe salir en español.
  useEffect(() => {
    parchearDom();
    const observador = new MutationObserver(quitarBarraDeGoogle);
    observador.observe(document.documentElement, { childList: true, subtree: true });
    observador.observe(document.body, { attributes: true, attributeFilter: ["style"] });

    const guardado = idiomaDeCookie();
    if (guardado !== ORIGINAL) {
      // Microtarea: evita el setState síncrono dentro del efecto.
      queueMicrotask(() => {
        setActual(guardado);
        aplicar(guardado);
      });
    }
    return () => observador.disconnect();
  }, []);

  useEffect(() => {
    if (!abierto) return;
    function fuera(e: PointerEvent) {
      if (!raiz.current?.contains(e.target as Node)) setAbierto(false);
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") setAbierto(false);
    }
    document.addEventListener("pointerdown", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  async function elegir(codigo: string) {
    setAbierto(false);
    if (codigo === actual) return;
    setFallo(false);

    if (codigo === ORIGINAL) {
      borrarCookie();
      location.reload();
      return;
    }

    setCargando(true);
    try {
      const ok = await aplicar(codigo);
      if (ok) setActual(codigo);
      else setFallo(true);
    } catch {
      // Sin red o bloqueado por una extensión: el sitio sigue en español.
      setFallo(true);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div ref={raiz} className="relative">
      {/* Motor de Google, invisible. `translate="no"` para que no se traduzca
          a sí mismo. */}
      <div id={CONTENEDOR} translate="no" className="hidden" />

      <button
        type="button"
        onClick={() => setAbierto(!abierto)}
        aria-expanded={abierto}
        aria-haspopup="listbox"
        aria-label={`Idioma: ${IDIOMAS.find((i) => i.codigo === actual)?.nombre}`}
        className="flex items-center gap-1 rounded-full px-2.5 py-2 text-sm font-medium text-ink transition-colors hover:bg-sand hover:text-brand-700 active:bg-brand-50"
      >
        <Globe
          className={`size-4 ${cargando ? "animate-pulse" : ""}`}
          aria-hidden
        />
        <span translate="no" className="uppercase">
          {actual}
        </span>
        <ChevronDown
          className={`hidden size-3.5 transition-transform sm:block ${abierto ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {abierto && (
        <ul
          role="listbox"
          translate="no"
          className="animate-desplegar absolute right-0 top-full z-50 mt-2 w-44 overflow-hidden rounded-2xl border border-hairline bg-white py-1 shadow-lg motion-reduce:animate-none"
        >
          {IDIOMAS.map((i) => (
            <li key={i.codigo} role="option" aria-selected={i.codigo === actual}>
              <button
                type="button"
                onClick={() => elegir(i.codigo)}
                className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-colors hover:bg-sand ${
                  i.codigo === actual
                    ? "font-medium text-brand-700"
                    : "text-ink"
                }`}
              >
                {i.nombre}
                {i.codigo === actual && <Check className="size-4" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      )}

      {fallo && (
        <p
          role="status"
          className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-hairline bg-white p-3 text-xs text-muted shadow-lg"
        >
          No pudimos cargar el traductor. Revisa tu conexión e inténtalo de nuevo.
        </p>
      )}
    </div>
  );
}
