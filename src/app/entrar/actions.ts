"use server";

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createEphemeralClient, createTokenClient } from "@/lib/supabase/efimero";
import {
  asegurarIdDispositivo,
  describirDispositivo,
  esDispositivoConocido,
  leerIdDispositivo,
  recordarDispositivo,
} from "@/lib/dispositivos";
import { armarTelefono } from "@/lib/telefono";
import { validarClave } from "@/lib/password";
import { abrirVentanaDeActividad } from "@/lib/sesion";
import { dentroDelRitmo, origenDeLaPeticion, porCorreo } from "@/lib/ritmo";

/**
 * Acceso, registro y recuperación.
 *
 * ## El modelo, en tres frases
 *
 * **Contraseña siempre; código de seis dígitos solo cuando el aparato no se
 * reconoce.** Un aparato se reconoce porque trae una cookie cuyo hash está en
 * `trusted_devices`, y eso solo ocurre si alguna vez pasó el código ahí.
 *
 * Antes de esto no había contraseña: se entraba con el código cada vez. Se
 * cambió porque un marketplace que va a mover dinero de terceros necesita algo
 * que el dueño de la cuenta *sepa*, no solo algo a lo que tenga acceso — quien
 * llegue al buzón de correo de alguien no debería entrar a vender en su nombre.
 *
 * ## El detalle que hace que el segundo factor no sea de adorno
 *
 * La contraseña se comprueba con `createEphemeralClient()`, que **no escribe
 * cookies**. Si se usara el cliente normal, `signInWithPassword` dejaría la
 * sesión abierta en el momento en que la contraseña resulta correcta, y el
 * código que se pide después no protegería de nada: bastaría con cerrar la
 * pestaña e ir a cualquier otra página ya con sesión.
 *
 * ## Por qué «olvidé mi contraseña» no usa `resetPasswordForEmail`
 *
 * Porque haría falta una tercera plantilla de correo bien configurada. Las dos
 * que hoy funcionan —*Magic Link* y *Confirm signup*— llevan `{{ .Token }}` y
 * costaron tres hallazgos encadenados (ver `docs/ESTADO.md`). La plantilla
 * *Reset Password* de fábrica solo trae `{{ .ConfirmationURL }}`, que no pasa
 * por `/auth/callback` y no muestra ningún código.
 *
 * Así que recuperar la clave **es** entrar con código y definir una nueva: mismo
 * correo, misma plantilla, un camino menos que se pueda romper sin que nadie se
 * entere. Sirve igual para quien se registró antes de que hubiera contraseñas.
 */

/**
 * Cuántos dígitos se aceptan.
 *
 * **La longitud real la decide el panel de Supabase** — Authentication → Sign In
 * / Providers → Email → *Email OTP Length*, entre 6 y 10. Aquí se acepta el
 * rango entero a propósito: clavar el número que hoy está puesto convierte
 * cualquier cambio de ese ajuste en un bloqueo total del acceso, con un mensaje
 * que además miente. Ya pasó, con el panel en 8.
 */
const MIN_DIGITOS = 6;
const MAX_DIGITOS = 10;

const CodigoSchema = z.object({
  email: z.email("Revisa el correo"),
  // Se limpian espacios porque al pegar desde el correo suelen venir agrupados.
  token: z
    .string()
    .trim()
    .transform((s) => s.replace(/\s+/g, ""))
    .pipe(
      z
        .string()
        .regex(/^\d+$/, "El código son solo números")
        .min(MIN_DIGITOS, "Falta código: cópialo completo del correo")
        .max(MAX_DIGITOS, "Sobran dígitos: cópialo tal cual viene en el correo"),
    ),
});

const CorreoSchema = z.object({
  email: z.email("Revisa el correo"),
});

const AccesoSchema = z.object({
  email: z.email("Revisa el correo"),
  password: z.string().min(1, "Escribe tu contraseña"),
});

