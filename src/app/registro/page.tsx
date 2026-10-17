import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Package, ShoppingBasket, Store, UserRoundPlus } from "lucide-react";
import { FormularioRegistro } from "./formulario-registro";
import { MarcoAcceso } from "@/components/marco-acceso";
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
    <MarcoAcceso
      etiqueta="Cuenta nueva"
      icono={UserRoundPlus}
      titulo="Crear cuenta"
      resumen="Con una cuenta sigues tus pedidos y, si produces algo regenerativo, puedes postular tu empresa."
      puntos={[
        {
          icono: ShoppingBasket,
          texto: "Compra a proveedores que te cuentan de dónde viene lo que venden.",
        },
        { icono: Package, texto: "Sigue cada pedido desde que pagas hasta que te llega." },
        { icono: Store, texto: "Da de alta tu empresa y publica el mismo día. Publicar es gratis." },
      ]}
    >
      <FormularioRegistro volver={volver} />
    </MarcoAcceso>
  );
}
