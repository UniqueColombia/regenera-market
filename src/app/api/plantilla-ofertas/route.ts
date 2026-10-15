import { plantillaDeOfertas } from "@/lib/plantilla-ofertas";

/**
 * La plantilla de Excel para cargar muchas ofertas de una vez.
 *
 * Pública a propósito: no lleva ningún dato de nadie —solo los títulos de las
 * columnas, las listas de categorías y departamentos, y tres ejemplos
 * inventados—, y así se puede enlazar desde el correo de invitación a un
 * proveedor que todavía no tiene cuenta.
 *
 * Se genera en cada petición en vez de guardarse como archivo: las listas salen
 * de `src/lib/taxonomy.ts`, y una plantilla guardada se quedaría con las
 * categorías de cuando se generó.
 */
export function GET() {
  const archivo = plantillaDeOfertas();
  return new Response(archivo as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="plantilla-ofertas-seregenera.xlsx"',
      // Una hora: cambia solo cuando cambia la taxonomía, que viaja con un despliegue.
      "Cache-Control": "public, max-age=3600",
    },
  });
}
