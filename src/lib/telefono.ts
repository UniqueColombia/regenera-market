/**
 * Indicativos de país y armado del teléfono en formato E.164.
 *
 * El registro pide el teléfono **partido en dos campos**: un selector de país y
 * el número. Se guarda unido y en E.164 (`+573001234567`), que es lo único que
 * entienden las pasarelas de SMS y WhatsApp el día que haya que escribirle a un
 * proveedor. Guardar «300 123 4567» sin indicativo obliga a adivinar el país
 * después, y con proveedores fuera de Colombia se adivina mal.
 *
 * **La lista no es el mundo entero.** Están Colombia, el resto de América Latina
 * y los cuatro países desde los que puede llegar un comprador corporativo. Meter
 * los 195 hace un desplegable inmanejable en un móvil para un caso que no
 * existe; cuando exista, se agrega la fila y ya.
 */

export interface Pais {
  /** ISO 3166-1 alfa-2. Es la clave: dos países comparten indicativo (+1). */
  codigo: string;
  nombre: string;
  /** Indicativo telefónico, sin el «+». */
  indicativo: string;
  bandera: string;
  /** Dígitos que tiene el número local, sin indicativo. Para validar. */
  digitos: number[];
}

/**
 * Colombia primero porque es donde está el 95 % de los usuarios, no por orden
 * alfabético. Un desplegable ordenado alfabéticamente obliga a todo el mundo a
 * buscar lo que casi siempre es la respuesta.
 */
export const PAISES: Pais[] = [
  { codigo: "CO", nombre: "Colombia", indicativo: "57", bandera: "🇨🇴", digitos: [10] },
  { codigo: "AR", nombre: "Argentina", indicativo: "54", bandera: "🇦🇷", digitos: [10, 11] },
  { codigo: "BO", nombre: "Bolivia", indicativo: "591", bandera: "🇧🇴", digitos: [8] },
  { codigo: "BR", nombre: "Brasil", indicativo: "55", bandera: "🇧🇷", digitos: [10, 11] },
  { codigo: "CA", nombre: "Canadá", indicativo: "1", bandera: "🇨🇦", digitos: [10] },
  { codigo: "CL", nombre: "Chile", indicativo: "56", bandera: "🇨🇱", digitos: [9] },
  { codigo: "CR", nombre: "Costa Rica", indicativo: "506", bandera: "🇨🇷", digitos: [8] },
  { codigo: "CU", nombre: "Cuba", indicativo: "53", bandera: "🇨🇺", digitos: [8] },
  { codigo: "EC", nombre: "Ecuador", indicativo: "593", bandera: "🇪🇨", digitos: [9] },
  { codigo: "SV", nombre: "El Salvador", indicativo: "503", bandera: "🇸🇻", digitos: [8] },
  { codigo: "ES", nombre: "España", indicativo: "34", bandera: "🇪🇸", digitos: [9] },
  { codigo: "US", nombre: "Estados Unidos", indicativo: "1", bandera: "🇺🇸", digitos: [10] },
  { codigo: "GT", nombre: "Guatemala", indicativo: "502", bandera: "🇬🇹", digitos: [8] },
  { codigo: "HN", nombre: "Honduras", indicativo: "504", bandera: "🇭🇳", digitos: [8] },
  { codigo: "MX", nombre: "México", indicativo: "52", bandera: "🇲🇽", digitos: [10] },
  { codigo: "NI", nombre: "Nicaragua", indicativo: "505", bandera: "🇳🇮", digitos: [8] },
  { codigo: "PA", nombre: "Panamá", indicativo: "507", bandera: "🇵🇦", digitos: [7, 8] },
  { codigo: "PY", nombre: "Paraguay", indicativo: "595", bandera: "🇵🇾", digitos: [9] },
  { codigo: "PE", nombre: "Perú", indicativo: "51", bandera: "🇵🇪", digitos: [9] },
  { codigo: "PR", nombre: "Puerto Rico", indicativo: "1", bandera: "🇵🇷", digitos: [10] },
  { codigo: "DO", nombre: "República Dominicana", indicativo: "1", bandera: "🇩🇴", digitos: [10] },
  { codigo: "UY", nombre: "Uruguay", indicativo: "598", bandera: "🇺🇾", digitos: [8, 9] },
  { codigo: "VE", nombre: "Venezuela", indicativo: "58", bandera: "🇻🇪", digitos: [10] },
  { codigo: "DE", nombre: "Alemania", indicativo: "49", bandera: "🇩🇪", digitos: [10, 11] },
  { codigo: "FR", nombre: "Francia", indicativo: "33", bandera: "🇫🇷", digitos: [9] },
  { codigo: "IT", nombre: "Italia", indicativo: "39", bandera: "🇮🇹", digitos: [9, 10] },
  { codigo: "NL", nombre: "Países Bajos", indicativo: "31", bandera: "🇳🇱", digitos: [9] },
  { codigo: "PT", nombre: "Portugal", indicativo: "351", bandera: "🇵🇹", digitos: [9] },
  { codigo: "GB", nombre: "Reino Unido", indicativo: "44", bandera: "🇬🇧", digitos: [10] },
];

