/**
 * Cuánto texto acepta cada campo del formulario de alta.
 *
 * ## Por qué vive en su propio archivo y no junto al esquema
 *
 * Porque lo usan los dos lados: `actions.ts` para validar en el servidor y
 * `application-form.tsx` para poner el `maxLength` del campo y el contador que
 * se ve mientras se escribe. Y `actions.ts` lleva `"use server"`.
 *
 * **Un módulo `"use server"` solo puede exportar funciones asíncronas.** Lo que
 * un componente de cliente recibe al importar de ahí no es el valor: es una
 * referencia a una acción del servidor. Esto se vivió: `LIMITES` estuvo unos
 * minutos exportado desde `actions.ts`, el build pasó sin quejarse, y el HTML
 * servido salió con `maxLength="t"` — el objeto no era un objeto, así que el
 * tope no se aplicaba en ningún campo. No falla nada visible; simplemente el
 * límite no existe hasta que el servidor lo rechaza.
 *
 * Se descubrió leyendo el HTML servido, no compilando. De ahí la regla: **una
 * constante que comparten servidor y cliente no vive en un archivo con
 * `"use server"`**, vive en uno normal que los dos importan.
 *
 * ## El mínimo también está aquí
 *
 * Por lo mismo: el contador del formulario necesita saber cuándo dejar de decir
 * «te faltan N caracteres», y ese número tiene que ser el mismo que rechaza el
 * servidor. Dos copias divergen el día que alguien ajusta una.
 */
export const LIMITES = {
  name: 160,
  contactName: 120,
  phone: 40,
  department: 80,
  city: 80,
  taxId: 40,
  website: 200,
  description: 2000,
} as const;

/** El mínimo de la descripción. Espeja el `.min()` de `PostulacionSchema`. */
export const MINIMO_DESCRIPCION = 120;
