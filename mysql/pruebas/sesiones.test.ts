/**
 * `supabase.auth` en el modo MySQL (`src/lib/mysql/postgrest/auth.ts`): el
 * camino de `/entrar` y `/registro`, llamado igual que lo llama
 * `src/app/entrar/actions.ts`.
 *
 * El código de seis dígitos se toma de la consola: en desarrollo, el modo MySQL
 * lo escribe ahí (y `entorno.ts` apaga el SMTP para que no salgan correos).
 *
 *   npm run test:mysql
 */
import { hash } from "bcryptjs";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getMysql } from "../../src/lib/mysql/conexion";
import { clienteDeServicio, clienteDeSesion, clienteEfimero, clienteDeToken } from "../../src/lib/mysql/postgrest/cliente";
import { cerrarPool, HAY_MYSQL } from "./arnes";

const creadas: string[] = [];
const correo = () => `sesion-${crypto.randomUUID().slice(0, 8)}@pruebas.invalid`;

/** Una cookie en memoria: lo que hace `cookies()` de Next en una petición. */
function frasco() {
  let valor: string | undefined;
  return {
    leer: () => valor,
    escribir: (t: string | null) => {
      valor = t ?? undefined;
    },
    get valor() {
      return valor;
    },
  };
}

let consola: string[] = [];
beforeEach(() => {
  consola = [];
  vi.spyOn(console, "info").mockImplementation((...a: unknown[]) => void consola.push(a.join(" ")));
  vi.spyOn(console, "log").mockImplementation(() => {});
});
const ultimoCodigo = (email: string) =>
  [...consola].reverse().map((l) => new RegExp(`código para ${email}: (\\d{6})`).exec(l)?.[1]).find(Boolean) ?? "";

async function idDe(email: string): Promise<string> {
  const f = await getMysql().selectFrom("usuarios").select("id").where("email", "=", email).executeTakeFirstOrThrow();
  creadas.push(f.id);
  return f.id;
}

