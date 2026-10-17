/**
 * La app en el PC con el modo MySQL (`docs/MODO-MYSQL.md`):
 *
 *   npm run dev:mysql        → http://localhost:3000
 *
 * Es `next dev` con cuatro variables puestas encima del `.env`:
 *
 * - `BASE_DE_DATOS=mysql`: datos, cuentas y fotos en el MariaDB de Hostinger.
 * - `ALMACEN_CARPETA`: las fotos van a `outputs/almacen-pruebas/` (la que llenó
 *   `copiar-datos.mts`), salvo que el `.env` diga otra.
 * - `NEXT_PUBLIC_SITE_URL=http://localhost:3000`: el `.env` trae el dominio de
 *   producción, y con él el enlace del correo y las redirecciones del acceso
 *   llevarían a seregenera.com, que sigue con Supabase.
 * - `NODE_OPTIONS=--use-system-ca`: en el PC de Jesús, Avast intercepta el SMTP
 *   y sin esto el correo con el código no sale (`docs/VARIABLES.md`, `SMTP_PORT`).
 *   Si aun así no sale, el código aparece en esta consola.
 *
 * La base está en Hostinger y el PC no: cada consulta cruza internet, así que
 * aquí las páginas tardan uno o dos segundos. Dentro de Hostinger, milisegundos.
 */
import { spawn } from "node:child_process";
import { join } from "node:path";

const raiz = join(import.meta.dirname, "..", "..");
const env = {
  ...process.env,
  BASE_DE_DATOS: "mysql",
  ALMACEN_CARPETA: process.env.ALMACEN_CARPETA ?? join(raiz, "outputs", "almacen-pruebas"),
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
  NODE_OPTIONS: [process.env.NODE_OPTIONS, "--use-system-ca"].filter(Boolean).join(" "),
};
console.log(`Modo MySQL en http://localhost:3000 · base ${process.env.MYSQL_DATABASE} · fotos en ${env.ALMACEN_CARPETA}\n`);
const hijo = spawn("npx", ["next", "dev", "-p", "3000"], { cwd: raiz, env, stdio: "inherit", shell: process.platform === "win32" });
hijo.on("exit", (codigo) => {
  process.exitCode = codigo ?? 0;
});
