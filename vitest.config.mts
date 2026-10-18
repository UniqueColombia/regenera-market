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
      // - `mysql`: el modo MySQL (producción desde el 2026-10-17), contra un
      //   MariaDB vacío (`npm run test:mysql`): el job `mysql` del CI lo levanta,
      //   y en el PC hace falta uno propio en las `MYSQL_*`. Sin ellas se salta.
      {
        resolve: { alias },
        test: {
          name: "mysql",
          include: ["mysql/pruebas/**/*.test.ts"],
          environment: "node",
          setupFiles: ["mysql/pruebas/entorno.ts"],
          globalSetup: ["mysql/pruebas/preparar.ts"],
          testTimeout: 60_000,
          hookTimeout: 120_000,
          // Una base compartida: un archivo a la vez.
          fileParallelism: false,
        },
      },
    ],
  },
});
