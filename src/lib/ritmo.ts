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
 * `x-forwarded-for` es una cabecera que **cualquiera puede escribir**, así que
 * fiarse de ella solo vale detrás de un proxy que la reescriba — que es
 * exactamente el caso aquí: en Vercel, la primera dirección de la lista la pone
 * la plataforma y el cliente no la controla. Si esto se muda al VPS propio
 * (`docs/ESTADO.md`, punto 4), hay que comprobar que Nginx o Caddy la estén
 * poniendo; si no, este archivo pasa a contar lo que el atacante quiera.
 *
 * Cuando no hay ninguna —desarrollo local— se devuelve `"local"`, que agrupa
 * todo en un mismo cubo. En una sola máquina es lo correcto.
 */
export async function origenDeLaPeticion(): Promise<string> {
  const h = await headers();
  const reenviada = h.get("x-forwarded-for");
  if (reenviada) return reenviada.split(",")[0].trim().slice(0, 45);
  return h.get("x-real-ip")?.slice(0, 45) ?? "local";
}

/** Un correo normalizado, para contar por buzón y no por cómo se escribió. */
export function porCorreo(prefijo: string, correo: string): string {
  return `${prefijo}:${correo.trim().toLowerCase()}`;
}
