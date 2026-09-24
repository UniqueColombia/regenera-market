/**
 * La sesión se cierra sola si no la usas.
 *
 * ## Qué problema resuelve, y por qué no lo resolvía nada
 *
 * Supabase renueva el token de acceso mientras exista un token de refresco
 * válido, y ese token de refresco **no caduca por no usarse**: dura lo que diga
 * el proyecto y se renueva en cada refresco. El efecto práctico era que quien
 * entró una vez en el computador de su casa seguía dentro semanas después. En un
 * equipo compartido —una recepción de hotel, un portátil familiar— eso es que
 * cualquiera que lo abra entra como esa persona, y si esa persona es
 * administrador, entra al panel.
 *
 * El corte por inactividad es la respuesta estándar: **si pasan más de
 * {@link INACTIVIDAD_HORAS} horas sin una sola petición, la sesión se cierra**,
 * y además ninguna sesión vive más de {@link VIDA_MAXIMA_DIAS} días aunque se
 * use todos los días.
 *
 * ## Por qué se lleva en una cookie y no en la base
 *
 * Porque el reloj hay que mirarlo en **cada petición**, y `src/proxy.ts` ya corre
 * en cada petición. Guardar la última actividad en Postgres sería una escritura
 * por página vista: el coste de la medida sería mayor que el de la medición de
 * uso entera.
 *
 * La cookie es `httpOnly`, así que el JavaScript de la página no la ve ni la
 * puede tocar — un XSS no la extiende. Y lleva su propio `maxAge`: pasado el
 * plazo **el navegador la borra solo**, así que el corte ocurre aunque el
 * servidor no llegue a mirar el reloj.
 *
 * ## Por qué va firmada, y por qué además lleva de quién es
 *
 * Sin firma, el contenido de la cookie es un texto que cualquiera puede escribir,
 * y entonces la protección se salta poniéndola a mano. Importa en un caso
 * concreto: las cookies de sesión de `@supabase/ssr` **no** son `httpOnly` —el
 * cliente del navegador las necesita—, así que un XSS puede copiarlas.
 *
 * **Pero la firma sola no basta, y esto salió de revisarlo:** si lo firmado
 * fueran solo dos marcas de tiempo, toda cookie de actividad válida valdría para
 * toda sesión. Quien robara las cookies de alguien no tendría que *falsificar*
 * una — le bastaría con *conseguirla*: se registra una cuenta desechable, entra
 * con ella, se queda con el `sgr_actividad` recién firmado que le da el
 * servidor, y se lo pega a las cookies robadas. La sesión ajena revive, y con
 * `inicio` puesto por él, también se salta el tope de los 30 días. Coste del
 * ataque: una cuenta gratis.
 *
 * Por eso lo firmado empieza por el **id de quien la tiene**, y `src/proxy.ts`
 * comprueba que coincide con el usuario de la sesión. Una cookie de actividad
 * solo sirve para su dueño, y la sesión robada vuelve a morir en el primer
 * corte.
 *
 * El secreto es `SESION_SECRETO`. **Sin él la cookie sigue funcionando pero sin
 * firmar**: el corte por inactividad se aplica igual —que es lo que protege al
 * 99 % de los casos, el computador compartido— y lo que se pierde es la
 * resistencia a que alguien la falsifique. Se degrada en vez de romperse porque
 * un clon sin credenciales tiene que poder levantar el sitio (`docs/DEPLOY.md`),
 * y porque el día que la variable se ponga en Vercel, lo único que pasa es que
 * todo el mundo entra otra vez una vez.
 */

/** Cuánto puede estar la sesión sin una sola petición antes de cerrarse. */
export const INACTIVIDAD_HORAS = 48;

/**
 * Cuánto vive una sesión aunque se use a diario.
 *
 * El corte por inactividad no basta solo: una sesión que se usa cada día no
 * caduca nunca, y un token robado que alguien pasee tampoco. El tope absoluto es
 * el que garantiza que toda sesión tiene fecha de muerte.
 */
export const VIDA_MAXIMA_DIAS = 30;

export const INACTIVIDAD_SEGUNDOS = INACTIVIDAD_HORAS * 60 * 60;
export const VIDA_MAXIMA_SEGUNDOS = VIDA_MAXIMA_DIAS * 24 * 60 * 60;

/**
 * El nombre lleva el prefijo del sitio, como `sgr_cookies` y `sgr_visitante`.
 *
 * **No empieza por `sb-`**: ese prefijo es el de las cookies de `@supabase/ssr`,
 * y el proxy decide "hay sesión" mirando precisamente si existe alguna con ese
 * prefijo. Llamarla así la haría contarse a sí misma.
 */
export const COOKIE_ACTIVIDAD = "sgr_actividad";

/** Marca en segundos, que es lo que cabe cómodo en una cookie. */
function ahoraEnSegundos(): number {
  return Math.floor(Date.now() / 1000);
}

function secreto(): string | null {
  const valor = process.env.SESION_SECRETO;
  return valor && valor.length >= 16 ? valor : null;
}

const codificador = new TextEncoder();

