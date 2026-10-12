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
    ],
  },
});
