import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FormularioAcceso } from "../entrar/formulario-acceso";
import { getUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Crear cuenta",
  robots: { index: false },
};

export default async function RegistroPage(props: PageProps<"/registro">) {
  if (await getUser()) redirect("/");

  const sp = await props.searchParams;
  const volver = Array.isArray(sp.volver) ? sp.volver[0] : sp.volver;

  return (
    <div className="container-page max-w-md py-16">
      <h1 className="font-display text-3xl text-ink">Crear cuenta</h1>
      <p className="mt-2 text-muted">
        Con una cuenta sigues tus pedidos y, si produces algo regenerativo,
        puedes postular tu empresa.
      </p>
      <FormularioAcceso registro volver={volver} />
    </div>
  );
}
