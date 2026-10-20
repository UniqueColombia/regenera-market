# Copias cifradas, el monitor apuntado a producción con revisión de configuración, y Dependabot

- **Fecha:** 2026-10-20
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `fix/js-endurecer-guarda-y-dependencias`, `feat/js-copias-cifradas-y-monitor`, `chore/js-dependencias-dependabot` y `fix/js-latido-cdn` → `staging` → `main` (entrega directa), tags `v0.12.4` y `v0.12.5`, **las dos desplegadas el 2026-10-20**
- **Fase del roadmap:** — (vía B-2: después del corte)
- **Sigue a:** [2026-10-17-pendientes-de-la-auditoria-y-copias.md](2026-10-17-pendientes-de-la-auditoria-y-copias.md)

## Qué se hizo

Jesús pidió una auditoría de seguridad de 20 puntos de todos sus proyectos, con
énfasis en este. Resultado aquí: 9 cumplen, 8 cumplen con observaciones y 3
parciales (cifrado de datos y copias, protección contra bots, vigilancia de
dependencias); nada crítico. El informe completo no se versiona (describe
debilidades abiertas de un sitio en producción y el repo es público): lo guarda
Jesús fuera del repo. Se trabajó desde el PC de la oficina, que no tiene la
llave SSH ni `HOSTINGER_API_KEY`: lo que toca el servidor quedó preparado y
probado en local, y se aplica desde el de la casa (pendientes abajo y en
`docs/ESTADO.md`).

| Hallazgo | Arreglo |
|---|---|
| La guarda de `BOLD_MODO_PRUEBAS` miraba `VERCEL_ENV`, que en Hostinger no existe: con la variable en `1` y la llave vacía, cualquiera podría firmar un aviso de pago falso (latente: producción no tiene llaves de BOLD) | Mira `NODE_ENV` (`payments.ts`), con su prueba |
| `X-Powered-By: Next.js` en cada respuesta | `poweredByHeader: false` |
| Nadie vigilaba las dependencias de forma continua | Workflow `dependencias.yml` (`npm audit --omit=dev --audit-level=high` cada lunes y al cambiar el lock) y **Dependabot** (`.github/dependabot.yml`): versiones contra `staging`, menores y parches agrupados; las de seguridad las abre GitHub contra `main`. Cómo se tratan sus PRs: skill `entrega-directa` |
| Las copias diarias de la base y las fotos estaban en claro, en el servidor y en el PC que las baja | Cifradas con llave pública (CMS de OpenSSL, AES-256 + RSA-4096): `respaldar.sh` cifra con un certificado y **se niega sin él**; la llave privada vive en el PC y en el gestor. `respaldos.mts` gana `llave`, `descifrar` y `retirar-sin-cifrar`; `instalar` comprueba que la pareja abre lo que cierra antes de subir el certificado; `probar` descifra en el servidor con la llave en un temporal que se borra pase lo que pase |
| La app degrada en silencio cuando le falta una variable; en producción, perder `BASE_DE_DATOS=mysql` la devolvería a Supabase y partiría los datos | `src/lib/configuracion.ts` describe lo que producción necesita; `src/instrumentation.ts` lo escribe en el registro al arrancar y `/api/latido` responde 503 (`"configuracion"`) si falta algo crítico |
| `latido.yml` vigilaba el Vercel de respaldo, al que ya no hay acceso | Apunta a `https://seregenera.com/api/latido`; sin el paso de Supabase |
| El build que Jesús lanzó en Hostinger tras poner `SESION_SECRETO` (sobre `v0.12.3`) **falló**: «Collecting page data using 57 workers» y «OS can't spawn worker thread». Next abre un proceso por CPU visible y la cuenta compartida tiene tope de hilos; los anteriores pasaron rozándolo. El sitio siguió con el build previo | `experimental.cpus: 4` en `next.config.ts` (comprobado: «using 4 workers») |

Además, en producción (por el MCP, solo lectura): `SESION_SECRETO` faltaba y
Jesús la puso el mismo día. **Corrección a la auditoría:** en el modo MySQL la
cookie que firma (`sgr_actividad`) se escribe pero no se lee —la inactividad la
decide la tabla `sesiones` en el servidor—, así que su falta no era explotable
en producción; solo cuenta si se vuelve a Supabase.

## El mismo día, después

