import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Un <form> sin `method` que se envía antes de que React tome la página sale
    // por GET, con cada campo en la URL: así quedó una contraseña en la barra de
    // direcciones el 2026-10-22. `method="post"` (o una acción de servidor en
    // `action`, que ya va por POST), o `method="get"` si es un buscador.
    files: ["src/**/*.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "JSXOpeningElement[name.name='form']:not(:has(JSXAttribute[name.name=/^(method|action)$/]))",
          message:
            'Todo <form> lleva method="post" (o method="get" si es un buscador). Ver src/lib/url-sensible.ts.',
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
