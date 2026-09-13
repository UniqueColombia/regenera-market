#!/usr/bin/env node
/**
 * Da (o quita) el rol de administrador a una persona.
 *
 *   node --env-file=.env.local scripts/crear-admin.mts correo@ejemplo.com
 *   node --env-file=.env.local scripts/crear-admin.mts correo@ejemplo.com --nombre "Ivan Duarte" --avisar
 *   node --env-file=.env.local scripts/crear-admin.mts correo@ejemplo.com --quitar
 *   node --env-file=.env.local scripts/crear-admin.mts --listar
 *
 * ## Por qué existe este script y no un `insert` en el SQL Editor
 *
 * `docs/ESTADO.md` traía el `insert into user_roles ...` a mano. Funciona, pero
 * solo si la persona **ya se registró por la aplicación**: el `insert` necesita
 * un `auth.users.id` que todavía no existe, y falla en silencio afectando cero
 * filas cuando el correo no está. Eso convierte «darse de alta como admin» en un
 * baile de dos pasos con un humano en medio.
 *
 * Este script crea la cuenta si hace falta y asigna el rol en la misma pasada.
 *
 * ## El arranque en frío, que es el motivo de fondo
 *
 * La política `user_roles_admin_write` solo deja escribir roles a quien ya es
 * admin. Como al principio no hay ninguno, **nadie puede crear al primero desde
 * la aplicación**: es un cierre correcto por diseño y por eso hay que romperlo
 * desde fuera, con la clave de servicio. Es uno de sus tres usos legítimos
 * (importar catálogo, confirmar pagos, **asignar roles**) — ver la skill
 * `supabase-schema`.
 *
 * En cuanto exista el primer admin, lo normal es no volver a usar esto: la
 * pantalla `/admin/usuarios` hace lo mismo con el cliente de sesión, o sea
 * dejando que RLS conceda el permiso en vez de saltárselo.
 *
 * ## Los correos no se escriben aquí
 *
 * El repositorio es público. El correo va por argumento, nunca en el código ni
 * en un valor por defecto.
 */

import { createAdminClient } from "../src/lib/supabase/admin.ts";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);

function opcion(nombre: string): string | undefined {
  const i = args.indexOf(nombre);
  return i >= 0 ? args[i + 1] : undefined;
}

const correo = args.find((a) => a.includes("@"))?.toLowerCase().trim();
const nombre = opcion("--nombre");
const quitar = args.includes("--quitar");
const avisar = args.includes("--avisar");
const listar = args.includes("--listar");

const db = createAdminClient();

function reventar(mensaje: string): never {
  console.error(`\n✖ ${mensaje}\n`);
  process.exit(1);
}

/**
 * Busca un usuario por correo.
 *
 * La API de administración no ofrece «dame el usuario de este correo», así que
 * hay que paginar. Con la cantidad de usuarios de una beta esto es instantáneo;
 * si algún día son miles, la consulta correcta es un `select` sobre `auth.users`
 * desde una función `security definer`, no más páginas.
 */