const RegistroSchema = z
  .object({
    nombre: z.string().trim().min(2, "Escribe tu nombre"),
    apellido: z.string().trim().min(2, "Escribe tu apellido"),
    email: z.email("Revisa el correo"),
    pais: z.string().trim().min(2, "Elige el país de tu teléfono"),
    telefono: z.string().trim().min(1, "Escribe tu teléfono"),
    password: z.string().min(1, "Escribe una contraseña"),
    password2: z.string().min(1, "Repite la contraseña"),
    // Casilla de términos. Llega como "on" del formulario o ausente.
    acepto: z.string().optional(),
  })
  .refine((d) => d.password === d.password2, {
    path: ["password2"],
    message: "Las dos contraseñas no coinciden",
  })
  .refine((d) => Boolean(d.acepto), {
    path: ["acepto"],
    message: "Tienes que aceptar los términos para crear la cuenta",
  });

export type Resultado =
  | { ok: true }
  | { ok: false; errors: Record<string, string> };

/** Lo que devuelve un acceso con contraseña. */
export type ResultadoAcceso =
  | { ok: true; requiereCodigo: boolean; necesitaClave?: boolean }
  | { ok: false; errors: Record<string, string> };

/** Lo que devuelve verificar un código. */
export type ResultadoCodigo =
  | { ok: true; necesitaClave: boolean }
  | { ok: false; errors: Record<string, string> };

function errores(e: z.ZodError): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const issue of e.issues) {
    const campo = issue.path[0];
    if (typeof campo === "string" && !salida[campo]) salida[campo] = issue.message;
  }
  return salida;
}

/**
 * ¿Esta cuenta tiene contraseña?
 *
 * Supabase no lo dice: `user.identities` trae el proveedor `email` tanto si hay
 * contraseña como si la cuenta nació de un enlace mágico. Así que lo marcamos
 * nosotros en `user_metadata` al ponerla.
 *
 * Corolario incómodo pero honesto: **quien se registró antes de que existieran
 * las contraseñas no tiene la marca**, y por eso al entrar con código se le
 * manda a ponerse una. Es exactamente el comportamiento que se quiere.
 */
function tieneClave(meta: Record<string, unknown> | undefined): boolean {
  return meta?.tiene_clave === true;
}

// ---------------------------------------------------------------------------
// Registro
// ---------------------------------------------------------------------------
// Cuántos intentos caben
//
// Las cuatro acciones de este archivo son públicas por definición: para entrar
// hay que poder llamarlas sin sesión. Eso las convierte en las tres cosas que
// más se automatizan de cualquier sitio — probar contraseñas, probar códigos y
// gastarle a alguien el cupo de correos.
//
// Supabase tiene sus propios límites y son reales, pero son **del proyecto
// entero**: el de correos ronda los 30 por hora para todo Seregenera. O sea que
// un guion apuntando a un solo buzón no le rompe la cuenta a nadie, pero sí deja
// sin correo de acceso a todos los demás durante esa hora. Por eso el límite de
// aquí cuenta por IP y por buzón, que es lo que Supabase no puede hacer por
// nosotros.
//
// Lo que este limitador NO garantiza está en la cabecera de `src/lib/ritmo.ts`,
// y conviene leerlo antes de tratarlo como una defensa.
// ---------------------------------------------------------------------------

/** Cuántos correos de acceso caben por hora: por quien los pide y por buzón. */
const CORREOS_POR_IP = 8;
const CORREOS_POR_BUZON = 4;
/** Intentos de contraseña o de código en un cuarto de hora. */
const INTENTOS_POR_IP = 15;
const INTENTOS_POR_BUZON = 8;

const HORA = 3600;
const CUARTO_DE_HORA = 900;

/**
 * ¿Cabe un intento más de esta clase, desde esta IP y para este buzón?
 *
 * Se cuentan las dos cosas porque frenan ataques distintos: la IP frena al que
 * prueba mil correos, el buzón frena al que prueba mil contraseñas de uno solo
 * desde mil sitios. Cualquiera de las dos que se pase, corta.
 *
 * **El mensaje es el mismo pase lo que pase y no dice cuál de los dos topó.**
 * Decirlo confirmaría que ese correo existe, que es justo lo que el resto de
 * este archivo se cuida de no filtrar.
 */
