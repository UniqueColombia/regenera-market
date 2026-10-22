import { createHash, randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";
import { compare as compararBcrypt } from "bcryptjs";
import { sql, type Kysely } from "kysely";
import { INACTIVIDAD_HORAS, REFRESCO_ACTIVIDAD_SEGUNDOS, VIDA_MAXIMA_DIAS } from "../inactividad";
import type { BaseMysql } from "./esquema";

/**
 * Cuentas, contraseñas, sesiones y códigos de seis dígitos **sin Supabase
 * Auth**, sobre `mysql/cuentas.sql`. Experimento MySQL, etapa 4a (hito
 * `2026-10-17-experimento-mysql-etapa-4a-cuentas.md`).
 *
 * Es el motor, no las pantallas: no manda correos ni escribe cookies. Quien lo
 * llama (las acciones de `/entrar` y `/registro`, cuando se conecten) recibe el
 * código para mandarlo y el token para ponerlo en la cookie. Así el modelo de
 * acceso de `src/app/entrar/actions.ts` —contraseña siempre, código solo en un
 * aparato que no se reconoce— no cambia: cambia quién guarda las cosas.
 *
 * Lo que este archivo garantiza y lo que no:
 *
 * - **Una contraseña nunca se guarda**: se guarda su scrypt, con su sal y sus
 *   parámetros, para poder subirlos mañana sin invalidar las de hoy.
 * - **Un token de sesión nunca se guarda**: se guarda su sha256. Quien lea la
 *   tabla `sesiones` no puede usar ninguna.
 * - **Un código vale una vez, una hora, 5 intentos**, y solo el último que se
 *   pidió para ese correo. Pedirlos tiene ritmo, contado en la base (no en la
 *   memoria del proceso, como `src/lib/ritmo.ts`): es exacto aunque haya
 *   varios procesos o un reinicio.
 * - Las sesiones mueren por **inactividad** y por **edad**, con los mismos
 *   números que `src/lib/inactividad.ts`.
 * - **No** limita los intentos de contraseña por cuenta: eso lo sigue haciendo
 *   `ritmo.ts` en la acción, como hoy.
 */

/**
 * Cuánto vive un código. Una hora, como en Supabase, porque **los correos lo dicen**
 * («vence en una hora», `plantillas-correo/01` y `02`): si se acorta, se cambian
 * las plantillas en el mismo commit.
 */
export const CODIGO_MINUTOS = 60;
/** Cuántas veces se puede probar un código antes de que deje de servir. */
export const INTENTOS_POR_CODIGO = 5;
/** Cuántos códigos se le mandan a un correo en una hora. */
export const CODIGOS_POR_HORA = 5;
/** Lo mínimo entre un código y el siguiente al mismo correo. */
export const ESPERA_ENTRE_CODIGOS_SEGUNDOS = 60;
/**
 * Cuántos en un día al mismo correo. Con solo el tope por hora, alguien podía
 * probar 25 códigos por hora contra una cuenta indefinidamente (5 × 5 intentos)
 * y llenarle el buzón a su dueño con 120 correos al día.
 */
export const CODIGOS_POR_DIA = 12;
/**
 * Cuántos en una hora entre todos los correos. Supabase ponía un tope así por
 * proyecto; sin él, cualquiera podía mandar códigos a direcciones inventadas
 * hasta gastar la cuota de envío del buzón, y entonces no le llegaría el suyo a
 * nadie. Holgado para el tráfico de hoy.
 */
export const CODIGOS_POR_HORA_EN_TOTAL = 300;
/** Cuántas cuentas sin confirmar se crean en una hora en total, por lo mismo. */
export const REGISTROS_POR_HORA_EN_TOTAL = 150;

// scrypt con N = 2^15, r = 8, p = 1: 32 MB y unas decenas de milisegundos por
// contraseña. Más alto aprieta la memoria de un hosting compartido cuando
// entran varias personas a la vez. Van escritos en cada hash, así que se pueden
// subir sin romper las contraseñas ya guardadas.
const SCRYPT = { N: 2 ** 15, r: 8, p: 1 };
const LARGO_CLAVE = 32;

function derivar(clave: string, sal: Buffer, N: number, r: number, p: number): Promise<Buffer> {
  return new Promise((bien, mal) =>
    // NFC: la misma «é» escrita en dos teclados distintos llega compuesta o
    // descompuesta. Sin normalizar, la contraseña de alguien dejaría de servir
    // al cambiar de teléfono.
    scrypt(clave.normalize("NFC"), sal, LARGO_CLAVE, { N, r, p, maxmem: 128 * N * r * 2 }, (e, k) =>
      e ? mal(e) : bien(k),
    ),
  );
}

/** `scrypt$N$r$p$sal$hash`, en base64url. */
export async function cifrarClave(clave: string): Promise<string> {
  const sal = randomBytes(16);
  const { N, r, p } = SCRYPT;
  const hash = await derivar(clave, sal, N, r, p);
  return `scrypt$${N}$${r}$${p}$${sal.toString("base64url")}$${hash.toString("base64url")}`;
}

/**
 * ¿Es esta la contraseña? Acepta los dos formatos que puede haber en `usuarios`:
 * el scrypt propio y el **bcrypt de Supabase** (`$2a$…`), que es como llegan las
 * cuentas copiadas de allá (`scripts/mysql/copiar-datos.mts`). `comprobarClave()`
 * cambia el bcrypt por scrypt la primera vez que la contraseña entra bien.
 */
export async function verificarClave(clave: string, guardada: string): Promise<boolean> {
  if (/^\$2[aby]\$/.test(guardada)) return compararBcrypt(clave, guardada);
  const [algoritmo, N, r, p, sal, hash] = guardada.split("$");
  if (algoritmo !== "scrypt" || !hash) return false;
  const esperado = Buffer.from(hash, "base64url");
  const obtenido = await derivar(clave, Buffer.from(sal, "base64url"), Number(N), Number(r), Number(p));
  return obtenido.length === esperado.length && timingSafeEqual(obtenido, esperado);
}

/**
 * Para que preguntar por un correo que no existe tarde lo mismo que por uno
 * que sí: si no, el tiempo de respuesta diría quién tiene cuenta.
 */
let relleno: Promise<string> | undefined;

export function normalizarCorreo(correo: string): string {
  return correo.trim().toLowerCase();
}

function sha256(texto: string): string {
  return createHash("sha256").update(texto).digest("hex");
}

function iguales(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// ---------------------------------------------------------------------------
// Cuentas
// ---------------------------------------------------------------------------

export async function crearCuenta(
  db: Kysely<BaseMysql>,
  datos: { email: string; clave: string | null; metadatos?: Record<string, unknown> },
): Promise<{ ok: true; usuarioId: string } | { ok: false; motivo: "existe"; confirmada: boolean }> {
  const email = normalizarCorreo(datos.email);
  const id = crypto.randomUUID();
  try {
    await db
      .insertInto("usuarios")
      .values({
        id,
        email,
        clave: datos.clave === null ? null : await cifrarClave(datos.clave),
        metadatos: JSON.stringify(datos.metadatos ?? {}),
      })
      .execute();
    return { ok: true, usuarioId: id };
  } catch (e) {
    if ((e as { errno?: number }).errno !== 1062) throw e;
    const previa = await db
      .selectFrom("usuarios")
      .select("correo_confirmado_at")
      .where("email", "=", email)
      .executeTakeFirst();
    return { ok: false, motivo: "existe", confirmada: Boolean(previa?.correo_confirmado_at) };
  }
}

/** ¿Se llegó al tope de registros sin confirmar de la última hora, entre todos? */
export async function demasiadosRegistros(db: Kysely<BaseMysql>): Promise<boolean> {
  const { rows } = await sql<{ n: number }>`
    select count(*) as n from usuarios
     where correo_confirmado_at is null and creado_at > now(6) - interval 1 hour`.execute(db);
  return Number(rows[0].n) >= REGISTROS_POR_HORA_EN_TOTAL;
}

/**
 * Limpieza que en Supabase hacía la plataforma: los códigos de más de dos días
 * (ya no sirven ni cuentan para ningún tope) y las cuentas que se registraron
 * solas y nunca confirmaron en una semana. Sin esto, un registro en bucle deja
 * filas para siempre.
 *
 * **Solo las que se registraron con contraseña** (`clave` no nula) y no tienen
 * más que el rol de comprador ni ninguna empresa: las que crea un
 * administrador tampoco están confirmadas —no tienen clave hasta que la persona
 * entra con un código— y pueden tener una empresa esperándolas.
 */
export async function limpiarCuentas(db: Kysely<BaseMysql>): Promise<void> {
  await sql`delete from codigos where creado_at < now(6) - interval 2 day`.execute(db);
  // Sesiones que ya no valen (las mismas condiciones que `leerSesion()`) y
  // aparatos de confianza sin usar en un año, que es lo que dura su cookie. Antes
  // solo se borraban si alguien volvía a presentar la cookie, y guardan el
  // navegador de cada persona (auditoría del 2026-10-22).
  await sql`
    delete from sesiones
     where vista_at < now(6) - interval ${INACTIVIDAD_HORAS} hour
        or creada_at < now(6) - interval ${VIDA_MAXIMA_DIAS} day`.execute(db);
  await sql`delete from trusted_devices where last_seen_at < now(6) - interval 1 year`.execute(db);
  await sql`
    delete from usuarios
     where correo_confirmado_at is null
       and clave is not null
       and creado_at < now(6) - interval 7 day
       and not exists (select 1 from provider_members m where m.user_id = usuarios.id)
       and not exists (select 1 from user_roles r where r.user_id = usuarios.id and r.role <> 'buyer')`.execute(db);
}

/**
 * ¿Es la contraseña de esa cuenta? La respuesta es la misma si el correo no
 * existe, si la cuenta no tiene contraseña o si la contraseña está mal, y tarda
 * lo mismo: quien prueba correos no aprende cuáles tienen cuenta.
 */
export async function comprobarClave(
  db: Kysely<BaseMysql>,
  correo: string,
  clave: string,
): Promise<{ ok: true; usuarioId: string; confirmada: boolean } | { ok: false }> {
  const cuenta = await db
    .selectFrom("usuarios")
    .select(["id", "clave", "correo_confirmado_at"])
    .where("email", "=", normalizarCorreo(correo))
    .executeTakeFirst();
  relleno ??= cifrarClave(randomBytes(16).toString("hex"));
  const valida = await verificarClave(clave, cuenta?.clave ?? (await relleno));
  if (!cuenta?.clave || !valida) return { ok: false };
  if (!cuenta.clave.startsWith("scrypt$")) {
    // Solo si sigue siendo el hash viejo: si la contraseña cambió entre la
    // lectura y aquí, esto la devolvería a la anterior.
    await db
      .updateTable("usuarios")
      .set({ clave: await cifrarClave(clave) })
      .where("id", "=", cuenta.id)
      .where("clave", "=", cuenta.clave)
      .execute();
  }
  return { ok: true, usuarioId: cuenta.id, confirmada: Boolean(cuenta.correo_confirmado_at) };
}

export async function cambiarClave(db: Kysely<BaseMysql>, usuarioId: string, nueva: string): Promise<void> {
  await db.updateTable("usuarios").set({ clave: await cifrarClave(nueva) }).where("id", "=", usuarioId).execute();
}

/** Mezcla, no reemplaza: `{ bienvenida: true }` no borra el nombre. Como `updateUser({ data })`. */
export async function actualizarMetadatos(
  db: Kysely<BaseMysql>,
  usuarioId: string,
  parcial: Record<string, unknown>,
): Promise<void> {
  await db
    .updateTable("usuarios")
    .set({ metadatos: sql`json_merge_patch(metadatos, ${JSON.stringify(parcial)})` })
    .where("id", "=", usuarioId)
    .execute();
}

/**
 * Borra la cuenta, sus sesiones, sus códigos, sus roles y sus membresías (las
 * llaves foráneas de `cuentas.sql` y `permisos-de-ofertas.sql`). Lo demás de la
 * baja (la 0021: cerrar la empresa, anonimizar pedidos) es otra etapa.
 */
export async function borrarCuenta(db: Kysely<BaseMysql>, usuarioId: string): Promise<void> {
  await db.transaction().execute(async (trx) => {
    const cuenta = await trx.selectFrom("usuarios").select("email").where("id", "=", usuarioId).executeTakeFirst();
    if (!cuenta) return;
    await trx.deleteFrom("codigos").where("email", "=", cuenta.email).execute();
    // Un borrado en cascada no dispara triggers en MariaDB (en Postgres sí). Sus
    // reacciones y sus artículos se borran a mano antes, para que
    // `community_reactions_despues_de_borrar` recuente las publicaciones ajenas
    // y `community_posts_antes_de_borrar` le quite a la empresa los puntos de
    // esos artículos, que mueven su nivel y con él su comisión.
    await sql`delete from community_reactions where user_id = ${usuarioId}`.execute(trx);
    await sql`delete from community_posts where author_id = ${usuarioId}`.execute(trx);
    await trx.deleteFrom("usuarios").where("id", "=", usuarioId).execute();
  });
}

// ---------------------------------------------------------------------------
// Códigos de seis dígitos
// ---------------------------------------------------------------------------

export type Proposito = "registro" | "acceso";

/**
 * Un código nuevo para ese correo. Devuelve el código para que quien llama lo
 * mande por correo: este archivo no manda nada.
 *
 * `sin-cuenta` y `ya-confirmada` se devuelven para que la acción decida qué
 * decir. **Lo prudente es decir lo mismo que cuando sí se mandó**, para no
 * contarle a nadie qué correos tienen cuenta.
 */
export async function pedirCodigo(
  db: Kysely<BaseMysql>,
  correo: string,
  proposito: Proposito,
): Promise<
  | { ok: true; codigo: string; id: string }
  | { ok: false; motivo: "sin-cuenta" | "ya-confirmada" }
  | { ok: false; motivo: "espera"; segundos: number }
  | { ok: false; motivo: "demasiados" }
> {
  const email = normalizarCorreo(correo);
  const cuenta = await db
    .selectFrom("usuarios")
    .select("correo_confirmado_at")
    .where("email", "=", email)
    .executeTakeFirst();
  if (!cuenta) return { ok: false, motivo: "sin-cuenta" };
  if (proposito === "registro" && cuenta.correo_confirmado_at) return { ok: false, motivo: "ya-confirmada" };

  const { rows } = await sql<{ hace: number | null; enLaHora: number | null; enElDia: number }>`
    select timestampdiff(second, max(creado_at), now(6)) as hace,
           sum(creado_at > now(6) - interval 1 hour) as enLaHora,
           count(*) as enElDia
      from codigos
     where email = ${email} and creado_at > now(6) - interval 1 day`.execute(db);
  const { hace, enLaHora, enElDia } = rows[0];
  if (hace !== null && Number(hace) < ESPERA_ENTRE_CODIGOS_SEGUNDOS) {
    return { ok: false, motivo: "espera", segundos: ESPERA_ENTRE_CODIGOS_SEGUNDOS - Number(hace) };
  }
  if (Number(enLaHora ?? 0) >= CODIGOS_POR_HORA || Number(enElDia) >= CODIGOS_POR_DIA) {
    return { ok: false, motivo: "demasiados" };
  }
  const { rows: total } = await sql<{ n: number }>`
    select count(*) as n from codigos where creado_at > now(6) - interval 1 hour`.execute(db);
  if (Number(total[0].n) >= CODIGOS_POR_HORA_EN_TOTAL) {
    console.error(`[cuentas] tope global de códigos alcanzado (${total[0].n} en una hora): ¿alguien pidiéndolos en bucle?`);
    return { ok: false, motivo: "demasiados" };
  }

  const id = crypto.randomUUID();
  const codigo = randomInt(0, 1_000_000).toString().padStart(6, "0");
  await db
    .insertInto("codigos")
    .values({
      id,
      email,
      proposito,
      // Con el id dentro: dos códigos iguales en correos distintos no tienen el mismo hash.
      codigo_hash: sha256(`${id}:${codigo}`),
      vence_at: sql<string>`now(6) + interval ${CODIGO_MINUTOS} minute`,
    })
    .execute();
  return { ok: true, codigo, id };
}

/**
 * Anula los códigos pendientes de ese correo (al cambiar la contraseña). Los
 * marca como usados en vez de borrarlos: las filas son también la cuenta de
 * cuántos se pidieron en la última hora, y borrarlas reiniciaría ese tope.
 */
export async function borrarCodigos(db: Kysely<BaseMysql>, correo: string): Promise<void> {
  await db
    .updateTable("codigos")
    .set({ usado_at: sql`now(6)` })
    .where("email", "=", normalizarCorreo(correo))
    .where("usado_at", "is", null)
    .execute();
}

/**
 * El enlace del correo (`/auth/callback?token_hash=…`) trae el id del código y el
 * código: `<id>.<código>`. Vale lo mismo que escribirlo, con las mismas reglas.
 */
export async function verificarEnlace(
  db: Kysely<BaseMysql>,
  tokenHash: string,
): ReturnType<typeof verificarCodigo> {
  const [id, codigo] = tokenHash.split(".");
  const fila = id && codigo
    ? await db.selectFrom("codigos").select("email").where("id", "=", id).executeTakeFirst()
    : undefined;
  if (!fila) return { ok: false, motivo: "invalido" };
  // Un enlace de un correo anterior (o el que abre un antivirus al revisar el
  // correo) no gasta uno de los intentos del código vigente: si no es el último
  // que se pidió, se rechaza sin probarlo.
  const ultimo = await db
    .selectFrom("codigos")
    .select("id")
    .where("email", "=", fila.email)
    .orderBy("creado_at", "desc")
    .limit(1)
    .executeTakeFirst();
  if (ultimo?.id !== id) return { ok: false, motivo: "invalido" };
  return verificarCodigo(db, fila.email, codigo);
}

/**
 * ¿Es el último código que se pidió para ese correo? Sirve el de cualquier
 * propósito —los dos prueban que quien lo escribe lee ese buzón— y de paso
 * confirma el correo. Es lo que hoy hace la acción probando `verifyOtp` con
 * los dos tipos de Supabase, uno detrás del otro.
 *
 * El intento se cuenta **antes** de comparar y en la misma transacción que lee
 * el código (`for update`): dos peticiones a la vez con el mismo código no
 * entran las dos, y un intento fallido no se puede deshacer cortando la conexión.
 */
export async function verificarCodigo(
  db: Kysely<BaseMysql>,
  correo: string,
  codigo: string,
): Promise<
  { ok: true; usuarioId: string; proposito: Proposito } | { ok: false; motivo: "invalido" | "vencido" | "agotado" }
> {
  const email = normalizarCorreo(correo);
  const limpio = codigo.replace(/\s+/g, "");
  return db.transaction().execute(async (trx) => {
    const fila = await trx
      .selectFrom("codigos")
      .select(["id", "codigo_hash", "proposito", "intentos", "usado_at", sql<number>`vence_at < now(6)`.as("vencido")])
      .where("email", "=", email)
      .orderBy("creado_at", "desc")
      .limit(1)
      .forUpdate()
      .executeTakeFirst();
    if (!fila || fila.usado_at) return { ok: false, motivo: "invalido" } as const;
    if (Number(fila.vencido)) return { ok: false, motivo: "vencido" } as const;
    if (fila.intentos >= INTENTOS_POR_CODIGO) return { ok: false, motivo: "agotado" } as const;

    await trx.updateTable("codigos").set({ intentos: sql`intentos + 1` }).where("id", "=", fila.id).execute();
    if (!iguales(sha256(`${fila.id}:${limpio}`), fila.codigo_hash)) {
      return { ok: false, motivo: fila.intentos + 1 >= INTENTOS_POR_CODIGO ? "agotado" : "invalido" } as const;
    }

    await trx.updateTable("codigos").set({ usado_at: sql`now(6)` }).where("id", "=", fila.id).execute();
    const cuenta = await trx.selectFrom("usuarios").select("id").where("email", "=", email).executeTakeFirst();
    if (!cuenta) return { ok: false, motivo: "invalido" } as const;
    await trx
      .updateTable("usuarios")
      .set({ correo_confirmado_at: sql`coalesce(correo_confirmado_at, now(6))` })
      .where("id", "=", cuenta.id)
      .execute();
    return { ok: true, usuarioId: cuenta.id, proposito: fila.proposito } as const;
  });
}

// ---------------------------------------------------------------------------
// Sesiones
// ---------------------------------------------------------------------------

/** Lo que la app sabe de quien tiene la sesión: el `User` de Supabase, en pequeño. */
export interface Cuenta {
  id: string;
  email: string;
  tieneClave: boolean;
  confirmada: boolean;
  metadatos: Record<string, unknown>;
  creadaAt: string;
  confirmadaAt: string | null;
  ultimoAccesoAt: string | null;
}

/** La cuenta con ese id, sin sesión de por medio (para `auth.admin.getUserById`). */
export async function leerCuenta(db: Kysely<BaseMysql>, usuarioId: string): Promise<Cuenta | null> {
  const fila = await db
    .selectFrom("usuarios")
    .select(["id", "email", "clave", "correo_confirmado_at", "metadatos", "creado_at", "ultimo_acceso_at"])
    .where("id", "=", usuarioId)
    .executeTakeFirst();
  return fila ? aCuenta(fila) : null;
}

function aCuenta(f: {
  id: string;
  email: string;
  clave: string | null;
  correo_confirmado_at: string | null;
  metadatos: Record<string, unknown>;
  creado_at: string;
  ultimo_acceso_at: string | null;
}): Cuenta {
  return {
    id: f.id,
    email: f.email,
    tieneClave: f.clave !== null,
    confirmada: f.correo_confirmado_at !== null,
    metadatos: f.metadatos,
    creadaAt: f.creado_at,
    confirmadaAt: f.correo_confirmado_at,
    ultimoAccesoAt: f.ultimo_acceso_at,
  };
}

/** Abre una sesión y devuelve el token para la cookie. Es la única vez que el token existe en claro. */
export async function abrirSesion(db: Kysely<BaseMysql>, usuarioId: string, aparato?: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await db
    .insertInto("sesiones")
    .values({ token_hash: sha256(token), usuario_id: usuarioId, aparato: aparato?.slice(0, 200) ?? null })
    .execute();
  await db.updateTable("usuarios").set({ ultimo_acceso_at: sql`now(6)` }).where("id", "=", usuarioId).execute();
  return token;
}

/**
 * La cuenta de esa sesión, o `null` si no existe, se dejó de usar
 * `INACTIVIDAD_HORAS` o cumplió `VIDA_MAXIMA_DIAS`. Una sesión muerta se
 * borra al encontrarla.
 *
 * Marca la actividad como mucho una vez por `REFRESCO_ACTIVIDAD_SEGUNDOS`:
 * escribir en cada petición sería una escritura por página vista.
 */
export async function leerSesion(db: Kysely<BaseMysql>, token: string | undefined): Promise<Cuenta | null> {
  // Un token de verdad son 43 caracteres de base64url. Lo demás ni se busca.
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const hash = sha256(token);
  const fila = await db
    .selectFrom("sesiones")
    .innerJoin("usuarios", "usuarios.id", "sesiones.usuario_id")
    .select([
      "usuarios.id",
      "usuarios.email",
      "usuarios.clave",
      "usuarios.correo_confirmado_at",
      "usuarios.metadatos",
      "usuarios.creado_at",
      "usuarios.ultimo_acceso_at",
      sql<number>`sesiones.vista_at > now(6) - interval ${INACTIVIDAD_HORAS} hour
              and sesiones.creada_at > now(6) - interval ${VIDA_MAXIMA_DIAS} day`.as("viva"),
      sql<number>`timestampdiff(second, sesiones.vista_at, now(6))`.as("quieta"),
    ])
    .where("sesiones.token_hash", "=", hash)
    .executeTakeFirst();
  if (!fila) return null;
  if (!Number(fila.viva)) {
    await db.deleteFrom("sesiones").where("token_hash", "=", hash).execute();
    return null;
  }
  if (Number(fila.quieta) >= REFRESCO_ACTIVIDAD_SEGUNDOS) {
    await db.updateTable("sesiones").set({ vista_at: sql`now(6)` }).where("token_hash", "=", hash).execute();
  }
  return aCuenta(fila);
}

/** Cierra esta sesión y ninguna otra: el `signOut({ scope: "local" })` de hoy. */
export async function cerrarSesion(db: Kysely<BaseMysql>, token: string): Promise<void> {
  await db.deleteFrom("sesiones").where("token_hash", "=", sha256(token)).execute();
}

/** Cierra todas las sesiones de la cuenta menos la de `excepto` (por ejemplo, al cambiar la contraseña). */
export async function cerrarOtrasSesiones(db: Kysely<BaseMysql>, usuarioId: string, excepto?: string): Promise<void> {
  let q = db.deleteFrom("sesiones").where("usuario_id", "=", usuarioId);
  if (excepto) q = q.where("token_hash", "<>", sha256(excepto));
  await q.execute();
}
