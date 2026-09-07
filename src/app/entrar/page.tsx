import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FormularioAcceso } from "./formulario-acceso";
import { getUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Entrar",
  // Una pantalla de acceso no aporta nada en un buscador y sí ruido.
  robots: { index: false },
};

export default async function EntrarPage(props: PageProps<"/entrar">) {
  // Quien ya tiene sesión no tiene nada que hacer aquí.
  if (await getUser()) redirect("/");

  const sp = await props.searchParams;
  const volver = Array.isArray(sp.volver) ? sp.volver[0] : sp.volver;

  return (
    <div className="container-page max-w-md py-16">
      <h1 className="font-display text-3xl text-ink">Entrar</h1>
      <p className="mt-2 text-muted">
        Escribe tu correo y te mandamos un código para entrar.
      </p>
      <FormularioAcceso registro={false} volver={volver} />
    </div>
  );
}
