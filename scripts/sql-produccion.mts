/**
 * Corre un archivo .sql contra la base de producción y enseña el resultado.
 *
 *   node --env-file=.env scripts/sql-produccion.mts consulta.sql
 *
 * Para consultas y arreglos de datos puntuales (despublicar un lote, contar
 * filas). **No para cambiar el esquema**: eso es `scripts/servidor/aplicar-sql.mjs`,
 * que cuida los DEFINER (`docs/MODO-MYSQL.md`, «Trampas que ya costaron una
 * caída»).
 *
 * Corre en el servidor, por SSH, con el cliente `mariadb` y las credenciales
 * que la app ya tiene allí: la clave no viaja al PC ni aparece en la línea de
 * comandos. Lo que necesita del `.env` es lo mismo que `respaldos.mts`:
 * `HOSTINGER_API_KEY`, `HOSTINGER_SSH_HOST` y `HOSTINGER_SSH_PORT`, más la llave
 * `~/.ssh/seregenera_hostinger`.
 *
 * Un `update` o un `delete` aquí es producción: antes, una copia
 * (`respaldos.mts instalar` hace una al momento) y una transacción en el
 * propio .sql.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const API = "https://developers.hostinger.com/api/hosting/v1";
const DOMINIO = "seregenera.com";
const ENV_APP = "$HOME/domains/seregenera.com/hbuilds/config/.env";

const archivo = process.argv[2];
if (!archivo || !archivo.endsWith(".sql") || !existsSync(archivo)) {
  console.error("Uso: node --env-file=.env scripts/sql-produccion.mts archivo.sql");
  process.exit(1);
}

const r = await fetch(`${API}/websites?domain=${DOMINIO}`, {
  headers: { Authorization: `Bearer ${process.env.HOSTINGER_API_KEY}`, Accept: "application/json" },
});
const sitio = ((await r.json()) as { data?: { domain: string; username: string }[] }).data?.find(
  (w) => w.domain === DOMINIO,
);
if (!r.ok || !sitio) {
  console.error(`No encuentro ${DOMINIO} en la API de Hostinger (${r.status}).`);
  process.exit(1);
}

// La misma lectura de variables que `respaldos.mts probar`: quita el `\r` y las
// comillas con que Hostinger puede guardarlas.
const guion = `
set -euo pipefail
leer() { local v; v=$(grep -E "^$1=" "${ENV_APP}" | head -n1 | cut -d= -f2-); v=\${v%$'\\r'}; case "$v" in \\'*\\' | \\"*\\") v=\${v:1:\${#v}-2} ;; esac; printf '%s' "$v"; }
MYSQL_PWD="$(leer MYSQL_PASSWORD)" mariadb -t -h 127.0.0.1 -u "$(leer MYSQL_USER)" "$(leer MYSQL_DATABASE)"
`;

const ssh = spawnSync(
  "ssh",
  [
    "-p", process.env.HOSTINGER_SSH_PORT ?? "65002",
    "-i", process.env.HOSTINGER_SSH_KEY ?? join(homedir(), ".ssh", "seregenera_hostinger"),
    "-o", "BatchMode=yes",
    "-o", "StrictHostKeyChecking=accept-new",
    `${sitio.username}@${process.env.HOSTINGER_SSH_HOST}`,
    `bash -c '${guion.replaceAll("'", "'\\''")}'`,
  ],
  { input: readFileSync(archivo, "utf8"), encoding: "utf8" },
);
process.stdout.write(ssh.stdout ?? "");
process.stderr.write(ssh.stderr ?? "");
process.exit(ssh.status ?? 1);