async function buscarPorCorreo(email: string) {
  for (let pagina = 1; pagina <= 20; pagina++) {
    const { data, error } = await db.auth.admin.listUsers({ page: pagina, perPage: 200 });
    if (error) reventar(`No pude listar usuarios: ${error.message}`);
    const encontrado = data.users.find((u) => u.email?.toLowerCase() === email);
    if (encontrado) return encontrado;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function listarAdmins() {
  const { data, error } = await db
    .from("user_roles")
    .select("user_id, granted_at")
    .eq("role", "admin");
  if (error) reventar(`No pude leer user_roles: ${error.message}`);

  if (!data || data.length === 0) {
    console.log("\nNo hay ningún administrador todavía.\n");
    return;
  }

  console.log(`\nAdministradores (${data.length}):`);
  for (const fila of data) {
    const { data: usuario } = await db.auth.admin.getUserById(fila.user_id);
    console.log(
      `  · ${usuario?.user?.email ?? fila.user_id}  —  desde ${fila.granted_at.slice(0, 10)}`,
    );
  }
  console.log();
}

if (listar) {
  await listarAdmins();
} else if (!correo) {
  reventar(
    "Falta el correo.\n\n" +
      "  node --env-file=.env.local scripts/crear-admin.mts correo@ejemplo.com [--nombre \"Nombre Apellido\"] [--avisar]\n" +
      "  node --env-file=.env.local scripts/crear-admin.mts --listar",
  );
} else if (quitar) {
  const usuario = await buscarPorCorreo(correo);
  if (!usuario) reventar(`No existe ninguna cuenta con ese correo.`);

  const { error } = await db
    .from("user_roles")
    .delete()
    .eq("user_id", usuario.id)
    .eq("role", "admin");
  if (error) reventar(`No pude quitar el rol: ${error.message}`);

  console.log(`\n✔ ${correo} ya no es administrador.\n`);
} else {
  let usuario = await buscarPorCorreo(correo);
  let creada = false;

  if (!usuario) {
    // `email_confirm: true` porque la crea un administrador desde dentro: no
    // tiene sentido pedirle a la persona que confirme un correo que nosotros ya
    // sabemos que es suyo. Entrará con el código de seis dígitos y, como no
    // tiene contraseña, la aplicación le exigirá ponerse una.
    const { data, error } = await db.auth.admin.createUser({
      email: correo,
      email_confirm: true,
      user_metadata: nombre ? { full_name: nombre } : {},
    });
    if (error) reventar(`No pude crear la cuenta: ${error.message}`);
    usuario = data.user;
    creada = true;
  } else if (nombre && !usuario.user_metadata?.full_name) {
    await db.auth.admin.updateUserById(usuario.id, {
      user_metadata: { ...usuario.user_metadata, full_name: nombre },
    });
  }

  // `upsert` y no `insert`: correr esto dos veces tiene que dar el mismo
  // resultado que correrlo una.
  const { error: errorRol } = await db
    .from("user_roles")
    .upsert(
      { user_id: usuario!.id, role: "admin" },
      { onConflict: "user_id,role", ignoreDuplicates: true },
    );
  if (errorRol) reventar(`No pude asignar el rol: ${errorRol.message}`);

  // El trigger `handle_new_user` crea el perfil, pero una cuenta creada antes de
  // que existiera ese trigger puede no tenerlo, y `profiles.full_name` es
  // `not null`: sin fila, cada página que lea el perfil revienta.
  await db
    .from("profiles")
    .upsert(
      { id: usuario!.id, full_name: nombre ?? usuario!.email?.split("@")[0] ?? "Administrador" },
      { onConflict: "id", ignoreDuplicates: true },
    );

  console.log(
    `\n✔ ${correo} es administrador${creada ? " (cuenta creada ahora)" : " (la cuenta ya existía)"}.`,
  );

  if (avisar) {
    // El aviso se manda con la **clave anon**, no con la de servicio: es el
    // mismo `signInWithOtp` que usa la pantalla de acceso, así que llega la
    // misma plantilla ya probada, con el código de seis dígitos y el enlace de
    // cortesía a /auth/callback. Un correo distinto sería un camino más que
    // mantener y que se puede romper sin que nadie lo note.
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!anon) {
      console.warn("  (no mandé el aviso: falta NEXT_PUBLIC_SUPABASE_ANON_KEY)");
    } else {
      const publico = createClient(url, anon, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error } = await publico.auth.signInWithOtp({
        email: correo,
        options: { shouldCreateUser: false },
      });
      if (error) console.warn(`  (el aviso no salió: ${error.message})`);
      else console.log("  Le mandé un correo con el código de acceso y el enlace.");
    }
  }

  console.log(
    "\n  Para entrar: /entrar → «Entrar con código» → definir contraseña.\n" +
      "  Comprobación: abrir /admin. Si redirige a la portada, el rol no quedó.\n",
  );
}
