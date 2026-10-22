"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { enRecuperacion, getUser, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAlmacen, revisarImagen } from "@/lib/almacenamiento";
import type { ResultadoImagenUI } from "@/components/selector-imagen";
import { createEphemeralClient } from "@/lib/supabase/efimero";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { avisarAlVolver } from "@/lib/avisos";
import { enviarCorreo } from "@/lib/correo";
import { correoClaveCambiada, correoCuentaEliminada } from "@/lib/correo/plantillas";
import { mensajeDeFallo, registrarFallo } from "@/lib/incidencias";
import { cerrarVentanaDeActividad } from "@/lib/sesion";
import { validarClave } from "@/lib/password";
import {
  asegurarIdDispositivo,
  describirDispositivo,
  hashDispositivo,
  recordarDispositivo,
} from "@/lib/dispositivos";
import { PASE_RECUPERACION, quitarPase } from "@/lib/pase";
import { dentroDelRitmo } from "@/lib/ritmo";

/**
 * Lo que una persona puede hacer con su propia cuenta.
 *
 * Hoy: ponerse contraseña, cambiarla, retirar la confianza de un dispositivo y
 * poner o quitar su foto de perfil.
 */

/** El mismo tope que `src/app/entrar/actions.ts`. */
const MAX_CLAVE = 256;
const DEMASIADO_LARGA = "La contraseña es demasiado larga";

/**
 * Cuántas veces se puede probar la contraseña actual con la sesión abierta:
 * al cambiarla y al borrar la cuenta. Sin tope, quien encuentra una sesión
 * abierta en un computador ajeno podía probar contraseñas sin fin, y cada prueba
 * es un scrypt de 32 MB (auditoría del 2026-10-22).
 */
const PRUEBAS_DE_CLAVE = 5;
const CUARTO_DE_HORA = 900;
const DEMASIADAS_PRUEBAS = "Probaste la contraseña demasiadas veces. Espera un cuarto de hora.";

const ClaveSchema = z
  .object({
    actual: z.string().max(MAX_CLAVE, DEMASIADO_LARGA).optional(),
    password: z.string().min(1, "Escribe una contraseña").max(MAX_CLAVE, DEMASIADO_LARGA),
    password2: z.string().min(1, "Repite la contraseña").max(MAX_CLAVE, DEMASIADO_LARGA),
  })
  .refine((d) => d.password === d.password2, {
    path: ["password2"],
    message: "Las dos contraseñas no coinciden",
  });

export type ResultadoClave =
  | { ok: true }
  | { ok: false; errors: Record<string, string> };

/**
 * Define o cambia la contraseña de quien tiene la sesión abierta.
 *
 * **Si la cuenta ya tenía contraseña, se exige la actual.** No es burocracia:
 * sin eso, alguien que encuentre una sesión abierta en un computador prestado se
 * queda con la cuenta para siempre cambiando la clave, y el dueño pierde hasta
 * la posibilidad de recuperarla. Quien llega aquí porque *no* tiene contraseña
 * —las cuentas viejas por código y las que crea un administrador— no tiene nada
 * que demostrar más allá de la sesión que acaba de abrir con el código.
 *
 * **Salvo en una recuperación**: quien entró solo con el código de su correo a
 * una cuenta con contraseña (la olvidó) trae un pase firmado que lo demuestra
 * (`src/lib/pase.ts`) y se pone una nueva sin la actual. Hasta el 2026-10-22 no
 * había forma de hacerlo.
 *
 * **Al guardarla** se cierran las demás sesiones (lo hace `updateUser`), se
 * retira la confianza de los demás aparatos —que vuelven a pedir el código— y
 * se avisa por correo. Si no fue el dueño, ese correo es su única señal.
 *
 * `tiene_clave` en los metadatos es lo que después permite saber si hay
 * contraseña: Supabase no lo dice por ninguna otra vía. Ver `entrar/actions.ts`.
 */
