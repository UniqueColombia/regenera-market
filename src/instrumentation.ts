/**
 * Lo que corre una vez, al arrancar el servidor (convención de Next:
 * `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md`).
 *
 * Solo revisa la configuración de producción y lo deja escrito en el registro
 * (`src/lib/configuracion.ts`). **No tumba el arranque**: una variable que falta
 * deja el sitio peor, pero un servidor que no arranca lo deja sin nada. La alarma
 * de verdad es `/api/latido`, que responde 503 con lo crítico y pone rojo el
 * monitor de GitHub.
 *
 * No corre al compilar (`next build` no tiene las variables de producción, y el
 * CI compila a propósito sin ninguna) ni en el entorno de borde.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { esProduccion, revisarConfiguracion } = await import("./lib/configuracion");
  if (!esProduccion()) return;

  const { criticos, avisos } = revisarConfiguracion();
  for (const c of criticos) console.error(`[configuracion] CRÍTICO: ${c}`);
  for (const a of avisos) console.warn(`[configuracion] aviso: ${a}`);
  if (!criticos.length && !avisos.length) console.log("[configuracion] producción completa");
}
