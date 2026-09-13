/**
 * Fuerza de una contraseña, con las mismas reglas en el navegador y en el
 * servidor.
 *
 * **Un solo módulo para los dos lados, y esa es toda la gracia.** La barra que
 * ve la persona mientras escribe y la validación que decide si la cuenta se crea
 * salen de esta misma función. Si fueran dos implementaciones, el día que
 * divergieran el formulario diría «segura» en verde y el servidor respondería
 * «muy débil», que es la peor forma de rechazar un registro: sin nada que
 * corregir a la vista.
 *
 * **Por qué no zxcvbn.** Es la librería de referencia y estima mejor que esto,
 * pero arrastra un diccionario de ~400 kB que tendrían que descargar todos los
 * visitantes del sitio, incluidos los que nunca abren el registro. Para lo que
 * hay que decidir aquí —frenar «12345678», «seregenera2026» y el nombre propio
 * del usuario— las reglas de abajo alcanzan. Si algún día hace falta más
 * precisión, el punto de cambio es esta función y nada más.
 *
 * **Esto no sustituye lo que hace Supabase.** El panel tiene su propio mínimo de
 * longitud y sus requisitos de caracteres (Authentication → Sign In / Providers
 * → Email). Lo de aquí es más estricto a propósito: si alguien baja ese ajuste,
 * la aplicación sigue pidiendo lo mismo.
 */

/** Mínimo de caracteres. Por debajo de esto no se acepta, puntúe lo que puntúe. */
export const MINIMO_CARACTERES = 10;

/**
 * Puntaje mínimo aceptable para crear o cambiar una clave.
 *
 * 2 = «aceptable». Exigir 3 suena mejor y en la práctica empuja a la gente a
 * escribir la misma clave de siempre con un `!` al final, que no es más segura
 * y sí más difícil de recordar. La defensa de verdad contra el robo de
 * credenciales aquí es el segundo factor por dispositivo, no la barra.
 */
export const PUNTAJE_MINIMO = 2;

export type PuntajeClave = 0 | 1 | 2 | 3 | 4;

export interface FuerzaClave {
  puntaje: PuntajeClave;
  etiqueta: string;
  /** Qué haría subir el puntaje. Vacío cuando ya está en el máximo. */
  sugerencia: string;
  /** ¿Se puede guardar? */
  aceptable: boolean;
}

export const ETIQUETAS: Record<PuntajeClave, string> = {
  0: "Muy débil",
  1: "Débil",
  2: "Aceptable",
  3: "Buena",
  4: "Excelente",
};

/**
 * Claves y patrones que no pasan por mucho que cumplan la longitud.
 *
 * La lista es corta a propósito: no pretende ser un diccionario, sino atrapar lo
 * que la gente escribe cuando un formulario le exige diez caracteres y una
 * mayúscula. Las variantes con dígitos al final las cubre la normalización de
 * abajo, así que «Seregenera2026» cae por «seregenera».
 */
const PROHIBIDAS = [
  "password",
  "contrasena",
  "contraseña",
  "qwerty",
  "asdfgh",
  "123456",
  "1234567890",
  "iloveyou",
  "administrador",
  "admin",
  "usuario",
  "seregenera",
  "regenera",
  "colombia",
  "bogota",
  "medellin",
];

/** Quita tildes y baja a minúsculas, para comparar contra la lista de arriba. */
function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** ¿Es una secuencia de teclado o de números? «abcdef», «123456», «aaaaaa». */
function tieneSecuencia(s: string): boolean {
  const bajo = s.toLowerCase();

  // Cuatro o más caracteres iguales seguidos.
  if (/(.)\1{3,}/.test(bajo)) return true;

  // Cuatro o más avanzando o retrocediendo de uno en uno.
  let seguidos = 1;
  for (let i = 1; i < bajo.length; i++) {
    const salto = bajo.charCodeAt(i) - bajo.charCodeAt(i - 1);
    if (salto === 1 || salto === -1) {
      seguidos++;
      if (seguidos >= 4) return true;
    } else {
      seguidos = 1;
    }
  }
  return false;
}

/**
 * Evalúa una clave.
 *
 * `contexto` son los datos que la persona acaba de escribir en el mismo
 * formulario —su correo, su nombre— y sirven para rechazar la clave que los
 * contiene. Una contraseña que es el propio correo con una mayúscula no protege
 * de nadie que haya visto el correo, que es justo quien ataca la cuenta.
 */