describe.skipIf(!HAY_MYSQL)("sesiones en el modo MySQL", () => {
  afterAll(async () => {
    if (creadas.length) await getMysql().deleteFrom("usuarios").where("id", "in", creadas).execute();
    vi.restoreAllMocks();
    await cerrarPool();
  }, 60_000);

  it("registrarse: sin sesión hasta el código; con el código, sesión en la cookie y la cuenta lista", async () => {
    const email = correo();
    const cookie = frasco();
    const db = clienteDeSesion(cookie);
    const r = await db.auth.signUp({ email, password: "una clave larga de prueba", options: { data: { full_name: "Ana Prueba", phone: "+573001234567", tiene_clave: true } } });
    expect(r.error).toBeNull();
    expect(r.data.session).toBeNull();
    expect(r.data.user?.identities).toHaveLength(1);
    expect(cookie.valor).toBeUndefined();
    const id = await idDe(email);

    const codigo = ultimoCodigo(email);
    expect(codigo).toMatch(/^\d{6}$/);
    // La acción prueba primero el tipo «email» y luego «signup»: el primero ya sirve.
    const v = await db.auth.verifyOtp({ email, token: codigo, type: "email" });
    expect(v.error).toBeNull();
    expect(cookie.valor).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const { data } = await db.auth.getUser();
    expect(data.user).toMatchObject({ id, email, user_metadata: { full_name: "Ana Prueba", tiene_clave: true } });
    expect(data.user?.email_confirmed_at).toBeTruthy();
    // El perfil y el rol de comprador los crea la base, como `handle_new_user`.
    const { data: perfil } = await db.from("profiles").select("full_name, phone").eq("id", id).single();
    expect(perfil).toEqual({ full_name: "Ana Prueba", phone: "+573001234567" });
    expect((await db.from("user_roles").select("role")).data).toEqual([{ role: "buyer" }]);
  });

  it("registrar un correo que ya tiene cuenta no crea otra: devuelve identidades vacías", async () => {
    const email = correo();
    const db = clienteDeSesion(frasco());
    await db.auth.signUp({ email, password: "otra clave larga" });
    await idDe(email);
    await db.auth.verifyOtp({ email, token: ultimoCodigo(email), type: "signup" });
    const otra = await clienteDeSesion(frasco()).auth.signUp({ email, password: "cualquiera larga" });
    expect(otra.data.user?.identities).toEqual([]);
  });

  it("un código equivocado no abre nada, y el segundo intento de la acción no gasta otro intento", async () => {
    const email = correo();
    const cookie = frasco();
    const db = clienteDeSesion(cookie);
    await db.auth.signUp({ email, password: "clave larga de prueba" });
    await idDe(email);
    const malo = ultimoCodigo(email) === "000000" ? "111111" : "000000";
    expect((await db.auth.verifyOtp({ email, token: malo, type: "email" })).error?.code).toBe("otp_expired");
    expect((await db.auth.verifyOtp({ email, token: malo, type: "signup" })).error?.code).toBe("otp_expired");
    const [{ intentos }] = await getMysql().selectFrom("codigos").select("intentos").where("email", "=", email).execute();
    expect(intentos).toBe(1);
    expect(cookie.valor).toBeUndefined();
  });

  it("entrar con contraseña: el cliente efímero no toca la cookie; setSession sí; signOut la cierra", async () => {
    const email = correo();
    const alta = clienteDeSesion(frasco());
    await alta.auth.signUp({ email, password: "la clave de siempre" });
    const id = await idDe(email);
    await alta.auth.verifyOtp({ email, token: ultimoCodigo(email), type: "email" });

    const efimero = clienteEfimero();
    expect((await efimero.auth.signInWithPassword({ email, password: "otra cosa" })).error?.code).toBe("invalid_credentials");
    const r = await efimero.auth.signInWithPassword({ email, password: "la clave de siempre" });
    expect(r.error).toBeNull();
    const token = r.data.session!.access_token;
    // Con el token, las consultas son de esa persona (lo que hace `createTokenClient`).
    expect((await clienteDeToken(token).from("user_roles").select("user_id")).data).toEqual([{ user_id: id }]);

    const cookie = frasco();
    const servidor = clienteDeSesion(cookie);
    expect(cookie.valor).toBeUndefined();
    await servidor.auth.setSession({ access_token: token, refresh_token: token });
    expect(cookie.valor).toBe(token);
    expect((await servidor.auth.getUser()).data.user?.id).toBe(id);

    await servidor.auth.signOut({ scope: "local" });
    expect(cookie.valor).toBeUndefined();
    expect((await clienteDeSesion(frasco()).auth.setSession({ access_token: token, refresh_token: token })).error).not.toBeNull();
  });

  it("un aparato desconocido: la acción cierra la sesión efímera y pide un código", async () => {
    const email = correo();
    const alta = clienteDeSesion(frasco());
    await alta.auth.signUp({ email, password: "clave larguísima" });
    await idDe(email);
    await alta.auth.verifyOtp({ email, token: ultimoCodigo(email), type: "email" });

    const efimero = clienteEfimero();
    const r = await efimero.auth.signInWithPassword({ email, password: "clave larguísima" });
    await efimero.auth.signOut({ scope: "local" });
    expect((await clienteDeSesion(frasco()).auth.setSession({ access_token: r.data.session!.access_token })).error).not.toBeNull();

    const cookie = frasco();
    const db = clienteDeSesion(cookie);
    // El código anterior (el del registro) tiene menos de un minuto: hay que esperar.
    expect((await db.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })).error?.status).toBe(429);
    await getMysql().updateTable("codigos").set({ creado_at: "2020-01-01 00:00:00.000000" }).where("email", "=", email).execute();
    expect((await db.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })).error).toBeNull();
    await db.auth.verifyOtp({ email, token: ultimoCodigo(email), type: "email" });
    expect(cookie.valor).toBeTruthy();
  });

  it("pedir código para un correo sin cuenta es un error (la acción dice «regístrate»)", async () => {
    const r = await clienteDeSesion(frasco()).auth.signInWithOtp({ email: correo(), options: { shouldCreateUser: false } });
    expect(r.error?.code).toBe("otp_disabled");
  });

  it("una cuenta copiada de Supabase entra con su contraseña de siempre, y queda en scrypt", async () => {
    const email = correo();
    const id = crypto.randomUUID();
    creadas.push(id);
    await getMysql().insertInto("usuarios").values({ id, email, clave: await hash("la de Supabase", 10), metadatos: "{}" }).execute();
    await getMysql().updateTable("usuarios").set({ correo_confirmado_at: "2026-01-01 00:00:00.000000" }).where("id", "=", id).execute();
    const r = await clienteEfimero().auth.signInWithPassword({ email, password: "la de Supabase" });
    expect(r.error).toBeNull();
    const { clave } = await getMysql().selectFrom("usuarios").select("clave").where("id", "=", id).executeTakeFirstOrThrow();
    expect(clave).toMatch(/^scrypt\$/);
    expect((await clienteEfimero().auth.signInWithPassword({ email, password: "la de Supabase" })).error).toBeNull();
  });

  it("el enlace del correo (token_hash) entra igual que el código", async () => {
    const email = correo();
    const db = clienteDeSesion(frasco());
    await db.auth.signUp({ email, password: "clave larga del enlace" });
    await idDe(email);
    const codigo = ultimoCodigo(email);
    const { id } = await getMysql().selectFrom("codigos").select("id").where("email", "=", email).executeTakeFirstOrThrow();
    const cookie = frasco();
    const r = await clienteDeSesion(cookie).auth.verifyOtp({ token_hash: `${id}.${codigo}`, type: "email" });
    expect(r.error).toBeNull();
    expect(cookie.valor).toBeTruthy();
  });

  it("cambiar la contraseña y los metadatos; admin.getUserById y deleteUser", async () => {
    const email = correo();
    const cookie = frasco();
    const db = clienteDeSesion(cookie);
    await db.auth.signUp({ email, password: "la primera clave" });
    const id = await idDe(email);
    await db.auth.verifyOtp({ email, token: ultimoCodigo(email), type: "email" });
    await db.auth.updateUser({ password: "la segunda clave", data: { bienvenida: true } });
    expect((await clienteEfimero().auth.signInWithPassword({ email, password: "la primera clave" })).error).not.toBeNull();
    expect((await clienteEfimero().auth.signInWithPassword({ email, password: "la segunda clave" })).error).toBeNull();
    const admin = clienteDeServicio();
    expect((await admin.auth.admin.getUserById(id)).data.user).toMatchObject({ email, user_metadata: { bienvenida: true } });
    await admin.auth.admin.deleteUser(id);
    expect((await admin.auth.admin.getUserById(id)).data.user).toBeNull();
    expect((await db.auth.getUser()).data.user).toBeNull();
  });
});
