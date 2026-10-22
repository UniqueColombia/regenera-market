import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { FormularioClave } from "./formulario-clave";
import { enRecuperacion, requireUser } from "@/lib/auth";
import { rutaPropia } from "@/lib/ruta-propia";

export const metadata: Metadata = {
  title: "Tu contraseña",
  robots: { index: false },
};

/**
 * Poner o cambiar la contraseña.
 *
 * A esta pantalla se llega de dos maneras muy distintas y la página no las
 * distingue más que en el texto:
 *
 * - **Voluntariamente**, desde `/cuenta`, para cambiarla.
 * - **Recuperando**, después de entrar solo con el código a una cuenta que tiene
 *   contraseña: la olvidó. No se le pide la actual (`src/lib/pase.ts`).
 * - **Empujado**, justo después de entrar con código sin tener contraseña. Es lo
 *   que convierte «ahora hay contraseñas» en algo que ocurre de verdad, en vez
 *   de en una casilla que nadie marca: las cuentas que existían antes y las que
 *   crea un administrador pasan por aquí la primera vez que entran.
 */
export const dynamic = "force-dynamic";

export default async function ClavePage(props: PageProps<"/cuenta/clave">) {
  const user = await requireUser("/cuenta/clave");
  const sp = await props.searchParams;
  const volver = Array.isArray(sp.volver) ? sp.volver[0] : sp.volver;

  const meta = user.user_metadata as { full_name?: string; tiene_clave?: boolean } | null;
  const yaTenia = meta?.tiene_clave === true;
  const recuperacion = yaTenia && (await enRecuperacion(user.id));

  return (
    <div className="container-page max-w-md py-16">
      <p className="flex items-center gap-2 text-sm font-medium uppercase tracking-[0.2em] text-brand-600">
        <KeyRound className="size-4" />
        Tu cuenta
      </p>

      <h1 className="mt-3 font-display text-3xl text-ink">
        {recuperacion ? "Pon una contraseña nueva" : yaTenia ? "Cambiar tu contraseña" : "Crea tu contraseña"}
      </h1>

      <p className="mt-2 text-muted">
        {recuperacion
          ? "Entraste con el código de tu correo. Elige una contraseña nueva: cerramos las demás sesiones y los otros dispositivos te volverán a pedir el código."
          : yaTenia
          ? "Escribe la actual y la nueva. Cerramos las demás sesiones y los otros dispositivos te volverán a pedir el código."
          : "Tu cuenta todavía entra solo con código. Ponte una contraseña y la próxima vez entras directo; el código quedará para cuando accedas desde un dispositivo nuevo."}
      </p>

      <FormularioClave
        yaTenia={yaTenia && !recuperacion}
        email={user.email ?? ""}
        nombre={meta?.full_name ?? ""}
        volver={volver}
      />

      {recuperacion && (
        <p className="mt-6 text-center text-sm">
          <Link
            href={rutaPropia(volver) ?? "/"}
            className="text-muted underline underline-offset-4 hover:text-brand-700"
          >
            Seguir sin cambiarla
          </Link>
        </p>
      )}
    </div>
  );
}