- **El build de Hostinger murió tres veces** («Collecting page data using 57
  workers» → «OS can't spawn worker thread»), primero sobre `v0.12.3` al poner
  `SESION_SECRETO`. No lo causaron las variables. `v0.12.4` lo arregla
  (`experimental.cpus: 4`); se probó antes compilando el zip del tag en una
  carpeta limpia. Si alguna vez hay que recompilar una versión sin ese ajuste,
  la variable `CIRCLE_NODE_TOTAL=5` en la Web App hace lo mismo (Next la usa
  para contar CPUs).
- **Despliegue desde la oficina sin `HOSTINGER_API_KEY`:** el zip
  (`git archive` del tag, como `desplegar.mts`) se subió por `scp` con la llave
  SSH nueva de ese PC y el build se lanzó con el MCP. `v0.12.4` y luego `v0.12.5`
  (Next 16.4.2, React 19.3 y diez dependencias menores más). Comprobado: rutas
  en 200, `/auth/callback` al dominio, sin `X-Powered-By`, y
  `[configuracion] producción completa` en el registro.
- **Dependabot abrió 7 PRs en la primera hora.** Aplicados en local y
  verificados (los mismos commits, por `staging`): `actions/checkout` y
  `actions/setup-node` v7, y el grupo de 12 menores. Cerrados con motivo:
  ESLint 10 (rompe `eslint-plugin-react` de `eslint-config-next`) y
  TypeScript 7 (`typescript-eslint` no lo soporta); volverán con la próxima
  versión. `@types/node` y `embedded-postgres` en mayor quedan ignorados en
  `dependabot.yml`: siguen a Node 22 y al Postgres 17 de Supabase.
- **El primer latido contra `seregenera.com` falló con 403:** la CDN de
  Hostinger responde con un desafío anti-bots al user-agent de `curl` desde las
  IP de GitHub. Con user-agent de navegador pasa (200); si el desafío vuelve, el
  job lo deja como aviso, no como caída.

## Por qué así

- **Llave pública y no una contraseña en el servidor:** con cifrado simétrico la
  clave tendría que vivir junto a las copias. Con el certificado, el servidor
  puede cerrar y no abrir. Contra quien ya tiene la cuenta de hosting no
  protege (lee la base directamente); protege las copias que salen: al PC, a un
  disco, a donde se guarden.
- **CMS de OpenSSL y no `age` ni `gpg`:** `openssl` está en el servidor
  compartido y en Git for Windows; `age` habría que instalarlo, y `gpg` trae un
  llavero que administrar. Probado en local con OpenSSL 3.2: 30 MB cifrados y
  descifrados idénticos; una llave ajena se rechaza.
- **Sin certificado, `respaldar.sh` falla** en vez de copiar en claro: una copia
  en claro «por si acaso» es justo lo que se quería quitar. El cron avisa del
  fallo en su salida.
- **La revisión de configuración no tumba el arranque:** un servidor que no
  arranca deja el sitio sin nada; uno al que le falta algo, peor. La alarma es el
  latido en 503, que manda el correo. Los mensajes nombran variables, nunca
  valores.
- **Dependabot pese a los correos:** Jesús lo pidió para enterarse antes de que
  algo pase. `dependencias.yml` se queda: falla el CI aunque nadie haya
  encendido las alertas en Settings.
- **No se cifraron campos de la base** (`tax_id`, `phone`): `tax_id` lleva un
  índice único («un documento, una empresa», migración 0022) que el cifrado
  rompería sin un índice ciego. Es una decisión de diseño, no un arreglo.
- **Las 5 vulnerabilidades «high» que muestra el `npm install` de Hostinger** son
  de desarrollo (`eslint-config-next` → `braces`), no viajan al sitio, y el
  «arreglo» que propone npm es bajar a Next 14. Se espera al de upstream;
  Dependabot lo propondrá. Por eso `dependencias.yml` audita con `--omit=dev`.
- **No se añadió `import "server-only"`:** las pruebas y los scripts importan
  esos módulos con `node` pelado y fallarían.

## Qué quedó pendiente

La lista para el PC de la casa, en orden, está en `docs/ESTADO.md` (recuadro del
2026-10-20). En resumen:

- [ ] Variables de la Web App: confirmar que `IS_WEBPACK_TEST` se fue (el
      2026-10-20 la API todavía la listaba) y borrar las tres de Supabase
      después de guardar sus valores en el gestor. **`NEXT_PUBLIC_SITE_URL` no
      se borra.**
- [ ] Desplegar `v0.12.4` y comprobar latido, cabeceras y el registro.
- [ ] Copias cifradas: `llave` → gestor → `instalar` → `probar` →
      `retirar-sin-cifrar` → `bajar`, y borrar las copias en claro del PC.
- [ ] Ivan: encender Dependabot alerts y security updates en Settings → Code
      security (Jesús no es administrador del repositorio).
- [ ] Quitar del `.env` del PC de la oficina el usuario y la contraseña de
      hPanel (`docs/VARIABLES.md` dice que no van ahí).
- [ ] Bajos, de la auditoría: Turnstile en `/registro` y `/entrar` si aparece
      abuso, que «Regístrate» no diga si el correo existe, subir el costo de
      scrypt, caducidad de los aparatos de confianza, dos `select("*")`.

## Qué se rompe si tocas esto

- **La llave privada de respaldos es la única forma de abrir las copias.**
  Generar otra pareja e `instalar` deja las copias anteriores solo para la
  vieja: no borrarla del gestor hasta que caduquen (14 días en el servidor).
- `respaldar.sh` comprueba «Dump completed» **antes** de cifrar: después ya no
  se puede leer en el servidor.
- Una variable nueva que producción necesite se agrega a
  `src/lib/configuracion.ts`; si no, el latido no se enterará de que falta.
- `/api/latido` responde 503 con configuración crítica incompleta: es a
  propósito, no lo «arregles» devolviendo 200.

## Verificación

- `npm run build`, `npx tsc --noEmit`, `npx eslint .` (0 errores) y `npm test`
  (incluye `configuracion.test.ts` y la guarda de `payments.test.ts`).
- `respaldar.sh` contra un servidor simulado (HOME falso, `.env` con la clave
  entre comillas simples y `$`, `mariadb-dump` de mentira): sin certificado se
  niega; con él deja solo `.cms`, que la llave abre (el volcado y las dos fotos);
  la copia en claro de hace 20 días caduca y la de ayer se queda; un volcado
  cortado falla sin dejar intermedios en claro.
- El fragmento de `probar` que escribe la llave y descifra: abre las dos copias
  y no deja `.llave.*` detrás.
- `respaldos.mts llave` crea la pareja y no pisa una existente; `descifrar`
  devuelve el archivo idéntico. Lo que necesita el servidor real (`instalar`,
  `probar`, `bajar`, `retirar-sin-cifrar`) **no se pudo probar desde la
  oficina**: es el primer pendiente con llave SSH.
