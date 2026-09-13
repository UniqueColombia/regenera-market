import type { Metadata } from "next";
import { FilaUsuario } from "./fila-usuario";
import { getUser } from "@/lib/auth";
import { getProvidersForReview, getUsuarios, getVinculosProveedor } from "@/lib/repo";

export const metadata: Metadata = { title: "Usuarios" };

export const dynamic = "force-dynamic";

/**
 * Quién tiene cuenta y qué puede hacer.
 *
 * La lista sale de `admin_listar_usuarios()` (migración 0004), que es
 * `security definer` con `where is_admin()` dentro: a quien no sea
 * administrador le devuelve cero filas. El correo de un usuario vive en
 * `auth.users` y la clave anon no puede leer ese esquema — sin esa función, esta
 * pantalla habría tenido que usar la clave de servicio, y entonces el permiso lo
 * concedería el código en vez de la base.
 *
 * **El primer administrador no se crea aquí.** No se puede: la política
 * `user_roles_admin_write` exige ya ser uno. Ese arranque en frío lo resuelve
 * `scripts/crear-admin.mts` desde el servidor, una sola vez.
 */
export default async function UsuariosPage() {
  const [usuarios, proveedores, vinculos, yo] = await Promise.all([
    getUsuarios(),
    getProvidersForReview(),
    getVinculosProveedor(),
    getUser(),
  ]);

  const empresas = proveedores.map((p) => ({ id: p.id, name: p.name }));

  const sinDueno = proveedores.filter(
    (p) => !vinculos.some((v) => v.providerId === p.id),
  );

  return (
    <div>
      <header className="mt-8">
        <h1 className="font-display text-3xl text-ink sm:text-4xl">Usuarios</h1>
        <p className="mt-2 max-w-2xl text-muted">
          {usuarios.length} {usuarios.length === 1 ? "cuenta" : "cuentas"}. Dar
          administración entrega el control de la plataforma; enlazar a alguien
          con una empresa es lo que le permite gestionarla.
        </p>
      </header>

      {sinDueno.length > 0 && (
        <p className="mt-6 rounded-xl bg-clay-100 px-4 py-3 text-sm text-clay-700">
          <strong className="font-semibold">
            {sinDueno.length}{" "}
            {sinDueno.length === 1 ? "empresa no tiene" : "empresas no tienen"}{" "}
            a nadie que pueda gestionarla
          </strong>{" "}
          ({sinDueno.map((p) => p.name).join(", ")}). Mientras siga así, nadie
          puede editar su ficha ni publicar sus ofertas más que un administrador.
          Se arregla enlazándolas abajo con la persona que corresponda.
        </p>
      )}

      <ul className="mt-6 space-y-3">
        {usuarios.map((u) => (
          <FilaUsuario
            key={u.id}
            usuario={u}
            empresas={empresas}
            vinculos={vinculos
              .filter((v) => v.userId === u.id)
              .map((v) => ({ providerId: v.providerId, providerName: v.providerName }))}
            esYo={u.id === yo?.id}
          />
        ))}
      </ul>
    </div>
  );
}
