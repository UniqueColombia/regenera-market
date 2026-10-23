import { headers } from "next/headers";

/**
 * Cuántas veces seguidas puede alguien hacer algo.
 *
 * ## Qué es esto y qué NO es
 *
 * **No es la barrera.** La barrera de todo lo que toca datos son las políticas
 * RLS y los triggers de `supabase/migrations/`: valen aunque alguien le hable a
 * PostgREST directamente, y sobreviven a que se caiga esta capa. Lo de aquí es
 * para lo que **no puede** vivir en la base:
 *
 * - Un formulario que todavía no ha llegado a la base (`/entrar` pide un correo
 *   a Supabase antes de que exista ninguna fila nuestra).
 * - Un endpoint que a propósito no exige sesión (`/api/latido`, `/api/medicion`).
 * - Un `checkout` que se puede disparar sin cuenta.
 *
 * En esos tres casos, sin esto, un guion con un bucle `for` cuesta cero y nos
 * cuesta a nosotros: correos de acceso consumidos del cupo diario, filas de
 * órdenes basura, lecturas contra la base.
 *
 * ## Lo que hay que saber antes de confiar en esto
 *
 * **La cuenta vive en memoria del proceso, y en Vercel hay varios.** Cada
 * instancia de la función lleva su propio recuento, así que el límite real es
 * «N por instancia», no «N en total»; y una instancia que arranca en frío empieza
 * de cero. O sea: **frena a quien insiste, no a quien reparte**. Un atacante con
 * red de proxies y paciencia se lo salta.
 *
 * Se acepta a conciencia porque la alternativa —un Redis, o el WAF de Vercel—
 * cuesta dinero o una integración, y lo que hay que frenar hoy es el guion
 * torpe y el clic repetido, no una campaña. **Cuando el sitio abra a gente real,
 * el límite de verdad es el cortafuegos de Vercel** (`vercel firewall`), que
 * cuenta en el borde y antes de que la petición nos llegue. Está anotado en
 * `docs/ESTADO.md`.
 *
 * Y una consecuencia de que la cuenta sea local: **un reinicio la borra**. Nada
 * de esto debe usarse para algo que tenga que ser exacto. Para lo que sí tiene
 * que serlo —cuántas publicaciones lleva alguien este mes— está la base.
 */

interface Registro {
  /** Marcas en milisegundos, de la más vieja a la más nueva. */
  marcas: number[];
}

/**
 * En `globalThis` y no en un `const` del módulo.
 *
 * En desarrollo, Next recarga los módulos en caliente en cada cambio: un `Map`
 * de módulo se vaciaría a cada guardado y el límite no se podría ni probar. En
 * producción da igual, pero tener dos comportamientos distintos es cómo se
 * escriben los bugs que solo pasan en uno de los dos.
 */
const almacen: Map<string, Registro> = ((
  globalThis as { __ritmo?: Map<string, Registro> }
).__ritmo ??= new Map());

/**
 * Cada cuántas comprobaciones se barre lo viejo.
 *
 * Sin barrido, el mapa crece con cada IP que pase por el sitio y no baja nunca:
 * en un proceso de larga vida eso es una fuga de memoria lenta. Barrer en cada
 * llamada sería recorrer el mapa entero por cada petición, así que se hace de
 * vez en cuando.
 */
const CADA = 500;
let llamadas = 0;

function barrer(ahora: number): void {
  for (const [clave, registro] of almacen) {
    // Una hora sin una sola marca: nadie va a echar de menos ese recuento.
    if (registro.marcas.length === 0 || ahora - registro.marcas.at(-1)! > 3_600_000) {
      almacen.delete(clave);
    }
  }
}

/**
 * ¿Cabe una más?
 *
 * Devuelve `true` y **apunta el intento** si está dentro del límite; `false` si
 * se pasó. Apuntar solo cuando se permite es deliberado: si se apuntara también
 * el intento rechazado, quien insiste se autoextendería el castigo para siempre
 * y no podría salir nunca de la penalización.
 *
 * @param clave  Qué se está contando y de quién: `"codigo:1.2.3.4"`.
 * @param maximo Cuántas veces cabe en la ventana.
 * @param ventanaSegundos Cuánto dura la ventana.
 */
export function dentroDelRitmo(
  clave: string,
  maximo: number,
  ventanaSegundos: number,
): boolean {
  const ahora = Date.now();
  if (++llamadas % CADA === 0) barrer(ahora);

  const desde = ahora - ventanaSegundos * 1000;
  const registro = almacen.get(clave) ?? { marcas: [] };

  // Ventana deslizante: se tiran las marcas que ya salieron por detrás.
  registro.marcas = registro.marcas.filter((m) => m > desde);

  if (registro.marcas.length >= maximo) {
    almacen.set(clave, registro);
    return false;
  }

  registro.marcas.push(ahora);
  almacen.set(clave, registro);
  return true;
}

/**
 * De dónde viene la petición.
 *
 * `x-forwarded-for` es una cabecera que **cualquiera puede escribir**: cada
 * proxy le agrega al final lo que vio, y lo que estaba antes lo mandó el
 * cliente. En Hostinger (detrás de su CDN) llega así, comprobado el 2026-10-17:
 *
 *   x-forwarded-for: <lo que inventó el cliente>, <IP real>, …, <IP real>
 *   x-real-ip:       <IP real>      (la reescribe el proxy: no se puede falsificar)
 *
 * Tomar la **primera** —como se hacía, que en Vercel sí era fiable— dejaba saltar
 * cualquier tope por IP mandando otra inventada en cada petición. Por eso va
 * primero `x-real-ip` (Hostinger y Vercel la ponen) y, si no está, la **última**
 * de `x-forwarded-for`, que es la que agregó el último proxy. Si esto se muda a
 * otro servidor, hay que volver a mirar qué cabeceras pone su proxy.
 *
 * Cuando no hay ninguna —desarrollo local— se devuelve `"local"`, que agrupa
 * todo en un mismo cubo. En una sola máquina es lo correcto.
 */
export async function origenDeLaPeticion(): Promise<string> {
  const h = await headers();
  const real = h.get("x-real-ip")?.trim();
  if (real) return agrupar(real.slice(0, 45));
  const ultima = h.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  return ultima ? agrupar(ultima.slice(0, 45)) : "local";
}

/**
 * Una dirección IPv6 se cuenta por su bloque /64 (auditoría del 2026-10-22). Un
 * proveedor de internet le da a cada casa un /64 entero: contar cada dirección
 * por separado dejaba a una sola persona estrenar millones de IP y saltarse
 * cualquier tope. Las IPv4 se quedan como están.
 */
export function agrupar(ip: string): string {
  if (!ip.includes(":")) return ip;
  const [cabeza, cola = ""] = ip.split("%")[0].split("::");
  const a = cabeza ? cabeza.split(":") : [];
  const b = ip.includes("::") && cola ? cola.split(":") : [];
  const grupos = ip.includes("::") ? [...a, ...Array(Math.max(8 - a.length - b.length, 0)).fill("0"), ...b] : a;
  return `${grupos.slice(0, 4).map((g) => g.toLowerCase().replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

/** Un correo normalizado, para contar por buzón y no por cómo se escribió. */
export function porCorreo(prefijo: string, correo: string): string {
  return `${prefijo}:${correo.trim().toLowerCase()}`;
}