export async function definirClave(datos: unknown): Promise<ResultadoClave> {
  const user = await requireUser("/cuenta/clave");

  const parsed = ClaveSchema.safeParse(datos);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const campo = issue.path[0];
      if (typeof campo === "string" && !errors[campo]) errors[campo] = issue.message;
    }
    return { ok: false, errors };
  }

  const yaTenia = user.user_metadata?.tiene_clave === true;
  const recuperacion = yaTenia && (await enRecuperacion(user.id));

  if (yaTenia && !recuperacion) {
    if (!dentroDelRitmo(`clave-actual:${user.id}`, PRUEBAS_DE_CLAVE, CUARTO_DE_HORA)) {
      return { ok: false, errors: { actual: DEMASIADAS_PRUEBAS } };
    }
    if (!parsed.data.actual) {
      return { ok: false, errors: { actual: "Escribe tu contraseña actual" } };
    }
    // Se comprueba con el cliente efímero: el normal escribiría cookies y
    // sustituiría la sesión en curso por una nueva sin necesidad.
    const efimero = createEphemeralClient();
    const { error } = await efimero.auth.signInWithPassword({
      email: user.email ?? "",
      password: parsed.data.actual,
    });
    if (error) {
      return { ok: false, errors: { actual: "Esa no es tu contraseña actual" } };
    }
    // `scope: "local"`, otra vez: sin él, comprobar la contraseña actual cerraría
    // la sesión de la persona en todos sus dispositivos —incluida esta, a mitad
    // de cambiar la clave— por haber escrito bien su propia contraseña.
    await efimero.auth.signOut({ scope: "local" });
  }

  const problema = validarClave(parsed.data.password, [
    user.email,
    typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : undefined,
  ]);
  if (problema) return { ok: false, errors: { password: problema } };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
    data: { ...user.user_metadata, tiene_clave: true },
  });

  if (error) {
    return {
      ok: false,
      errors: {
        form: error.message.toLowerCase().includes("password")
          ? "Esa contraseña no cumple el mínimo configurado en el panel. Prueba con una más larga."
          : "No pudimos guardar la contraseña. Inténtalo de nuevo.",
      },
    };
  }

  // El aparato desde el que alguien acaba de ponerse contraseña es, por
  // definición, uno en el que ya confía: llegó hasta aquí pasando el código.
  // Los demás dejan de serlo: si otro tenía la contraseña vieja y un aparato de
  // confianza, ahora le vuelven a pedir el código.
  const aparato = await asegurarIdDispositivo();
  const etiqueta = await describirDispositivo();
  await recordarDispositivo(supabase, user.id, aparato, etiqueta);
  const { error: errorAparatos } = await supabase
    .from("trusted_devices")
    .delete()
    .eq("user_id", user.id)
    .neq("device_hash", hashDispositivo(aparato));
  if (errorAparatos) registrarFallo("clave-aparatos", errorAparatos);
  await quitarPase(PASE_RECUPERACION);

  // Fuera del camino crítico, como el resto de correos: la clave ya cambió.
  if (yaTenia && user.email) {
    const correo = user.email;
    const meta = user.user_metadata as { full_name?: string } | undefined;
    after(async () => {
      const envio = await enviarCorreo(
        correoClaveCambiada({ nombre: meta?.full_name || correo.split("@")[0], correo, aparato: etiqueta }),
      );
      if (!envio.ok) console.error(`[clave-correo] no enviado (${envio.via})`);
    });
  }

  revalidatePath("/cuenta");
  return { ok: true };
}

/**
 * Retira la confianza de un dispositivo: la próxima vez que alguien entre desde
 * ahí, se le pedirá el código.
 *
 * Va con el cliente de sesión, así que la política `trusted_devices_own` es la
 * que autoriza. Pasar el id de un aparato ajeno no borra nada — RLS no devuelve
 * error al negar, devuelve cero filas, y por eso se comprueba el resultado.
 */
export async function olvidarDispositivo(id: string): Promise<ResultadoClave> {
  const user = await requireUser("/cuenta");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trusted_devices")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id");

  // El mensaje crudo de la base no va a la pantalla: trae nombres de tablas y
  // columnas. Va al registro con un código que la persona puede citar.
  if (error) return { ok: false, errors: { form: mensajeDeFallo(registrarFallo("olvidar-dispositivo", error)) } };
  if (!data || data.length === 0) {
    return { ok: false, errors: { form: "Ese dispositivo ya no estaba en tu lista." } };
  }

  revalidatePath("/cuenta");
  return { ok: true };
}

