import { enviarCorreo } from "../../correo";
import { VIDA_MAXIMA_SEGUNDOS } from "../../inactividad";
import { getMysql } from "../conexion";
import {
  abrirSesion,
  actualizarMetadatos,
  borrarCodigos,
  borrarCuenta,
  cambiarClave,
  cerrarOtrasSesiones,
  cerrarSesion,
  comprobarClave,
  crearCuenta,
  leerCuenta,
  leerSesion,
  pedirCodigo,
  verificarCodigo,
  verificarEnlace,
  type Cuenta,
} from "../cuentas";
import { correoDeCodigo } from "./correos";
import { instanteDeSalida } from "./valores";

/**
 * `supabase.auth` en el modo MySQL, sobre el motor de cuentas (`../cuentas.ts`).
 *
 * Implementa lo que llama la app —`signUp`, `signInWithPassword`,
 * `signInWithOtp`, `verifyOtp`, `setSession`, `updateUser`, `signOut`,
 * `getUser` y dos de `auth.admin`— con las respuestas que daría GoTrue, para
 * que `src/app/entrar/actions.ts` y compañía funcionen sin cambios. El modelo de
 * acceso (contraseña siempre, código en un aparato desconocido) está en esa
 * acción, no aquí.
 *
 * La sesión es la cookie `sgr_sesion` con un token aleatorio; en la base, solo su
 * huella. Tres clases de cliente, como con Supabase:
 *
 * - **De servidor** (`createClient()`): lee y escribe la cookie.
 * - **Efímero** (`createEphemeralClient()`): **no escribe cookies**. Es lo que
 *   hace que el segundo factor sirva: comprobar la contraseña abre una sesión
 *   que solo vive en este objeto, y la acción decide si la pasa a la cookie
 *   (`setSession`) o la cierra y pide el código.
 * - **De token** (`createTokenClient()`): actúa como la sesión de ese token.
 */

export const COOKIE_SESION = "sgr_sesion";

export interface AlmacenDeSesion {
  leer(): string | undefined;
  /** `null` borra la cookie. Puede no poder (un Server Component): se ignora, como con Supabase. */
  escribir(token: string | null): void;
}

export const OPCIONES_DE_COOKIE = {
  path: "/",
  httpOnly: true,
  sameSite: "lax" as const,
  maxAge: VIDA_MAXIMA_SEGUNDOS,
};

interface ErrorAuth {
  name: string;
  message: string;
  status: number;
  code: string;
}

const error = (status: number, code: string, message: string): ErrorAuth => ({ name: "AuthApiError", status, code, message });
const SIN_SESION: ErrorAuth = { name: "AuthSessionMissingError", status: 400, code: "session_not_found", message: "Auth session missing!" };

/** El `User` de supabase-js, con lo que la app lee de él. */
export function aUsuario(c: Cuenta, opciones: { sinIdentidades?: boolean } = {}) {
  const iso = (v: string | null) => (v ? instanteDeSalida(v) : null);
  const creado = instanteDeSalida(c.creadaAt);
  return {
    id: c.id,
    aud: "authenticated",
    role: "authenticated",
    email: c.email,
    phone: "",
    email_confirmed_at: iso(c.confirmadaAt),
    confirmed_at: iso(c.confirmadaAt),
    last_sign_in_at: iso(c.ultimoAccesoAt),
    created_at: creado,
    updated_at: creado,
    is_anonymous: false,
    app_metadata: { provider: "email", providers: ["email"] },
    // `tiene_clave` sale de la base y no de lo guardado: una cuenta copiada de
    // Supabase sin su contraseña tiene que ir a ponerse una (`requireUser()`).
    user_metadata: { ...c.metadatos, tiene_clave: c.tieneClave },
    // Vacío es lo que devuelve GoTrue al registrar un correo que ya tiene cuenta:
    // la acción de registro lo usa para mandar un código de acceso en su lugar.
    identities: opciones.sinIdentidades
      ? []
      : [{ id: c.id, user_id: c.id, identity_id: c.id, provider: "email", identity_data: { email: c.email, sub: c.id }, created_at: creado, updated_at: creado, last_sign_in_at: iso(c.ultimoAccesoAt) }],
  };
}

function sesion(token: string, c: Cuenta) {
  return { access_token: token, refresh_token: token, token_type: "bearer", expires_in: VIDA_MAXIMA_SEGUNDOS, user: aUsuario(c) };
}