export function evaluarClave(
  clave: string,
  contexto: (string | undefined)[] = [],
): FuerzaClave {
  const valor = clave ?? "";

  if (valor.length === 0) {
    return {
      puntaje: 0,
      etiqueta: ETIQUETAS[0],
      sugerencia: "Escribe una contraseña.",
      aceptable: false,
    };
  }

  if (valor.length < MINIMO_CARACTERES) {
    return {
      puntaje: 0,
      etiqueta: ETIQUETAS[0],
      sugerencia: `Te faltan ${MINIMO_CARACTERES - valor.length} caracteres: el mínimo son ${MINIMO_CARACTERES}.`,
      aceptable: false,
    };
  }

  const normal = normalizar(valor);

  // Trozos del correo y del nombre, de tres letras para arriba. Del correo se
  // toma solo lo de antes de la arroba: el dominio lo comparten miles.
  const trozos = contexto
    .filter((c): c is string => Boolean(c))
    .flatMap((c) => normalizar(c).split(/[@.\s_-]+/))
    .filter((t) => t.length >= 3);

  if (trozos.some((t) => normal.includes(t))) {
    return {
      puntaje: 0,
      etiqueta: ETIQUETAS[0],
      sugerencia: "No uses tu nombre ni tu correo dentro de la contraseña.",
      aceptable: false,
    };
  }

  // Se le quitan los dígitos del final antes de comparar: «seregenera2026» y
  // «seregenera» son la misma idea para quien las adivina.
  const sinCola = normal.replace(/[0-9!@#$%^&*_.-]+$/, "");
  if (PROHIBIDAS.some((p) => sinCola === p || normal.includes(p))) {
    return {
      puntaje: 0,
      etiqueta: ETIQUETAS[0],
      sugerencia: "Esa contraseña es de las primeras que se prueban. Cambia el tema.",
      aceptable: false,
    };
  }

  let puntos = 0;

  // Longitud. Es lo que más pesa, y con razón: contra la fuerza bruta, cada
  // carácter multiplica el trabajo mucho más que añadir un símbolo.
  if (valor.length >= 12) puntos += 1;
  if (valor.length >= 16) puntos += 1;
  if (valor.length >= 20) puntos += 1;

  // Variedad de familias de caracteres.
  const familias = [/[a-z]/, /[A-ZÁÉÍÓÚÑ]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) =>
    r.test(valor),
  ).length;
  if (familias >= 2) puntos += 1;
  if (familias >= 3) puntos += 1;

  // Una frase de varias palabras vale tanto como los símbolos y se recuerda:
  // «mi perro come arepas» es mejor clave que «P3rr0!».
  if (/\s/.test(valor.trim()) && valor.trim().split(/\s+/).length >= 3) {
    puntos += 1;
  }

  if (tieneSecuencia(valor)) puntos -= 2;

  // Poquísimos caracteres distintos: «abababababab» es larga y no sirve.
  if (new Set(valor).size <= 4) puntos -= 2;

  const puntaje = Math.max(0, Math.min(4, puntos)) as PuntajeClave;

  const sugerencia =
    puntaje >= 4
      ? ""
      : valor.length < 16
        ? "Hazla más larga: tres o cuatro palabras sueltas funcionan mejor que símbolos."
        : familias < 3
          ? "Mezcla mayúsculas, números o algún signo."
          : "Evita secuencias y repeticiones.";

  return {
    puntaje,
    etiqueta: ETIQUETAS[puntaje],
    sugerencia,
    aceptable: puntaje >= PUNTAJE_MINIMO,
  };
}

/**
 * Mensaje de rechazo para el servidor, o `null` si la clave sirve.
 *
 * Devuelve el mismo texto que la barra le está enseñando a la persona, para que
 * el error no la sorprenda con un criterio distinto del que venía leyendo.
 */
export function validarClave(
  clave: string,
  contexto: (string | undefined)[] = [],
): string | null {
  const fuerza = evaluarClave(clave, contexto);
  if (fuerza.aceptable) return null;
  return fuerza.sugerencia || "Elige una contraseña más segura.";
}
