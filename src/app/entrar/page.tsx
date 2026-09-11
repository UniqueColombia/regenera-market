import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FormularioAcceso } from "./formulario-acceso";
import { getUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Entrar",
  // Una pantalla de acceso no aporta nada en un buscador y sí ruido.
  robots: { index: false },
};

/**
 * Lo que `/auth/callback` puede mandar aquí cuando el enlace del correo falla.
 *
 * Se traduce a mensaje en esta pantalla y no en la ruta: el `?error=` viaja por
 * la barra de direcciones, y meter ahí la frase la deja a merced de cualquiera
 * que arme una URL. La clave se contrasta contra esta tabla; lo que no esté,
 * cae en el genérico.
 */
const ERRORES: Record<string, string> = {
  "sin-codigo": "Ese enlace no trae código. Pide uno nuevo con tu correo.",
  "codigo-invalido":
    "El enlace no es válido o ya venció. Pide uno nuevo con tu correo.",
  desconocido: "No pudimos entrar con ese enlace. Prueba de nuevo.",
};

export default async function EntrarPage(props: PageProps<"/entrar">) {
  // Quien ya tiene sesión no tiene nada que hacer aquí.
  if (await getUser()) redirect("/");

  const sp = await props.searchParams;
  const volver = Array.isArray(sp.volver) ? sp.volver[0] : sp.volver;
  const error = Array.isArray(sp.error) ? sp.error[0] : sp.error;

  return (
    <div className="container-page max-w-md py-16">
      <h1 className="font-display text-3xl text-ink">Entrar</h1>
      <p className="mt-2 text-muted">
        Escribe tu correo y te mandamos un código para entrar.
      </p>
      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-100"
        >
          {ERRORES[error] ?? ERRORES.desconocido}
        </p>
      )}
      <FormularioAcceso registro={false} volver={volver} />
    </div>
  );
}
