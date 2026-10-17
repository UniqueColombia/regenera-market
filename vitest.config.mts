import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Dos proyectos porque piden cosas distintas:
// - `unidad`: funciones puras de `src/lib` (precios, transiciones, niveles…).
//   Milisegundos, sin nada alrededor. `npm test` corre solo estas.
// - `base`: las migraciones y las funciones de Postgres, contra un Postgres de
//   verdad que levanta `preparar-base.ts`. Tarda más (arrancar Postgres y
//   aplicar las migraciones). `npm run test:base`.
const alias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unidad",
          include: ["src/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        resolve: { alias },
        test: {
          name: "base",
          include: ["supabase/pruebas/**/*.test.ts"],
          environment: "node",
          globalSetup: ["supabase/pruebas/preparar-base.ts"],
          testTimeout: 30_000,
          hookTimeout: 120_000,
        },
      },
      // - `mysql`: el experimento MySQL, contra la base de pruebas de Hostinger
      //   (`npm run test:mysql`). Necesita las `MYSQL_*` del `.env`; sin ellas
      //   (el CI) se salta. Cada consulta cruza internet: tarda segundos.
      {
        resolve: { alias },
        test: {
          name: "mysql",
          include: ["mysql/pruebas/**/*.test.ts"],
          environment: "node",
          setupFiles: ["mysql/pruebas/entorno.ts"],
          testTimeout: 60_000,
          hookTimeout: 120_000,
          // Una base compartida: un archivo a la vez.
          fileParallelism: false,
        },
      },
    ],
  },
});