/** Manda el código. En desarrollo, además, lo escribe en la consola: así se puede probar sin buzón. */
async function mandarCodigo(email: string, codigo: string, id: string, registro: boolean): Promise<void> {
  if (process.env.NODE_ENV !== "production") console.info(`[modo-mysql] código para ${email}: ${codigo}`);
  const envio = await enviarCorreo(correoDeCodigo({ para: email, codigo, tokenHash: `${id}.${codigo}`, registro }));
  if (!envio.ok) console.error(`[modo-mysql] el código no salió (${envio.via}): ${envio.error}`);
}

export class AuthMysql {
  private readonly almacen?: AlmacenDeSesion;
  private token?: string;
  private cerrada = false;
  private ultimoFallo?: string;
  private readonly resolver: (token: string | undefined) => Promise<Cuenta | null>;

  constructor(opciones: {
    almacen?: AlmacenDeSesion;
    token?: string;
    /** Para que varias consultas de la misma petición no lean la sesión una vez cada una. */
    resolver?: (token: string | undefined) => Promise<Cuenta | null>;
  }) {
    this.almacen = opciones.almacen;
    this.token = opciones.token;
    this.resolver = opciones.resolver ?? ((t) => leerSesion(getMysql(), t));
  }

  private tokenActual(): string | undefined {
    if (this.cerrada) return undefined;
    return this.token ?? this.almacen?.leer();
  }

  /** La cuenta de la sesión de este cliente, o `null`. La usa la capa para saber quién consulta. */
  async cuenta(): Promise<Cuenta | null> {
    return this.resolver(this.tokenActual());
  }

  private guardar(token: string): void {
    this.cerrada = false;
    if (this.almacen) {
      this.token = token;
      try {
        this.almacen.escribir(token);
      } catch {
        /* un Server Component no escribe cookies */
      }
    } else this.token = token;
  }

  async getUser() {
    const c = await this.cuenta();
    return c ? { data: { user: aUsuario(c) }, error: null } : { data: { user: null }, error: SIN_SESION };
  }

  async getSession() {
    const token = this.tokenActual();
    const c = token ? await this.resolver(token) : null;
    return { data: { session: c && token ? sesion(token, c) : null }, error: null };
  }

  async signUp(datos: { email: string; password: string; options?: { data?: Record<string, unknown> } }) {
    const db = getMysql();
    const r = await crearCuenta(db, { email: datos.email, clave: datos.password, metadatos: datos.options?.data });
    let usuarioId: string;
    if (r.ok) usuarioId = r.usuarioId;
    else if (r.confirmada) {
      const c = (await db.selectFrom("usuarios").select("id").where("email", "=", datos.email.trim().toLowerCase()).executeTakeFirst())!;
      const cuenta = (await leerCuenta(db, c.id))!;
      return { data: { user: aUsuario(cuenta, { sinIdentidades: true }), session: null }, error: null };
    } else {
      // Se registró y nunca confirmó: se manda otro código y **la cuenta no se
      // toca**, como GoTrue. Cambiarle aquí la contraseña o el nombre dejaba a
      // cualquiera reescribir la cuenta de otro antes de que confirmara: el
      // dueño entraba con el código y se quedaba con la clave del intruso. Quien
      // olvidó la primera entra con el código y la cambia después.
      const c = (await db.selectFrom("usuarios").select("id").where("email", "=", datos.email.trim().toLowerCase()).executeTakeFirst())!;
      usuarioId = c.id;
    }
    const codigo = await pedirCodigo(db, datos.email, "registro");
    if (!codigo.ok) {
      if (codigo.motivo === "espera" || codigo.motivo === "demasiados") {
        return { data: { user: null, session: null }, error: error(429, "over_email_send_rate_limit", "email rate limit exceeded") };
      }
    } else await mandarCodigo(datos.email.trim().toLowerCase(), codigo.codigo, codigo.id, true);
    const cuenta = (await leerCuenta(db, usuarioId))!;
    return { data: { user: aUsuario(cuenta), session: null }, error: null };
  }

  async signInWithPassword(datos: { email: string; password: string }) {
    const db = getMysql();
    const r = await comprobarClave(db, datos.email, datos.password);
    if (!r.ok) return { data: { user: null, session: null }, error: error(400, "invalid_credentials", "Invalid login credentials") };
    if (!r.confirmada) return { data: { user: null, session: null }, error: error(400, "email_not_confirmed", "Email not confirmed") };
    const token = await abrirSesion(db, r.usuarioId);
    this.guardar(token);
    const c = (await leerCuenta(db, r.usuarioId))!;
    return { data: { user: aUsuario(c), session: sesion(token, c) }, error: null };
  }