/**
 * La foto de perfil.
 *
 * Tres comprobaciones, en este orden y ninguna de adorno:
 *
 * 1. **Quién es.** Sin sesión no hay carpeta donde escribir.
 * 2. **Qué mandó.** `revisarImagen()` mira tipo y peso. El navegador ya recortó
 *    y comprimió, pero eso es comodidad, no una barrera: el `FormData` se puede
 *    mandar a mano.
 * 3. **Dónde va.** `getAlmacen()` decide el almacén y la ruta empieza por el id
 *    del usuario — que es lo que comparan las políticas de `storage.objects`
 *    con `auth.uid()`. O sea que la base lo vuelve a comprobar todo.
 *
 * Se revalidan las tres rutas donde la foto se ve: la cuenta, el muro de la
 * Comunidad y la portada, que también pinta publicaciones. Si aparece una
 * cuarta, va aquí.
 */
export async function guardarFoto(datos: FormData): Promise<ResultadoImagenUI> {
  const user = await getUser();
  if (!user) {
    return { ok: false, error: "Tu sesión se cerró. Entra otra vez." };
  }

  const revisada = revisarImagen(datos.get("imagen"));
  if (!revisada.ok) return { ok: false, error: revisada.error };

  const guardada = await getAlmacen().guardar(
    "avatares",
    user.id,
    revisada.archivo,
    revisada.tipo,
  );
  if (!guardada.ok) return guardada;

  const resultado = await escribirAvatar(user.id, guardada.url);
  return resultado.ok ? { ok: true, url: guardada.url } : resultado;
}

/**
 * Quitar la foto y volver al monograma de iniciales.
 *
 * **Solo borra la columna, no el archivo.** Storage cobra por lo que ocupa y
 * esto son kilobytes, así que el archivo huérfano no es el problema: el
 * problema sería que borrarlo fallara a mitad y la columna quedara apuntando a
 * una URL muerta, que se ve como una imagen rota. La próxima foto que suba esa
 * persona sobrescribe el archivo, porque la ruta es siempre la misma.
 */
export async function quitarFoto(): Promise<ResultadoImagenUI> {
  const user = await getUser();
  if (!user) {
    return { ok: false, error: "Tu sesión se cerró. Entra otra vez." };
  }
  const resultado = await escribirAvatar(user.id, null);
  if (!resultado.ok) return resultado;
  // Con la columna vacía nadie la enlaza, pero el archivo seguía saliendo en su
  // URL (que lleva el id de la persona): quitar la foto es que deje de existir.
  await getAlmacen().borrarPieza("avatares", user.id, "imagen");
  return { ok: true, url: "" };
}

async function escribirAvatar(
  userId: string,
  url: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  // `.select()` y no confiar en que no haya error: RLS no lanza al negar,
  // devuelve cero filas. Sin esto, una política mal puesta se vería como un
  // guardado correcto que no guarda nada.
  const { data, error } = await supabase
    .from("profiles")
    .update({ avatar_url: url })
    .eq("id", userId)
    .select("id");

  if (error || !data || data.length === 0) {
    if (error) console.error(`[cuenta] foto: ${error.message}`);
    return { ok: false, error: "No pudimos guardar tu foto. Inténtalo otra vez." };
  }

  revalidatePath("/cuenta");
  revalidatePath("/comunidad");
  revalidatePath("/");
  return { ok: true };
}

const BajaSchema = z.object({
  clave: z.string().min(1, "Escribe tu contraseña").max(MAX_CLAVE, DEMASIADO_LARGA),
  entiendo: z.literal("on", { error: "Marca la casilla para confirmar que entiendes lo que pasa" }),
});

/** Lo que dice la pantalla cuando la base no deja eliminar la cuenta (0021). */
const MOTIVOS_BAJA: Record<string, Record<string, string>> = {
  "es-admin": {
    form: "Eres administrador de Seregenera. Pídele a otro administrador que te quite el rol en Usuarios y después podrás eliminar tu cuenta.",
  },
  "pedidos-en-curso": {
    form: "Tienes pedidos sin terminar: por pagar, pagados o en camino. Cuando se completen o se cancelen podrás eliminar tu cuenta.",
  },
  "solicitudes-abiertas": {
    form: "Tienes una solicitud de cotización abierta. Cuando se responda o se cierre podrás eliminar tu cuenta.",
  },
  "ventas-en-curso": {
    form: "Tu empresa tiene pedidos sin terminar. Cuando los entregues o se cancelen podrás eliminar tu cuenta.",
  },
};

