import type { Metadata } from "next";
import Link from "next/link";
import { Cookie, FileText, Mail, ShieldCheck, Sprout } from "lucide-react";
import { BotonCookies } from "@/components/aviso-cookies";
import { CONTACTO, VIGENCIA_PRIVACIDAD, VIGENCIA_TERMINOS } from "@/lib/legal";
import { longDate } from "@/lib/format";
import { descripcion, publica } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Políticas y términos",
  description: descripcion(
    "Todo lo que rige el uso de Seregenera en una sola página: los términos y condiciones, la política de privacidad y cookies, qué datos guardamos y cómo pedir que los borremos.",
  ),
  ...publica("/legal"),
};

/**
 * La puerta de entrada a lo legal.
 *
 * ## Por qué existe una página que solo enlaza a otras dos
 *
 * Porque hasta ahora lo legal solo se alcanzaba desde la barra inferior del pie,
 * en letra pequeña, junto al año y al nombre de la sociedad. Ahí está bien para
 * cumplir —quien lo busca lo busca abajo— pero no para **leerlo**: nadie llega a
 * la política de privacidad de un sitio bajando hasta el final de la portada.
 *
 * Esta página junta las dos en un sitio con nombre propio, las resume en una
 * frase cada una para que se pueda elegir sin abrirlas, y añade lo que no cabe
 * en ninguna de las dos: el aviso de cookies, que no es un documento sino un
 * panel, y a quién se escribe para ejercer un derecho sobre tus datos.
 *
 * ## No repite el contenido, y eso es a propósito
 *
 * Un resumen de un documento legal que vive aparte del documento se desincroniza
 * el día que alguien cambia uno de los dos, y a partir de ahí hay dos versiones
 * de lo que la empresa promete. Aquí solo hay una frase de orientación por
 * documento y la fecha desde la que rige, que sale de `src/lib/legal.ts` — la
 * misma constante que pinta la fecha dentro del documento.
 */

const DOCUMENTOS = [
  {
    href: "/terminos",
    icono: FileText,
    titulo: "Términos y condiciones",
    resumen:
      "Qué papel cumple Seregenera cuando compras o vendes aquí, cómo se cobra la comisión, a qué se compromete un proveedor y qué reglas rigen la Comunidad.",
    vigencia: VIGENCIA_TERMINOS,
  },
  {
    href: "/privacidad",
    icono: ShieldCheck,
    titulo: "Privacidad y cookies",
    resumen:
      "Qué datos tuyos guardamos, para qué, cuánto tiempo, quién más los ve y cómo pedir que los corrijamos o los borremos.",
    vigencia: VIGENCIA_PRIVACIDAD,
  },
] as const;

/**
 * Lo que no es un documento legal pero se busca en el mismo sitio.
 *
 * `/verificacion` y `/niveles` explican cómo se decide qué proveedor aparece y
 * con qué nivel, que es la otra pregunta que trae a alguien a esta parte del
 * sitio: no «qué firmé», sino «cómo deciden ustedes».
 */
const TAMBIEN = [
  {
    href: "/verificacion",
    titulo: "Cómo verificamos a un proveedor",
    resumen: "Qué se comprueba antes de que una empresa aparezca en el catálogo.",
  },
  {
    href: "/niveles",
    titulo: "Cómo se gana el nivel",
    resumen: "Qué suma puntos, cuánto suma cada cosa y qué comisión toca en cada nivel.",
  },
] as const;

export default function LegalPage() {
  return (
    <div className="container-page max-w-4xl py-14">
      <h1 className="font-display text-3xl text-ink sm:text-4xl">
        Conoce nuestras políticas
      </h1>
      <p className="mt-3 max-w-2xl text-lg text-muted">
        Lo que rige el uso de Seregenera, sin que tengas que buscarlo en el pie de
        página. Están escritos para leerse, no para aceptarse sin leer.
      </p>

      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        {DOCUMENTOS.map((doc) => (
          <Link
            key={doc.href}
            href={doc.href}
            className="group flex flex-col rounded-xl bg-white p-6 ring-1 ring-hairline transition hover:shadow-lg hover:shadow-brand-900/5 hover:ring-brand-300"
          >
            <doc.icono className="size-6 text-brand-600" aria-hidden />
            <h2 className="mt-4 font-display text-xl text-ink">{doc.titulo}</h2>
            <p className="mt-2 grow text-sm text-muted">{doc.resumen}</p>
            <p className="mt-4 text-xs text-muted">
              Vigente desde el{" "}
              <time dateTime={doc.vigencia}>{longDate(doc.vigencia)}</time>
            </p>
            <span className="mt-3 text-sm font-medium text-brand-700 underline underline-offset-4">
              Leer
            </span>
          </Link>
        ))}
      </div>

      <section className="mt-10 rounded-xl bg-white p-6 ring-1 ring-hairline">
        <Cookie className="size-6 text-brand-600" aria-hidden />
        <h2 className="mt-4 font-display text-xl text-ink">Tus cookies</h2>
        <p className="mt-2 text-sm text-muted">
          Puedes cambiar lo que aceptaste cuando quieras, y no hace falta que nos
          escribas para hacerlo. Las de sesión y las del aparato de confianza no
          se pueden apagar: sin ellas no se puede entrar ni comprar.
        </p>
        {/* El aviso es un panel, no una página: el botón lo vuelve a abrir. Es
            el mismo componente que el del pie, para que no haya dos formas de
            cambiar la decisión que puedan divergir. */}
        <BotonCookies className="mt-4 inline-flex rounded-full bg-brand-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-brand-700" />
      </section>

      <section className="mt-10 rounded-xl bg-sand p-6 ring-1 ring-hairline">
        <Mail className="size-6 text-brand-700" aria-hidden />
        <h2 className="mt-4 font-display text-xl text-ink">
          Quiero que borren mis datos, o corregir uno
        </h2>
        <p className="mt-2 text-sm text-muted">
          Escríbenos y te contestamos. Puedes pedir ver lo que tenemos tuyo,
          corregirlo, que lo borremos o que dejemos de usarlo — el detalle de cada
          derecho está en la{" "}
          <Link
            href="/privacidad"
            className="font-medium text-brand-700 underline underline-offset-4"
          >
            política de privacidad
          </Link>
          .
        </p>
        <a
          href={`mailto:${CONTACTO.correo}`}
          className="mt-4 inline-flex text-sm font-medium text-brand-700 underline underline-offset-4"
        >
          {CONTACTO.correo}
        </a>
      </section>

      <section className="mt-12 border-t border-hairline pt-8">
        <h2 className="font-display text-xl text-ink">
          <Sprout className="mr-2 inline size-5 text-brand-600" aria-hidden />
          Cómo decidimos
        </h2>
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {TAMBIEN.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="font-medium text-brand-700 underline underline-offset-4"
              >
                {item.titulo}
              </Link>
              <p className="mt-1 text-sm text-muted">{item.resumen}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
