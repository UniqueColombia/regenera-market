import { plantillaDeProspectos } from "@/lib/plantilla-prospectos";

/**
 * La planilla en blanco de «Contactar proveedores».
 *
 * Pública, como `/api/plantilla-ofertas`: solo trae títulos de columnas,
 * instrucciones y listas, ningún dato de nadie. Se genera en cada petición
 * para que la lista de departamentos salga siempre de `taxonomy.ts`.
 */
export function GET() {
  return new Response(plantillaDeProspectos() as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="plantilla-prospectos-seregenera.xlsx"',
      "Cache-Control": "public, max-age=3600",
    },
  });
}