/**
 * HMAC-SHA256 con `crypto.subtle` y no con `node:crypto`.
 *
 * Esto lo llama `src/proxy.ts`, que Next puede ejecutar en el entorno de borde,
 * donde no existen los módulos de Node. La API web está en los dos.
 */
async function firmar(mensaje: string, clave: string): Promise<string> {
  const llave = await crypto.subtle.importKey(
    "raw",
    codificador.encode(clave),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const firma = await crypto.subtle.sign("HMAC", llave, codificador.encode(mensaje));
  return Array.from(new Uint8Array(firma))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    // La mitad de un SHA-256 son 128 bits: de sobra contra una falsificación, y
    // la cookie no engorda por gusto.
    .slice(0, 32);
}

/**
 * Comparación en tiempo constante.
 *
 * Con `===` el tiempo de respuesta depende de cuántos caracteres coinciden, y
 * eso deja adivinar la firma byte a byte. Cuesta tres líneas y cierra el asunto.
 */
function igualSinFiltrarTiempo(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferencia === 0;
}

export interface Actividad {
  /**
   * De quién es esta ventana: el id del usuario de la sesión.
   *
   * Es un UUID, así que no lleva puntos y no puede romper el separador. Quien la
   * lee tiene que comprobarlo contra la sesión — lo hace `src/proxy.ts`.
   */
  sujeto: string;
  /** Cuándo empezó la sesión. Lo que mide el tope absoluto. */
  inicio: number;
  /** La última petición vista. Lo que mide la inactividad. */
  ultima: number;
}

/** El valor de la cookie: `sujeto.inicio.ultima` y, si hay secreto, su firma. */
export async function sellarActividad(
  sujeto: string,
  inicio: number,
  ultima = ahoraEnSegundos(),
): Promise<string> {
  const cuerpo = `${sujeto}.${inicio}.${ultima}`;
  const clave = secreto();
  return clave ? `${cuerpo}.${await firmar(cuerpo, clave)}` : cuerpo;
}

/** Una actividad recién empezada, para cuando alguien acaba de abrir sesión. */
export function actividadNueva(sujeto: string): Actividad {
  const ahora = ahoraEnSegundos();
  return { sujeto, inicio: ahora, ultima: ahora };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Qué dice la cookie, o `null` si no vale.
 *
 * Devuelve `null` —o sea, "cierra la sesión"— en los seis casos: no hay cookie,
 * está mal formada, la firma no cuadra, el sujeto no parece un id, pasó el plazo
 * de inactividad, o la sesión superó su vida máxima. **Ante la duda se cierra**,
 * nunca se deja abierta: el error de cerrar de más se soluciona entrando otra
 * vez.
 *
 * Lo que esta función **no** puede comprobar es que el sujeto sea el de la
 * sesión que trae la petición: para eso hace falta la sesión, y aquí no está. Lo
 * hace `src/proxy.ts` después de `getUser()`. Si alguien la llamara sin hacer esa
 * comprobación, la cookie volvería a valer para cualquiera, que es exactamente
 * el agujero que el sujeto existe para tapar.
 */
export async function leerActividad(
  valor: string | undefined,
  ahora = ahoraEnSegundos(),
): Promise<Actividad | null> {
  if (!valor) return null;

  const partes = valor.split(".");
  const clave = secreto();

  // Con secreto se exige firma; sin secreto se exige que NO la traiga. Aceptar
  // las dos formas dejaría quitar la firma para saltársela.
  if (clave ? partes.length !== 4 : partes.length !== 3) return null;

  const [sujeto, crudoInicio, crudoUltima] = partes;
  if (!UUID.test(sujeto)) return null;

  const inicio = Number(crudoInicio);
  const ultima = Number(crudoUltima);
  if (!Number.isSafeInteger(inicio) || !Number.isSafeInteger(ultima)) return null;

  if (clave) {
    const esperada = await firmar(`${sujeto}.${inicio}.${ultima}`, clave);
    if (!igualSinFiltrarTiempo(esperada, partes[3])) return null;
  }

  // Una marca en el futuro es una cookie manipulada o un reloj roto. Las dos se
  // resuelven igual.
  if (ultima > ahora + 60 || inicio > ahora + 60) return null;
  if (ahora - ultima > INACTIVIDAD_SEGUNDOS) return null;
  if (ahora - inicio > VIDA_MAXIMA_SEGUNDOS) return null;

  return { sujeto, inicio, ultima };
}

/**
 * Cada cuánto se reescribe la cookie.
 *
 * Reescribirla en **cada** petición significa una cabecera `Set-Cookie` en todas
 * las respuestas, y una respuesta con `Set-Cookie` no la puede cachear ningún
 * CDN. Con un minuto de holgura, navegar por el sitio no ensucia las respuestas
 * y el reloj sigue siendo exacto al minuto, que sobra para medir dos días.
 */
export const REFRESCO_ACTIVIDAD_SEGUNDOS = 60;

export function tocaRefrescar(actividad: Actividad, ahora = ahoraEnSegundos()): boolean {
  return ahora - actividad.ultima >= REFRESCO_ACTIVIDAD_SEGUNDOS;
}