export const PAIS_POR_DEFECTO = "CO";

export function buscarPais(codigo: string): Pais | undefined {
  return PAISES.find((p) => p.codigo === codigo);
}

/** Deja solo dígitos: la gente escribe «300 123-4567» y está bien que lo haga. */
export function soloDigitos(valor: string): string {
  return (valor ?? "").replace(/\D+/g, "");
}

export interface TelefonoValido {
  /** `+573001234567` — lo que se guarda. */
  e164: string;
  pais: Pais;
  numero: string;
}

/**
 * Valida y arma el teléfono. Devuelve el error en texto, no lanza.
 *
 * La longitud se comprueba contra la del país elegido, no contra un rango
 * genérico de 7 a 15: un móvil colombiano tiene exactamente diez dígitos, y
 * aceptar nueve deja entrar teléfonos que nunca van a contestar. Cuando el país
 * admite varias longitudes (Argentina, Panamá), se aceptan todas.
 */
export function armarTelefono(
  codigoPais: string,
  numeroCrudo: string,
): { ok: true; valor: TelefonoValido } | { ok: false; error: string } {
  const pais = buscarPais(codigoPais);
  if (!pais) return { ok: false, error: "Elige el país de tu teléfono" };

  const numero = soloDigitos(numeroCrudo);
  if (numero.length === 0) return { ok: false, error: "Escribe tu teléfono" };

  // Un colombiano suele escribir su móvil empezando por 3; algunos escriben el
  // indicativo otra vez («57300…»). Se quita para no guardar «+5757300…».
  const limpio =
    numero.startsWith(pais.indicativo) &&
    numero.length > Math.max(...pais.digitos)
      ? numero.slice(pais.indicativo.length)
      : numero;

  if (!pais.digitos.includes(limpio.length)) {
    const esperado = pais.digitos.join(" o ");
    return {
      ok: false,
      error: `Un teléfono de ${pais.nombre} tiene ${esperado} dígitos, sin el indicativo.`,
    };
  }

  return {
    ok: true,
    valor: { e164: `+${pais.indicativo}${limpio}`, pais, numero: limpio },
  };
}

/** Para mostrar: `+57 300 123 4567`. Nunca para guardar. */
export function mostrarTelefono(e164: string | null | undefined): string {
  if (!e164) return "";
  const digitos = soloDigitos(e164);
  const pais = PAISES.find((p) => digitos.startsWith(p.indicativo));
  if (!pais) return e164;
  const resto = digitos.slice(pais.indicativo.length);
  return `+${pais.indicativo} ${resto.replace(/(\d{3})(?=\d)/g, "$1 ").trim()}`;
}
