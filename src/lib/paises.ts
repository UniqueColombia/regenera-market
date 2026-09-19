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
 * ## La ley no es colombiana
 *
 * La cláusula de autorización de datos de `/vender` decía «conforme a la Ley
 * 1581 de 2012» a secas. Esa es la ley **colombiana**, y en un formulario que
 * acepta proveedores de dieciocho países pasa una de dos cosas: o el peruano que
 * la lee concluye que el sitio no es para él, o firma una autorización que cita
 * una norma que no le aplica — que es peor, porque no autoriza nada.
 *
 * La redacción que manda es la general («la normativa de protección de datos que
 * te aplique») y `proteccionDatos` solo **nombra** la de su país cuando la
 * sabemos, que es lo que le da fuerza a una autorización: saber bajo qué norma
 * se otorga. Cuando no la sabemos, la cláusula general sigue siendo válida y no
 * se inventa una ley.
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
  /**
   * La norma de protección de datos personales de ese país.
   *
   * **Solo sirve para nombrarla en la cláusula de autorización**, nunca para
   * decidir si se puede guardar un dato: eso lo decide la política de
   * privacidad del sitio, que es una y vale para todos. Ver el comentario
   * «La ley no es colombiana» más abajo.
   *
   * `undefined` cuando no la conocemos o el país es «Otro». La cláusula se
   * queda entonces en su redacción general, que es la que de verdad manda.
   */
  proteccionDatos?: string;
}

export const PAISES: Pais[] = [
  { nombre: "Colombia", codigo: "CO", documento: "NIT", division: "Departamento", proteccionDatos: "la Ley 1581 de 2012" },
  { nombre: "Argentina", codigo: "AR", documento: "CUIT", division: "Provincia", proteccionDatos: "la Ley 25.326 de Protección de los Datos Personales" },
  { nombre: "Bolivia", codigo: "BO", documento: "NIT", division: "Departamento", proteccionDatos: "la normativa boliviana de protección de datos" },
  { nombre: "Brasil", codigo: "BR", documento: "CNPJ", division: "Estado", proteccionDatos: "la Lei Geral de Proteção de Dados (Lei 13.709/2018)" },
  { nombre: "Chile", codigo: "CL", documento: "RUT", division: "Región", proteccionDatos: "la Ley 19.628 sobre protección de la vida privada" },
  { nombre: "Costa Rica", codigo: "CR", documento: "Cédula jurídica", division: "Provincia", proteccionDatos: "la Ley 8968 de Protección de la Persona" },
  { nombre: "Ecuador", codigo: "EC", documento: "RUC", division: "Provincia", proteccionDatos: "la Ley Orgánica de Protección de Datos Personales" },
  { nombre: "El Salvador", codigo: "SV", documento: "NIT", division: "Departamento", proteccionDatos: "la Ley de Protección de Datos Personales" },
  { nombre: "Guatemala", codigo: "GT", documento: "NIT", division: "Departamento", proteccionDatos: "la normativa guatemalteca de protección de datos" },
  { nombre: "Honduras", codigo: "HN", documento: "RTN", division: "Departamento", proteccionDatos: "la normativa hondureña de protección de datos" },
  { nombre: "México", codigo: "MX", documento: "RFC", division: "Estado", proteccionDatos: "la Ley Federal de Protección de Datos Personales en Posesión de los Particulares" },
  { nombre: "Nicaragua", codigo: "NI", documento: "RUC", division: "Departamento", proteccionDatos: "la Ley 787 de Protección de Datos Personales" },
  { nombre: "Panamá", codigo: "PA", documento: "RUC", division: "Provincia", proteccionDatos: "la Ley 81 de 2019 de Protección de Datos Personales" },
  { nombre: "Paraguay", codigo: "PY", documento: "RUC", division: "Departamento", proteccionDatos: "la Ley 6534 de Protección de Datos Personales" },
  { nombre: "Perú", codigo: "PE", documento: "RUC", division: "Región", proteccionDatos: "la Ley 29733 de Protección de Datos Personales" },
  { nombre: "República Dominicana", codigo: "DO", documento: "RNC", division: "Provincia", proteccionDatos: "la Ley 172-13 de Protección de Datos Personales" },
  { nombre: "Uruguay", codigo: "UY", documento: "RUT", division: "Departamento", proteccionDatos: "la Ley 18.331 de Protección de Datos Personales" },
  { nombre: "Venezuela", codigo: "VE", documento: "RIF", division: "Estado", proteccionDatos: "la normativa venezolana de protección de datos" },
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
