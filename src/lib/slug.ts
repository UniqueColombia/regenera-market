/**
 * De un nombre a un slug de URL.
 *
 * El slug es parte de la dirección pública de una oferta y de un proveedor
 * (`/oferta/canasta-de-cacao`, `/proveedor/cooperativa-el-roble`), así que tiene
 * dos propiedades que no son estéticas:
 *
 * - **Es único** — la columna lleva `unique` en `0001_init.sql`. Quien lo genera
 *   tiene que contar con que ya exista y añadir sufijo, no confiar en que no.
 * - **Es estable.** Cambiarlo rompe cualquier enlace que alguien haya guardado
 *   o mandado por WhatsApp. Por eso el formulario de edición lo deja tocar pero
 *   lo avisa: se cambia cuando el nombre estaba mal, no cuando suena mejor.
 *
 * Las tildes se pasan a su letra base en vez de borrarse: «Bogotá» es
 * `bogota`, no `bogot`. La eñe se convierte en `n` por la misma razón, aunque
 * `ñ` sea válida en una URL moderna — se ve fatal codificada como `%C3%B1` en un
 * mensaje pegado.
 */
export function slugify(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

/**
 * Un slug que no choque con los que ya existen.
 *
 * `existe` decide: se le pasa una función que consulta la base, para que este
 * módulo siga sin saber nada de Supabase y se pueda probar sin base de datos.
 *
 * El sufijo es numérico y no aleatorio a propósito: `-2` se lee y se dicta por
 * teléfono; `-a7f3` no.
 */
export async function slugLibre(
  base: string,
  existe: (slug: string) => Promise<boolean>,
): Promise<string> {
  const raiz = slugify(base) || "oferta";
  if (!(await existe(raiz))) return raiz;

  for (let n = 2; n < 100; n++) {
    const intento = `${raiz}-${n}`;
    if (!(await existe(intento))) return intento;
  }

  // Cien colisiones del mismo nombre no es un caso real; si pasa, más vale un
  // slug feo que un error.
  return `${raiz}-${Date.now().toString(36)}`;
}