async function cabeUnIntento(
  clase: string,
  correo: string,
  porIp: number,
  porBuzon: number,
  ventana: number,
): Promise<boolean> {
  const ip = await origenDeLaPeticion();
  const cabeIp = dentroDelRitmo(`${clase}:ip:${ip}`, porIp, ventana);
  const cabeBuzon = dentroDelRitmo(porCorreo(`${clase}:correo`, correo), porBuzon, ventana);
  return cabeIp && cabeBuzon;
}

const DEMASIADOS = {
  form: "Demasiados intentos desde aquí. Espera unos minutos y vuelve a probar.",
};

// ---------------------------------------------------------------------------

/**
 * Crea la cuenta y dispara el correo con el código.
 *
 * `options.data` termina en `raw_user_meta_data`, de donde el trigger
 * `handle_new_user` (migración 0004) saca el nombre y el teléfono para crear la
 * fila de `profiles`. Es la única vía: el trigger corre dentro del insert en
 * `auth.users`, cuando todavía no hay sesión con la que escribir nada.
 *
 * **Si el correo ya tiene cuenta, Supabase no lo dice.** Devuelve un usuario
 * falso con `identities: []` para que un formulario de registro no se pueda usar
 * como detector de cuentas. En vez de inventar un mensaje que filtre esa
 * información, se le manda un código de acceso normal: quien de verdad es dueño
 * de ese correo entra a la cuenta que ya tenía, y quien solo estaba probando
 * direcciones no aprende nada.
 */
export async function registrarse(datos: unknown): Promise<ResultadoAcceso> {
  const parsed = RegistroSchema.safeParse(datos);
  if (!parsed.success) return { ok: false, errors: errores(parsed.error) };

  const d = parsed.data;

  const telefono = armarTelefono(d.pais, d.telefono);
  if (!telefono.ok) return { ok: false, errors: { telefono: telefono.error } };

  const problema = validarClave(d.password, [d.email, d.nombre, d.apellido]);
  if (problema) return { ok: false, errors: { password: problema } };

  const nombreCompleto = `${d.nombre} ${d.apellido}`.replace(/\s+/g, " ").trim();

  // Después de validar y antes de tocar Supabase: un formulario mal llenado no
  // gasta cupo, y un intento bien llenado no llega a la API si ya se pasó.
  if (!(await cabeUnIntento("registro", d.email, CORREOS_POR_IP, CORREOS_POR_BUZON, HORA))) {
    return { ok: false, errors: DEMASIADOS };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: d.email,
    password: d.password,
    options: {
      data: {
        full_name: nombreCompleto,
        first_name: d.nombre,
        last_name: d.apellido,
        phone: telefono.valor.e164,
        tiene_clave: true,
      },
    },
  });

  if (error) {
    return {
      ok: false,
      errors: {
        form:
          error.message.toLowerCase().includes("password")
            ? "Esa contraseña no cumple el mínimo configurado. Prueba con una más larga."
            : "No pudimos crear la cuenta. Inténtalo de nuevo en un minuto.",
      },
    };
  }

  // Correo ya registrado: ver el comentario de arriba.
  if (data.user && (data.user.identities?.length ?? 0) === 0) {
    const eco = await createClient();
    await eco.auth.signInWithOtp({
      email: d.email,
      options: { shouldCreateUser: false },
    });
    return { ok: true, requiereCodigo: true };
  }

  // Con la confirmación de correo desactivada en el panel, `signUp` ya devuelve
  // sesión y las cookies quedaron escritas. No hay código que pedir, pero sí hay
  // que recordar el aparato: es el primero de esta cuenta.
  if (data.session && data.user) {
    await confiarEnEsteAparato(supabase, data.user.id);
    return { ok: true, requiereCodigo: false };
  }

  return { ok: true, requiereCodigo: true };
}

// ---------------------------------------------------------------------------
// Acceso
// ---------------------------------------------------------------------------

