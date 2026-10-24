import { ESTILO, escribirLibro, type CeldaEscrita } from "./hoja-de-calculo";
import { ENCAJES } from "./prospectos";
import { DEPARTMENTS } from "./taxonomy";

/**
 * La planilla en blanco para cargar prospectos en «Contactar proveedores»
 * (pedido de Jesús, 2026-10-23: «que esté el formato disponible en la página»).
 *
 * Los títulos son los que `leerPlanillaDeProspectos()` reconoce primero
 * (`ALIAS` de `src/lib/prospectos.ts`): si se cambia uno aquí, tiene que seguir
 * estando en esa lista, o la planilla que el equipo descarga deja de leerse.
 *
 * **No lleva una hoja de ejemplo con estos títulos.** El importador lee todas
 * las hojas que tengan columna de empresa y alguna de contacto, así que una
 * hoja «Ejemplo» con filas inventadas se importaría como prospectos de verdad.
 * El ejemplo va escrito en «Instrucciones», en una sola columna.
 */
const COLUMNAS: { titulo: string; obligatoria: boolean; ayuda: string; ancho: number }[] = [
  { titulo: "Empresa", obligatoria: true, ayuda: "Razón social o nombre comercial.", ancho: 34 },
  { titulo: "NIT", obligatoria: false, ayuda: "Con o sin dígito de verificación. Evita cargar dos veces la misma empresa.", ancho: 16 },
  { titulo: "Correo", obligatoria: false, ayuda: "El que la empresa publica como contacto. Sin correo no se le puede escribir desde aquí.", ancho: 30 },
  { titulo: "Teléfono", obligatoria: false, ayuda: "Fijo o celular. Con celular se le puede escribir por WhatsApp.", ancho: 18 },
  { titulo: "Sitio web", obligatoria: false, ayuda: "Dirección completa, con https://.", ancho: 30 },
  { titulo: "Instagram", obligatoria: false, ayuda: "Enlace o @usuario.", ancho: 22 },
  { titulo: "Ciudad", obligatoria: false, ayuda: "Se puede usar en el correo como {ciudad}.", ancho: 18 },
  { titulo: "Departamento", obligatoria: false, ayuda: "Elige de la lista.", ancho: 20 },
  { titulo: "Categoría", obligatoria: false, ayuda: "Qué vende o para quién: «Amenities», «Hoteles», lo que sirva para filtrar.", ancho: 24 },
  { titulo: "Encaje", obligatoria: false, ayuda: "Alto, Medio, Bajo o Descartar. Los «Descartar» no se importan salvo que lo pidas.", ancho: 12 },
  { titulo: "Notas", obligatoria: false, ayuda: "Lo que el equipo quiera recordar de esta empresa.", ancho: 40 },
];

const FILAS_CON_DESPLEGABLE = 1001;

export function plantillaDeProspectos(): Uint8Array {
  const encabezado: CeldaEscrita[] = COLUMNAS.map((c) => ({
    v: c.titulo,
    s: c.obligatoria ? ESTILO.obligatorio : ESTILO.encabezado,
  }));
  const departamentos = [...DEPARTMENTS];
  const encajes = Object.values(ENCAJES);
  const largo = Math.max(departamentos.length, encajes.length);
  const columna = (titulo: string) => COLUMNAS.findIndex((c) => c.titulo === titulo);

  return escribirLibro([
    {
      nombre: "Prospectos",
      anchos: COLUMNAS.map((c) => c.ancho),
      filas: [encabezado],
      fijarEncabezado: true,
      validaciones: [
        {
          columna: columna("Departamento"),
          desde: 2,
          hasta: FILAS_CON_DESPLEGABLE,
          rango: `Listas!$A$2:$A$${departamentos.length + 1}`,
          aviso: "Elige un departamento de la lista (hoja «Listas»).",
        },
        {
          columna: columna("Encaje"),
          desde: 2,
          hasta: FILAS_CON_DESPLEGABLE,
          rango: `Listas!$B$2:$B$${encajes.length + 1}`,
          aviso: "Alto, Medio, Bajo o Descartar.",
        },
      ],
    },
    {
      nombre: "Instrucciones",
      anchos: [24, 14, 90],
      filas: [
        [{ v: "Cómo llenar esta planilla", s: ESTILO.titulo }],
        [],
        [{ v: "1. Una fila por empresa, en la hoja «Prospectos». Solo «Empresa» es obligatoria, pero sin correo ni teléfono no hay cómo contactarla.", s: ESTILO.negrita }],
        [{ v: "2. Súbela en Administración → Contactar → «Importar desde Excel o CSV». Las que ya estén (mismo NIT o correo) se saltan sin pisar lo anotado.", s: ESTILO.negrita }],
        [{ v: "3. Solo datos que la empresa publica (su sitio web, sus redes) o que están en un registro público. Nada de correos o teléfonos personales.", s: ESTILO.negrita }],
        [{ v: "4. También sirve el Excel del prospector tal cual, y cualquier planilla con columnas como «Empresa», «Correo», «Teléfono».", s: ESTILO.negrita }],
        [],
        [{ v: "Ejemplo de una fila: Empresa «Tejidos del Sur S.A.S.» · NIT 901234567 · Correo contacto@tejidosdelsur.co · Teléfono 3001234567 · Ciudad Pasto · Departamento Nariño · Encaje Alto", s: ESTILO.nota }],
        [],
        [
          { v: "Columna", s: ESTILO.encabezado },
          { v: "¿Obligatoria?", s: ESTILO.encabezado },
          { v: "Qué escribir", s: ESTILO.encabezado },
        ],
        ...COLUMNAS.map((c) => [
          { v: c.titulo, s: ESTILO.negrita },
          { v: c.obligatoria ? "Sí" : "No" },
          { v: c.ayuda, s: ESTILO.nota },
        ]),
      ],
    },
    {
      nombre: "Listas",
      anchos: [28, 16],
      filas: [
        [
          { v: "Departamento", s: ESTILO.encabezado },
          { v: "Encaje", s: ESTILO.encabezado },
        ],
        ...Array.from({ length: largo }, (_, i) => [{ v: departamentos[i] ?? "" }, { v: encajes[i] ?? "" }]),
      ],
      fijarEncabezado: true,
    },
  ]);
}
