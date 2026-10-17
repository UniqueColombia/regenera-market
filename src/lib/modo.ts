/**
 * ¿Qué base hay detrás? El interruptor del modo MySQL.
 *
 * Con `BASE_DE_DATOS=mysql`, todo lo que hoy va a Supabase va al MariaDB de
 * Hostinger: los datos (`src/lib/mysql/postgrest/`), las cuentas y sesiones
 * (`src/lib/mysql/cuentas.ts`) y las fotos (`AlmacenDisco`, con
 * `ALMACEN_CARPETA`). **Las tres cosas cambian juntas**: con las cuentas en un
 * lado y los datos en el otro, la RLS de Supabase no sabría quién pide (hito
 * `2026-10-17-experimento-mysql-etapa-4a-cuentas.md`).
 *
 * Sin la variable, la app es exactamente la de siempre. Se lee en el servidor,
 * en cada llamada (no lleva `NEXT_PUBLIC_`): cambiarla no exige recompilar.
 */
export function modoMysql(): boolean {
  return process.env.BASE_DE_DATOS === "mysql";
}
