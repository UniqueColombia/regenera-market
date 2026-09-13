import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { NavAdmin } from "./nav-admin";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = {
  title: { default: "Administración", template: "%s · Administración" },
  robots: { index: false },
};

/**
 * El panel entero, detrás de una sola puerta.
 *
 * **`requireAdmin()` se llama aquí y en ninguna página de dentro.** Con una sola
 * pantalla daba igual dónde estuviera la comprobación; con seis, repetirla es
 * garantizar que un día alguien añada la séptima y se le olvide. Una
 * comprobación copiada en seis sitios es una comprobación que falta en el
 * séptimo.
 *
 * Y sigue siendo **defensa en profundidad, no la defensa**: si alguien llegara
 * aquí sin ser administrador, RLS no le devolvería una sola fila que no le toque
 * y ninguna escritura pasaría. Esto existe para que vea un redirect limpio en
 * vez de pantallas vacías que no entiende.
 *
 * `requireAdmin()` pasa por `requireUser()`, así que un administrador sin
 * contraseña —los que se crean con `scripts/crear-admin.mts`— acaba primero en
 * `/cuenta/clave`. Es a propósito: la cuenta con más poder del sitio no puede
 * ser la única que entra solo con un código de correo.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();

  return (
    <div className="container-page py-10">
      <header>
        <p className="flex items-center gap-2 text-sm font-medium uppercase tracking-[0.2em] text-brand-600">
          <ShieldCheck className="size-4" />
          Administración
        </p>
      </header>

      <NavAdmin />

      {children}
    </div>
  );
}