/**
 * Entra con correo y contraseña.
 *
 * Tres desenlaces:
 *
 * - Contraseña incorrecta → error, y no se distingue de «ese correo no existe».
 * - Correcta y aparato conocido → sesión abierta aquí mismo.
 * - Correcta y aparato nuevo → **no** se abre sesión; se manda el código y la
 *   pantalla pasa al segundo paso.
 */
export async function entrarConClave(datos: unknown): Promise<ResultadoAcceso> {
  const parsed = AccesoSchema.safeParse(datos);
  if (!parsed.success) return { ok: false, errors: errores(parsed.error) };

  if (!(await cabeUnIntento(
    "clave", parsed.data.email, INTENTOS_POR_IP, INTENTOS_POR_BUZON, CUARTO_DE_HORA))) {
    return { ok: false, errors: DEMASIADOS };
  }

  const efimero = createEphemeralClient();
  const { data, error } = await efimero.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.session || !data.user) {
    // Un solo mensaje para «no existe» y «clave equivocada». Decir cuál de las
    // dos es convierte el formulario en un detector de cuentas.
    return {
      ok: false,
      errors: {
        form:
          "Correo o contraseña incorrectos. Si te registraste con código y nunca pusiste contraseña, entra con código.",
      },
    };
  }

  const { session, user } = data;

  // La consulta va con el token recién obtenido, no con el cliente anónimo:
  // `trusted_devices` filtra por `user_id = auth.uid()` y sin identidad
  // devolvería cero filas, o sea «aparato nuevo» siempre.
  const comoUsuario = createTokenClient(session.access_token);
  const conocido = await esDispositivoConocido(
    comoUsuario,
    user.id,
    await leerIdDispositivo(),
  );

  if (conocido) {
    // Se traslada la sesión al cliente que sí escribe cookies. `setSession` con
    // los dos tokens evita pedir la contraseña por segunda vez.
    const supabase = await createClient();
    const { error: errorSesion } = await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    if (errorSesion) {
      return { ok: false, errors: { form: "No pudimos abrir la sesión. Inténtalo otra vez." } };
    }

    // Renueva `last_seen_at` y, de paso, la cookie del aparato.
    await confiarEnEsteAparato(supabase, user.id);
    return {
      ok: true,
      requiereCodigo: false,
      necesitaClave: !tieneClave(user.user_metadata),
    };
  }

  // Aparato nuevo. Se revoca el token que se acaba de emitir —no llegó a
  // guardarse en ninguna cookie, pero dejarlo vivo sería dejar una llave tirada—
  // y se manda el código.
  //
  // **`scope: "local"` no es opcional: `signOut()` sin argumentos cierra la
  // sesión en TODOS los dispositivos.** Sin esto, entrar desde un computador
  // nuevo echaría a la persona de su teléfono y de su portátil, y el síntoma
  // sería «se me cierra la sesión sola» sin nada que lo relacione con haber
  // entrado desde otro sitio. Aquí solo hay que revocar el token que se acaba de
  // emitir tres líneas más arriba.
  await efimero.auth.signOut({ scope: "local" });

  const supabase = await createClient();
  const { error: errorCodigo } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { shouldCreateUser: false },
  });

  if (errorCodigo) {
    return {
      ok: false,
      errors: {
        form: "No pudimos enviarte el código de verificación. Inténtalo en un minuto.",
      },
    };
  }

  return { ok: true, requiereCodigo: true };
}

/**
 * Manda un código sin contraseña de por medio.
 *
 * Es la puerta de «entré con código siempre y nunca puse contraseña» y la de
 * «la olvidé». `shouldCreateUser: false` para que escribir un correo que no
 * existe no cree una cuenta en silencio.
 */
export async function pedirCodigo(datos: unknown): Promise<Resultado> {
  const parsed = CorreoSchema.safeParse(datos);
  if (!parsed.success) return { ok: false, errors: errores(parsed.error) };

  if (!(await cabeUnIntento(
    "codigo", parsed.data.email, CORREOS_POR_IP, CORREOS_POR_BUZON, HORA))) {
    return { ok: false, errors: DEMASIADOS };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { shouldCreateUser: false },
  });

  if (error) {
    return {
      ok: false,
      errors: {
        form: "No pudimos enviar el código. Si aún no tienes cuenta, regístrate.",
      },
    };
  }

  return { ok: true };
}