  async signInWithOtp(datos: { email: string; options?: { shouldCreateUser?: boolean } }) {
    const db = getMysql();
    const r = await pedirCodigo(db, datos.email, "acceso");
    if (!r.ok) {
      if (r.motivo === "sin-cuenta") return { data: { user: null, session: null }, error: error(422, "otp_disabled", "Signups not allowed for otp") };
      if (r.motivo === "espera") {
        return { data: { user: null, session: null }, error: error(429, "over_email_send_rate_limit", `For security purposes, you can only request this after ${r.segundos} seconds.`) };
      }
      return { data: { user: null, session: null }, error: error(429, "over_email_send_rate_limit", "email rate limit exceeded") };
    }
    const confirmada = await db.selectFrom("usuarios").select("correo_confirmado_at").where("email", "=", datos.email.trim().toLowerCase()).executeTakeFirst();
    await mandarCodigo(datos.email.trim().toLowerCase(), r.codigo, r.id, !confirmada?.correo_confirmado_at);
    return { data: { user: null, session: null }, error: null };
  }

  async verifyOtp(datos: { email?: string; token?: string; token_hash?: string; type?: string }) {
    const db = getMysql();
    // La acción prueba el mismo código con dos tipos («email» y «signup»). Aquí
    // los dos son lo mismo, y el segundo intento no debe gastar otro de los cinco.
    const clave = `${datos.email ?? ""}|${datos.token ?? ""}|${datos.token_hash ?? ""}`;
    if (this.ultimoFallo === clave) return { data: { user: null, session: null }, error: error(403, "otp_expired", "Token has expired or is invalid") };
    const r = datos.token_hash
      ? await verificarEnlace(db, datos.token_hash)
      : await verificarCodigo(db, datos.email ?? "", datos.token ?? "");
    if (!r.ok) {
      this.ultimoFallo = clave;
      return { data: { user: null, session: null }, error: error(403, "otp_expired", "Token has expired or is invalid") };
    }
    const token = await abrirSesion(db, r.usuarioId);
    this.guardar(token);
    const c = (await leerCuenta(db, r.usuarioId))!;
    return { data: { user: aUsuario(c), session: sesion(token, c) }, error: null };
  }

  async setSession(datos: { access_token: string; refresh_token?: string }) {
    const c = await leerSesion(getMysql(), datos.access_token);
    if (!c) return { data: { user: null, session: null }, error: error(401, "session_not_found", "Invalid session") };
    this.guardar(datos.access_token);
    return { data: { user: aUsuario(c), session: sesion(datos.access_token, c) }, error: null };
  }

  async updateUser(datos: { password?: string; data?: Record<string, unknown>; email?: string }) {
    const c = await this.cuenta();
    if (!c) return { data: { user: null }, error: SIN_SESION };
    const db = getMysql();
    if (datos.email && datos.email.trim().toLowerCase() !== c.email) {
      return { data: { user: null }, error: error(422, "email_change_not_supported", "El cambio de correo no está disponible en el modo MySQL") };
    }
    if (datos.password) {
      // Como GoTrue: cambiar la contraseña cierra las demás sesiones y anula los
      // códigos pendientes. Es lo que hace la gente para echar a quien entró con
      // su cuenta; sin esto, esa sesión seguía viva hasta 30 días.
      await cambiarClave(db, c.id, datos.password);
      await cerrarOtrasSesiones(db, c.id, this.tokenActual());
      await borrarCodigos(db, c.email);
    }
    if (datos.data) await actualizarMetadatos(db, c.id, datos.data);
    return { data: { user: aUsuario((await leerCuenta(db, c.id))!) }, error: null };
  }

  async signOut(opciones: { scope?: "local" | "global" | "others" } = {}) {
    const token = this.tokenActual();
    const db = getMysql();
    if (token) {
      const c = await this.resolver(token);
      if (opciones.scope === "global" && c) await cerrarOtrasSesiones(db, c.id);
      else if (opciones.scope === "others" && c) await cerrarOtrasSesiones(db, c.id, token);
      if (opciones.scope !== "others") await cerrarSesion(db, token);
    }
    if (opciones.scope !== "others") {
      this.cerrada = true;
      this.token = undefined;
      try {
        this.almacen?.escribir(null);
      } catch {
        /* idem */
      }
    }
    return { error: null };
  }

  async exchangeCodeForSession() {
    // PKCE es de los enlaces de Supabase; los correos de este modo traen `token_hash`.
    return { data: { user: null, session: null }, error: error(400, "flow_state_not_found", "invalid flow state") };
  }

  readonly admin = {
    getUserById: async (id: string) => {
      const c = await leerCuenta(getMysql(), id);
      return c ? { data: { user: aUsuario(c) }, error: null } : { data: { user: null }, error: error(404, "user_not_found", "User not found") };
    },
    deleteUser: async (id: string) => {
      await borrarCuenta(getMysql(), id);
      return { data: { user: null }, error: null };
    },
  };
}
