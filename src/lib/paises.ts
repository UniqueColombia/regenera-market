/**
 * Países donde Seregenera acepta proveedores, y cómo se llama en cada uno el
 * documento con el que una empresa factura.
 *
 * ## Por qué existe este archivo
 *
 * `/vender` decía: «Estar formalizado: **RUT** vigente y matrícula mercantil».
 * En Colombia el RUT es el Registro Único Tributario, sí — pero en Chile el RUT
 * es el documento de identidad de cualquier persona, en Perú es RUC, en México
 * RFC y en Argentina CUIT. Un proveedor peruano que lee «RUT vigente» concluye
 * que el formulario no es para él, y se va sin escribir a nadie.
 *
 * La plataforma se presenta como latinoamericana, así que el formulario tiene
 * que preguntar por «tu identificación tributaria» y **decirle a cada uno cómo
 * se llama la suya**. Eso es esta tabla.
 *
 * ## Por qué se guarda el nombre del documento y no solo el número
 *
 * `provider_applications` guarda `tax_id_kind` además de `tax_id` (migración
 * 0006). Un número suelto no se puede validar ni usar para facturar: un NIT
 * colombiano lleva dígito de verificación, un RUC peruano son 11 dígitos y un
 * RFC mexicano mezcla letras. Guardar el tipo es lo que permite, el día que haya
 * facturación electrónica, saber qué se está mirando.
 *
 * ## El orden
 *
 * Colombia primero porque es el mercado de hoy y sería absurdo hacerle buscar
 * su país a la mayoría de quienes llenan el formulario. El resto en alfabético.
 * `Otro` al final, con documento libre: la lista no pretende ser el mundo.
 */

export interface Pais {
  /** Nombre tal cual se guarda en la base y se muestra. */
  nombre: string;
  /** ISO 3166-1 alfa-2. No se guarda hoy; está para cuando haya envíos o impuestos. */
  codigo: string;
  /** Cómo llama ese país al documento tributario de una empresa. */
  documento: string;
  /** Cómo llama a la división administrativa de primer nivel. */
  division: string;
}

export const PAISES: Pais[] = [
  { nombre: "Colombia", codigo: "CO", documento: "NIT", division: "Departamento" },
  { nombre: "Argentina", codigo: "AR", documento: "CUIT", division: "Provincia" },
  { nombre: "Bolivia", codigo: "BO", documento: "NIT", division: "Departamento" },
  { nombre: "Brasil", codigo: "BR", documento: "CNPJ", division: "Estado" },
  { nombre: "Chile", codigo: "CL", documento: "RUT", division: "Región" },
  { nombre: "Costa Rica", codigo: "CR", documento: "Cédula jurídica", division: "Provincia" },
  { nombre: "Ecuador", codigo: "EC", documento: "RUC", division: "Provincia" },
  { nombre: "El Salvador", codigo: "SV", documento: "NIT", division: "Departamento" },
  { nombre: "Guatemala", codigo: "GT", documento: "NIT", division: "Departamento" },
  { nombre: "Honduras", codigo: "HN", documento: "RTN", division: "Departamento" },
  { nombre: "México", codigo: "MX", documento: "RFC", division: "Estado" },
  { nombre: "Nicaragua", codigo: "NI", documento: "RUC", division: "Departamento" },
  { nombre: "Panamá", codigo: "PA", documento: "RUC", division: "Provincia" },
  { nombre: "Paraguay", codigo: "PY", documento: "RUC", division: "Departamento" },
  { nombre: "Perú", codigo: "PE", documento: "RUC", division: "Región" },
  { nombre: "República Dominicana", codigo: "DO", documento: "RNC", division: "Provincia" },
  { nombre: "Uruguay", codigo: "UY", documento: "RUT", division: "Departamento" },
  { nombre: "Venezuela", codigo: "VE", documento: "RIF", division: "Estado" },
  { nombre: "Otro", codigo: "XX", documento: "Identificación tributaria", division: "Región" },
];

export const NOMBRES_PAIS = PAISES.map((p) => p.nombre) as [string, ...string[]];

export function paisPorNombre(nombre: string): Pais {
  return PAISES.find((p) => p.nombre === nombre) ?? PAISES[PAISES.length - 1];
}

/**
 * Formas jurídicas que aceptamos.
 *
 * **`consejo_comunitario` y `resguardo` no son relleno**: son figuras
 * territoriales colectivas colombianas —de comunidades negras y de pueblos
 * indígenas— que no son empresas y que este marketplace existe en parte para
 * incluir. Si el formulario solo ofreciera «empresa» y «cooperativa», les
 * estaría diciendo que se declaren algo que no son.
 *
 * `persona_natural` también cuenta: un artesano que factura a su nombre es un
 * proveedor perfectamente válido, y exigirle constituir una sociedad para
 * vender un kit de amenities sería el requisito que lo deja fuera.
 */
export const TIPOS_ORGANIZACION = [
  { id: "empresa", label: "Empresa o sociedad" },
  { id: "persona_natural", label: "Persona natural con actividad económica" },
  { id: "cooperativa", label: "Cooperativa o asociación de productores" },
  { id: "fundacion", label: "Fundación u ONG" },
  { id: "consejo_comunitario", label: "Consejo comunitario" },
  { id: "resguardo", label: "Resguardo o cabildo indígena" },
] as const;

export const IDS_TIPO_ORGANIZACION = TIPOS_ORGANIZACION.map((t) => t.id) as [
  string,
  ...string[],
];

export function etiquetaTipoOrganizacion(id: string | undefined): string {
  return TIPOS_ORGANIZACION.find((t) => t.id === id)?.label ?? "Organización";
}
