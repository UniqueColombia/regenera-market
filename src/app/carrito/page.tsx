import { Cesta, type Comprador } from "./cesta";
import { getSesion, getUser } from "@/lib/auth";
import { getEmpresasQueGestiono } from "@/lib/repo";

/**
 * La cesta, con quién compra ya resuelto.
 *
 * La cesta en sí es cliente —vive en `localStorage`— y está en `cesta.tsx`.
 * Esta página existe para lo que el navegador no puede saber solo: si hay
 * sesión, cómo se llama la persona y en nombre de qué empresas puede comprar.
 * Pedirlo desde el cliente con una acción aparte haría parpadear el panel de
 * «entra para confirmar» a «confirma tu pedido» en cada carga.
 *
 * `force-dynamic` por lo mismo que el resto de páginas con sesión: la respuesta
 * depende de quién la pide y no se puede guardar en caché.
 */
export const dynamic = "force-dynamic";

export default async function CarritoPage() {
  const sesion = await getSesion();
  let comprador: Comprador | null = null;

  if (sesion) {
    const [user, empresas] = await Promise.all([getUser(), getEmpresasQueGestiono()]);
    const telefono = user?.user_metadata?.phone;
    comprador = {
      nombre: sesion.nombre,
      email: sesion.email,
      telefono: typeof telefono === "string" ? telefono : undefined,
      empresas,
    };
  }

  return <Cesta comprador={comprador} />;
}
