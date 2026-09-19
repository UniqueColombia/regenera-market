/**
 * Cuando algo falla sin que nadie lo espere.
 *
 * ## El problema que resuelve
 *
 * Una Server Action que lanza una excepción manda a la persona a `error.tsx` y
 * **no deja nada que relacione lo que vio con lo que pasó**. El registro del
 * servidor tiene el error; la persona tiene una pantalla. Entre los dos no hay
 * ningún hilo, así que «me dio error al registrar mi empresa» es todo lo que se
 * puede reportar, y con eso no se arregla nada.
 *
 * Esto pone el hilo: un código corto que se enseña en pantalla y se escribe en
 * el registro. Quien lo reporta dice seis caracteres y quien lo busca lo
 * encuentra.
 *
 * Next hace algo parecido con `digest` —`error.tsx` ya lo muestra— pero solo
 * para las excepciones que llegan hasta el límite de error. Una acción que
 * **captura** su fallo y devuelve un mensaje amable no genera `digest`, y esas
 * son justamente las que más cuesta diagnosticar: el sitio sigue funcionando y
 * el fallo no existe para nadie más que para quien lo sufrió.
 *
 * ## Por qué no se enseña el mensaje del error
 *
 * Porque trae nombres de columnas, de políticas y a veces datos de la petición.
 * Es información gratis para quien esté probando el formulario desde fuera, y
 * no le sirve de nada a quien solo quiere registrar su empresa.
 */

/**
 * Seis caracteres sin vocales, para que no salga ninguna palabra por accidente
 * y se pueda dictar por teléfono sin confundir 0 con O ni 1 con I.
 */
const ALFABETO = "23456789BCDFGHJKLMNPQRSTVWXYZ";

export function codigoDeIncidencia(): string {
  let codigo = "";
  for (let i = 0; i < 6; i++) {
    codigo += ALFABETO[Math.floor(Math.random() * ALFABETO.length)];
  }
  return codigo;
}

/**
 * Apunta un fallo con su código y devuelve el código.
 *
 * `contexto` es de dónde viene («postular», «guardar-logo»): sin eso, buscar el
 * código en un registro de cien mil líneas es buscar una aguja.
 *
 * `datos` es para lo que ayuda a reproducirlo —qué paso, qué tipo de
 * organización, cuántos caracteres tenía la descripción—. **Nunca metas ahí un
 * nombre, un correo o un teléfono**: los registros de Vercel los lee más gente y
 * viven más tiempo que el formulario que los generó.
 */
export function registrarFallo(
  contexto: string,
  error: unknown,
  datos?: Record<string, string | number | boolean | null | undefined>,
): string {
  const codigo = codigoDeIncidencia();

  const detalle =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : typeof error === "object" && error !== null
        ? JSON.stringify(error)
        : String(error);

  const extra = datos
    ? " " +
      Object.entries(datos)
        .map(([k, v]) => `${k}=${v ?? "—"}`)
        .join(" ")
    : "";

  console.error(`[${contexto}] ${codigo} ${detalle}${extra}`);

  // La traza va aparte y solo si existe: en el registro de Vercel una traza
  // ocupa veinte líneas, y meterla en la misma que el código haría que la
  // línea que se busca sea la más difícil de leer.
  if (error instanceof Error && error.stack) {
    console.error(`[${contexto}] ${codigo} traza:\n${error.stack}`);
  }

  return codigo;
}

/**
 * El mensaje que se le enseña a una persona cuando algo falló de verdad.
 *
 * Dice tres cosas y ninguna sobra: que no es culpa suya, qué puede hacer ahora,
 * y el código con el que se puede averiguar qué pasó.
 */
export function mensajeDeFallo(codigo: string): string {
  return `No pudimos completar la operación. Vuelve a intentarlo en un minuto; si sigue igual, escríbenos con este código: ${codigo}`;
}
