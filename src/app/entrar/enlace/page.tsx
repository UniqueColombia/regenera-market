import type { Metadata } from "next";
import { LogIn, MailCheck, ShieldCheck } from "lucide-react";
import { MarcoAcceso } from "@/components/marco-acceso";

export const metadata: Metadata = {
  title: "Entrar con el enlace",
  robots: { index: false },
};

/**
 * A donde lleva el enlace de un correo de acceso (`/auth/callback` por GET).
 *
 * **No entra sola: hay que tocar el botón**, que hace POST a `/auth/callback`
 * (desde el 2026-10-22). El porqué está en esa ruta: los escáneres de enlaces
 * solo abren, no tocan botones, y un enlace ajeno no puede meter a nadie en una
 * cuenta que no es la suya sin que lo vea.
 *
 * Los valores van tal cual en campos ocultos; los comprueba la ruta, no esta
 * página.
 */
export default async function EnlacePage(props: PageProps<"/entrar/enlace">) {
  const sp = await props.searchParams;
  const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const tokenHash = uno(sp.token_hash);
  const code = uno(sp.code);
  const tipo = uno(sp.type);
  const next = uno(sp.next);

  return (
    <MarcoAcceso
      etiqueta="Tu cuenta"
      icono={MailCheck}
      titulo="Entrar con el enlace"
      resumen="Toca el botón para entrar con el enlace que te mandamos."
      puntos={[
        { icono: ShieldCheck, texto: "El enlace vale una vez y por una hora." },
        { icono: LogIn, texto: "Si no pediste entrar, cierra esta página: no pasa nada." },
      ]}
    >
      <form method="post" action="/auth/callback">
        {tokenHash && <input type="hidden" name="token_hash" value={tokenHash} />}
        {code && <input type="hidden" name="code" value={code} />}
        {tipo && <input type="hidden" name="type" value={tipo} />}
        {next && <input type="hidden" name="next" value={next} />}
        <button
          type="submit"
          className="flex w-full items-center justify-center gap-2 rounded-full bg-brand-700 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-brand-800"
        >
          <LogIn className="size-4" />
          Entrar
        </button>
      </form>
    </MarcoAcceso>
  );
}
