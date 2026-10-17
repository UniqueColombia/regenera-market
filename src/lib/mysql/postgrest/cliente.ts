import { AuthMysql, type AlmacenDeSesion } from "./auth";
import { aErrorPostgrest } from "./errores";
import { Consulta } from "./consulta";
import { enTransaccion } from "./contexto";
import { RPCS } from "./rpc";
import { SERVICIO, VISITANTE, type Actor, type Respuesta } from "./tipos";
import type { Cuenta } from "../cuentas";

/**
 * Un cliente con la forma de `SupabaseClient` —`from()`, `rpc()`, `auth`— que
 * habla con MariaDB. Lo devuelven `createClient()`, `createAdminClient()` y
 * compañía en el modo MySQL (`src/lib/supabase/`), así que el resto de la app
 * no sabe qué base hay detrás.
 *
 * `storage` no existe a propósito: en este modo las fotos van por
 * `getAlmacen()` (`src/lib/almacenamiento.ts`), que es la única puerta.
 */

class ConsultaRpc implements PromiseLike<Respuesta> {
  private readonly nombre: string;
  private readonly args: Record<string, unknown>;
  private readonly actor: () => Promise<Actor>;

  constructor(nombre: string, args: Record<string, unknown>, actor: () => Promise<Actor>) {
    this.nombre = nombre;
    this.args = args;
    this.actor = actor;
  }

  then<A = Respuesta, B = never>(
    bien?: ((r: Respuesta) => A | PromiseLike<A>) | null,
    mal?: ((e: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return this.ejecutar().then(bien, mal);
  }

  private async ejecutar(): Promise<Respuesta> {
    const fn = RPCS[this.nombre];
    if (!fn) {
      return {
        data: null,
        error: { code: "PGRST202", message: `Could not find the function public.${this.nombre} in the schema cache`, details: null, hint: null },
        count: null,
        status: 404,
        statusText: "Not Found",
      };
    }
    try {
      const actor = await this.actor();
      const data = await enTransaccion(actor, (con) => fn({ con, actor }, this.args), { definer: true });
      return { data: data ?? null, error: null, count: null, status: 200, statusText: "OK" };
    } catch (e) {
      return { data: null, error: aErrorPostgrest(e, { pista: (e as { pista?: string | null }).pista ?? null }), count: null, status: 400, statusText: "Bad Request" };
    }
  }
}

export interface ClienteMysql {
  from(tabla: string): Consulta;
  rpc(nombre: string, args?: Record<string, unknown>): ConsultaRpc;
  auth: AuthMysql;
}

function cliente(auth: AuthMysql, actor: () => Promise<Actor>): ClienteMysql {
  return {
    from: (tabla) => new Consulta(tabla, actor),
    rpc: (nombre, args) => new ConsultaRpc(nombre, args ?? {}, actor),
    auth,
  };
}

const deCuenta = (c: Cuenta | null): Actor => (c ? { id: c.id, rol: "authenticated" } : VISITANTE);

/** El de `createClient()`: la sesión de la cookie. */
export function clienteDeSesion(almacen: AlmacenDeSesion, resolver?: (token: string | undefined) => Promise<Cuenta | null>): ClienteMysql {
  const auth = new AuthMysql({ almacen, resolver });
  return cliente(auth, async () => deCuenta(await auth.cuenta()));
}

/** El de `createEphemeralClient()`: sin cookies; la sesión, si la abre, vive en este objeto. */
export function clienteEfimero(): ClienteMysql {
  const auth = new AuthMysql({});
  return cliente(auth, async () => deCuenta(await auth.cuenta()));
}

/** El de `createTokenClient()`: actúa como la sesión de ese token. */
export function clienteDeToken(token: string): ClienteMysql {
  const auth = new AuthMysql({ token });
  return cliente(auth, async () => deCuenta(await auth.cuenta()));
}

/** El de `createAdminClient()`: la llave de servicio. Se salta las políticas, como allá. */
export function clienteDeServicio(): ClienteMysql {
  return cliente(new AuthMysql({}), async () => SERVICIO);
}
