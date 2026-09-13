import type { Metadata } from "next";
import { KeyRound } from "lucide-react";
import { FormularioClave } from "./formulario-clave";
import { requireUser } from "@/lib/auth";

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

  return (
    <div className="container-page max-w-md py-16">
      <p className="flex items-center gap-2 text-sm font-medium uppercase tracking-[0.2em] text-brand-600">
        <KeyRound className="size-4" />
        Tu cuenta
      </p>

      <h1 className="mt-3 font-display text-3xl text-ink">
        {yaTenia ? "Cambiar tu contraseña" : "Crea tu contraseña"}
      </h1>

      <p className="mt-2 text-muted">
        {yaTenia
          ? "Escribe la actual y la nueva. Los dispositivos en los que ya confías siguen confiando."
          : "Tu cuenta todavía entra solo con código. Ponte una contraseña y la próxima vez entras directo; el código quedará para cuando accedas desde un dispositivo nuevo."}
      </p>

      <FormularioClave
        yaTenia={yaTenia}
        email={user.email ?? ""}
        nombre={meta?.full_name ?? ""}
        volver={volver}
      />
    </div>
  );
}