/**
 * Eliminar la cuenta de quien la pide. **No se puede deshacer.**
 *
 * Cuatro pasos, en este orden, y el orden es lo que importa:
 *
 * 1. **La contraseña**, comprobada con el cliente efímero (sin tocar las
 *    cookies, como al cambiarla). Con la sesión abierta en un computador
 *    prestado, cualquiera podría pulsar el botón; la contraseña dice que es la
 *    dueña.
 * 2. **`preparar_baja_de_cuenta()`** (0021), en una transacción: decide si se
 *    puede —no con pedidos o cotizaciones pendientes, ni siendo administrador—,
 *    cierra la empresa de la que es la única persona y oculta sus reseñas para
 *    quitar los puntos que dieron. Si dice que no, no se tocó nada.
 * 3. **Borrar el usuario** con la API de administración de Supabase: es lo que
 *    se lleva en cascada el perfil, los roles, los dispositivos y lo publicado,
 *    y lo que invalida las sesiones abiertas en otros aparatos. Sus pedidos se
 *    quedan sin dueño y con sus datos congelados (`on delete set null`).
 * 4. Las fotos de Storage, la constancia por correo (después de responder) y
 *    la salida con el aviso.
 *
 * La clave de servicio se usa solo en el paso 3, que es lo único que no puede
 * hacer una sesión: borrar un usuario de `auth.users`.
 */
export async function eliminarMiCuenta(
  datos: unknown,
): Promise<{ ok: false; errors: Record<string, string> }> {
  const user = await getUser();
  if (!user?.email) return { ok: false, errors: { form: "Tu sesión se cerró. Entra otra vez." } };

  const parsed = BajaSchema.safeParse(datos);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
    return { ok: false, errors };
  }

  if (!dentroDelRitmo(`clave-actual:${user.id}`, PRUEBAS_DE_CLAVE, CUARTO_DE_HORA)) {
    return { ok: false, errors: { clave: DEMASIADAS_PRUEBAS } };
  }
  const efimero = createEphemeralClient();
  const { error: errorClave } = await efimero.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.clave,
  });
  if (errorClave) return { ok: false, errors: { clave: "Esa no es tu contraseña" } };
  await efimero.auth.signOut({ scope: "local" });

  const supabase = await createClient();
  const { data: preparada, error } = await supabase.rpc("preparar_baja_de_cuenta");
  if (error) {
    const motivo = Object.keys(MOTIVOS_BAJA).find((m) => error.message.includes(m));
    if (motivo) return { ok: false, errors: MOTIVOS_BAJA[motivo] };
    const codigo = registrarFallo("baja-cuenta", error, { paso: "preparar", codigo: error.code });
    return { ok: false, errors: { form: mensajeDeFallo(codigo) } };
  }

  const meta = user.user_metadata as { full_name?: string } | undefined;
  const nombre = meta?.full_name || user.email.split("@")[0];
  const correo = user.email;
  const borradas = ((preparada as { empresas_borradas?: string[] } | null)?.empresas_borradas ?? []).filter(
    (id) => typeof id === "string",
  );

  try {
    const { error: errorBorrado } = await createAdminClient().auth.admin.deleteUser(user.id);
    if (errorBorrado) throw new Error(errorBorrado.message);
  } catch (e) {
    // Lo del paso 2 ya se hizo (reseñas ocultas, empresa cerrada), y repetirlo
    // es seguro: volver a pulsar reintenta solo lo que falta.
    const codigo = registrarFallo("baja-cuenta", e, { paso: "borrar-usuario" });
    return { ok: false, errors: { form: mensajeDeFallo(codigo) } };
  }

  const almacen = getAlmacen();
  await almacen.borrarCarpeta("avatares", user.id);
  for (const id of borradas) await almacen.borrarCarpeta("logos", id);

  after(async () => {
    const envio = await enviarCorreo(correoCuentaEliminada({ nombre, correo }));
    if (!envio.ok) console.error(`[baja-correo] no enviado (${envio.via}): ${envio.error}`);
  });

  // La sesión ya no vale (el usuario no existe); se borran sus cookies igual.
  await supabase.auth.signOut({ scope: "local" }).catch(() => {});
  await cerrarVentanaDeActividad();
  await avisarAlVolver("cuenta-eliminada");
  revalidatePath("/", "layout");
  redirect("/");
}