/**
 * Canjea el código por sesión y deja este aparato como conocido.
 *
 * Que el registro del aparato ocurra **aquí** y en ningún otro sitio es lo que
 * sostiene el modelo: un aparato se vuelve de confianza como consecuencia de
 * haber pasado el segundo factor, nunca antes.
 */
export async function verificarCodigo(datos: unknown): Promise<ResultadoCodigo> {
  const parsed = CodigoSchema.safeParse(datos);
  if (!parsed.success) return { ok: false, errors: errores(parsed.error) };

  // Un código son seis dígitos: un millón de combinaciones, que a fuerza bruta
  // sin freno se agotan en minutos. Aquí el tope es más estrecho que el de pedir
  // el correo porque adivinar es barato y pedir no lo es.
  if (!(await cabeUnIntento(
    "verificar", parsed.data.email, INTENTOS_POR_IP, INTENTOS_POR_BUZON, CUARTO_DE_HORA))) {
    return { ok: false, errors: { token: DEMASIADOS.form } };
  }

  const supabase = await createClient();

  // `email` primero porque es el tipo del código de acceso, que es el caso
  // habitual. Si falla se reintenta como `signup`: el código que manda `signUp`
  // al crear la cuenta puede pedir ese otro tipo según cómo esté configurado el
  // proyecto, y un registro que no se puede confirmar deja a la persona con una
  // cuenta a la que no puede entrar. Dos intentos cuestan una llamada de más;
  // equivocarse cuesta el registro entero.
  let { data, error } = await supabase.auth.verifyOtp({
    email: parsed.data.email,
    token: parsed.data.token,
    type: "email",
  });

  if (error) {
    ({ data, error } = await supabase.auth.verifyOtp({
      email: parsed.data.email,
      token: parsed.data.token,
      type: "signup",
    }));
  }

  if (error || !data.user) {
    return {
      ok: false,
      errors: { token: "El código no es válido o ya venció. Pide uno nuevo." },
    };
  }

  await confiarEnEsteAparato(supabase, data.user.id);

  return { ok: true, necesitaClave: !tieneClave(data.user.user_metadata) };
}

/**
 * Guarda este aparato como conocido para el usuario de la sesión actual, y
 * arranca el reloj de inactividad de la sesión.
 *
 * **Las dos cosas van juntas aquí y no en cada sitio que abre sesión** porque se
 * la llama desde los tres —registrarse, entrar con clave desde un aparato
 * conocido y canjear el código— y desde ningún otro. Repartir la llamada a
 * `abrirVentanaDeActividad()` en tres puntos sería tres oportunidades de
 * olvidarla, y olvidarla significa que esa forma de entrar deja de funcionar:
 * `src/proxy.ts` interpreta «cookies de sesión sin ventana de actividad» como
 * «sesión caducada» y devuelve a `/entrar`. El único otro sitio que la abre es
 * `src/app/auth/callback/route.ts`, que no pasa por aquí.
 *
 * **Recibe el cliente que acaba de abrir la sesión en vez de crear otro.** Uno
 * nuevo tendría que releer la cookie recién escrita en esta misma petición, y
 * aunque Next devuelve lo que se escribió, no hay razón para depender de ese
 * detalle: si alguna vez no lo hiciera, el `insert` se quedaría sin
 * `auth.uid()`, RLS devolvería cero filas **sin error** y el síntoma sería que
 * el código se pide siempre, sin nada en los registros que lo explique.
 *
 * Va con el cliente de sesión y no con la clave de servicio para que la política
 * `trusted_devices_own` sea la que autorice: si algún día se llamara con el id
 * de otra persona, la base lo rechazaría.
 */
async function confiarEnEsteAparato(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  await recordarDispositivo(
    supabase,
    userId,
    await asegurarIdDispositivo(),
    await describirDispositivo(),
  );
  await abrirVentanaDeActividad(userId);
}
