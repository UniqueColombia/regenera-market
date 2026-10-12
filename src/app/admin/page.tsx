import Link from "next/link";
import {
  ClipboardList,
  Receipt,
  Store,
  Tags,
  Users,
} from "lucide-react";
import { getResumenAdmin, getUsuarios } from "@/lib/repo";
import { money } from "@/lib/format";

/**
 * Resumen: qué espera una decisión hoy.
 *
 * La pantalla contesta una sola pregunta —«¿qué tengo que mirar?»— y por eso
 * cada tarjeta cuenta **lo pendiente**, no lo acumulado. Un panel que dice «138
 * ofertas» no ayuda a nadie a empezar el día; uno que dice «3 postulaciones sin
 * respuesta» sí.
 *
 * Todas las consultas van por `repo.ts` y `orders.ts` con el cliente de sesión,
 * así que lo que se cuenta es exactamente lo que RLS deja ver.
 */

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  // Conteos, no listas (ver `getResumenAdmin`). Los usuarios siguen viniendo
  // enteros porque viven en `auth.users`, que solo se lee por la RPC
  // `admin_listar_usuarios()`; son pocos y la RPC no tiene variante de conteo.
  const [resumen, usuarios] = await Promise.all([getResumenAdmin(), getUsuarios()]);
  const {
    postulacionesPendientes,
    proveedoresPendientes,
    ofertasSinPublicar,
    ordenesPorCobrar,
    porCobrarCop,
  } = resumen;

  const tarjetas = [
    {
      href: "/admin/postulaciones" as const,
      icono: ClipboardList,
      titulo: "Postulaciones",
      dato: postulacionesPendientes,
      pie:
        postulacionesPendientes === 0
          ? "Nada esperando respuesta"
          : "sin respuesta todavía",
      urgente: postulacionesPendientes > 0,
    },
    {
      href: "/admin/ordenes" as const,
      icono: Receipt,
      titulo: "Órdenes por confirmar",
      dato: ordenesPorCobrar,
      pie:
        ordenesPorCobrar === 0
          ? "Ningún pago pendiente"
          : `${money(porCobrarCop)} en juego`,
      urgente: ordenesPorCobrar > 0,
    },
    {
      href: "/admin/proveedores" as const,
      icono: Store,
      titulo: "Proveedores",
      dato: proveedoresPendientes,
      pie:
        proveedoresPendientes === 0
          ? `${resumen.proveedores} en total`
          : "esperando decisión",
      urgente: proveedoresPendientes > 0,
    },
    {
      href: "/admin/ofertas" as const,
      icono: Tags,
      titulo: "Ofertas sin publicar",
      dato: ofertasSinPublicar,
      pie: `${resumen.ofertas - ofertasSinPublicar} publicadas en el catálogo`,
      urgente: false,
    },
    {
      href: "/admin/usuarios" as const,
      icono: Users,
      titulo: "Usuarios",
      dato: usuarios.length,
      pie: `${usuarios.filter((u) => u.roles.includes("admin")).length} con administración`,
      urgente: false,
    },
  ];

  return (
    <div>
      <header className="mt-8">
        <h1 className="font-display text-3xl text-ink sm:text-4xl">
          Qué espera decisión
        </h1>
        <p className="mt-2 max-w-2xl text-muted">
          Todo lo que cambies aquí se ve en el sitio sin desplegar nada. Aprobar
          una oferta la publica en el catálogo; confirmar un pago cierra la
          orden.
        </p>
      </header>

      <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tarjetas.map(({ href, icono: Icono, titulo, dato, pie, urgente }) => (
          <li key={href}>
            <Link
              href={href}
              className="flex h-full flex-col rounded-xl bg-white p-5 ring-1 ring-hairline transition hover:ring-brand-300 active:ring-brand-300"
            >
              <span className="flex items-center gap-2 text-sm font-medium text-muted">
                <Icono className="size-4" />
                {titulo}
              </span>
              <span
                className={`mt-3 font-display text-4xl tabular-nums ${
                  urgente ? "text-clay-600" : "text-ink"
                }`}
              >
                {dato}
              </span>
              <span className="mt-1 text-xs text-muted">{pie}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
