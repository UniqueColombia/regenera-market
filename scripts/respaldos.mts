#!/usr/bin/env node
/**
 * Las copias de seguridad de producción (seregenera.com): la base y las fotos.
 *
 *   node --env-file=.env scripts/respaldos.mts instalar   sube scripts/servidor/respaldar.sh a ~/respaldos y hace una copia ya
 *   node --env-file=.env scripts/respaldos.mts probar     restaura la última copia en una base temporal, la compara y la borra
 *   node --env-file=.env scripts/respaldos.mts bajar      trae la última copia a outputs/respaldos/ (fuera de Hostinger)
 *
 * La copia la hace cada día un cron de la cuenta de Hostinger que corre
 * `respaldar.sh` (se crea una vez, con la API: `hosting_cron-jobs_create`). Lo que
 * guarda, cuánto tiempo y cómo se restaura: docs/MODO-MYSQL.md, «Copias de
 * seguridad».
 *
 * **Por qué `bajar`:** las copias del servidor sirven contra un error (un
 * despliegue que borra, una consulta mal hecha), no contra perder la cuenta de
 * hosting. Para eso hace falta una fuera, y la única máquina nuestra es este PC.
 * `outputs/` no se versiona: la copia tiene datos personales y el repo es público.
 *
 * Lo que necesita del `.env`: `HOSTINGER_API_KEY`, `HOSTINGER_SSH_HOST`,
 * `HOSTINGER_SSH_PORT` (y la llave `~/.ssh/seregenera_hostinger`), como
 * `scripts/desplegar.mts`. El usuario de hosting se le pide a la API: no se
 * escribe en el repositorio.
 */
import { spawnSync } from "node:child_process";
import { randomInt } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DOMINIO = "seregenera.com";
const API = "https://developers.hostinger.com/api/hosting/v1";
const raiz = join(import.meta.dirname, "..");
const ENV_APP = "$HOME/domains/seregenera.com/hbuilds/config/.env";

async function api(ruta: string, init?: RequestInit): Promise<{ status: number; cuerpo: Record<string, unknown> }> {
  const r = await fetch(`${API}${ruta}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.HOSTINGER_API_KEY}`, Accept: "application/json", "Content-Type": "application/json" },
  });
  const texto = await r.text();
  try {
    return { status: r.status, cuerpo: JSON.parse(texto) };
  } catch {
    return { status: r.status, cuerpo: { texto } };
  }
}

async function usuarioDeHosting(): Promise<string> {
  const { status, cuerpo } = await api(`/websites?domain=${DOMINIO}`);
  const sitio = (cuerpo.data as { domain: string; username: string }[] | undefined)?.find((w) => w.domain === DOMINIO);
  if (status !== 200 || !sitio) throw new Error(`No encuentro ${DOMINIO} en la API de Hostinger (${status}).`);
  return sitio.username;
}

function ssh(usuario: string, comando: string, entrada?: string): { ok: boolean; salida: string } {
  const r = spawnSync(
    "ssh",
    [
      "-p", process.env.HOSTINGER_SSH_PORT ?? "65002",
      "-i", process.env.HOSTINGER_SSH_KEY ?? join(homedir(), ".ssh", "seregenera_hostinger"),
      "-o", "BatchMode=yes",
      "-o", "StrictHostKeyChecking=accept-new",
      `${usuario}@${process.env.HOSTINGER_SSH_HOST}`,
      comando,
    ],
    { input: entrada, encoding: "utf8" },
  );
  return { ok: r.status === 0, salida: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
}

function paso(texto: string): void {
  console.log(`\n▸ ${texto}`);
}

// ---------------------------------------------------------------------------

async function instalar(usuario: string): Promise<number> {
  paso("Subiendo respaldar.sh a ~/respaldos");
  const script = readFileSync(join(raiz, "scripts", "servidor", "respaldar.sh"), "utf8").replace(/\r\n/g, "\n");
  const subida = ssh(usuario, "umask 077; mkdir -p ~/respaldos && cat > ~/respaldos/respaldar.sh && chmod 700 ~/respaldos/respaldar.sh", script);
  if (!subida.ok) return fallo(subida.salida);
  paso("Primera copia");
  const copia = ssh(usuario, "bash ~/respaldos/respaldar.sh");
  console.log(`  ${copia.salida}`);
  if (!copia.ok) return 1;
  console.log(`\n  El cron diario corre: /bin/bash /home/${usuario}/respaldos/respaldar.sh`);
  return 0;
}

/**
 * Restaura la última copia en una base temporal creada para esto, compara las
 * filas con producción y borra la base. Los conteos pueden diferir en lo que se
 * escribió después de la copia (las visitas de `page_views`, sobre todo): lo que
 * se prueba es que la copia **se restaura entera** —tablas, filas, rutinas,
 * triggers y vistas—, no que coincida al segundo.
 */
async function probar(usuario: string): Promise<number> {
  const nombre = `${usuario}_restauracion`;
  const grupos = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnopqrstuvwxyz", "23456789"];
  const c = grupos.map((g) => g[randomInt(g.length)]);
  while (c.length < 28) c.push(grupos.join("")[randomInt(grupos.join("").length)]);
  const clave = c.sort(() => randomInt(3) - 1).join("");

  paso(`Base temporal ${nombre}`);
  const creada = await api(`/accounts/${usuario}/databases`, {
    method: "POST",
    body: JSON.stringify({ name: nombre, user: nombre, password: clave, website_domain: DOMINIO }),
  });
  if (creada.status >= 300) return fallo(`no se pudo crear (${creada.status}): ${JSON.stringify(creada.cuerpo).replaceAll(clave, "***").slice(0, 300)}`);

  try {
    paso("Restaurando la última copia y comparando");
    // Todo por la entrada estándar: la clave temporal no aparece en ninguna
    // línea de comando. Las cláusulas DEFINER se quitan porque la base temporal
    // tiene otro usuario; restaurando en producción, con su propio usuario, no
    // hace falta.
    const guion = `
set -euo pipefail
leer() { local v; v=$(grep -E "^$1=" "${ENV_APP}" | head -n1 | cut -d= -f2-); v=\${v%$'\\r'}; v=\${v#\\"}; v=\${v%\\"}; printf '%s' "$v"; }
ULTIMA=$(ls -1 ~/respaldos/base-*.sql.gz | sort | tail -n 1)
FOTOS=$(ls -1 ~/respaldos/fotos-*.tar.gz | sort | tail -n 1)
echo "  copia: $(basename "$ULTIMA") y $(basename "$FOTOS")"
TMP_PWD='${clave}'
zcat "$ULTIMA" | sed -E 's/DEFINER=\`[^\`]*\`@\`[^\`]*\`//g' | MYSQL_PWD="$TMP_PWD" mariadb -h 127.0.0.1 -u '${nombre}' '${nombre}'
en() { MYSQL_PWD="$TMP_PWD" mariadb -N -B -h 127.0.0.1 -u '${nombre}' '${nombre}' -e "$1"; }
prod() { MYSQL_PWD="$(leer MYSQL_PASSWORD)" mariadb -N -B -h 127.0.0.1 -u "$(leer MYSQL_USER)" "$(leer MYSQL_DATABASE)" -e "$1"; }
echo "  rutinas $(en "select count(*) from information_schema.routines where routine_schema = database()") · triggers $(en "select count(*) from information_schema.triggers where trigger_schema = database()") · vistas $(en "select count(*) from information_schema.views where table_schema = database()")   (producción: $(prod "select count(*) from information_schema.routines where routine_schema = database()") · $(prod "select count(*) from information_schema.triggers where trigger_schema = database()") · $(prod "select count(*) from information_schema.views where table_schema = database()"))"
for t in $(en "select table_name from information_schema.tables where table_schema = database() and table_type = 'BASE TABLE' order by 1"); do
  a=$(en "select count(*) from \\\`$t\\\`"); b=$(prod "select count(*) from \\\`$t\\\`")
  if [ "$a" = "$b" ]; then m="✓"; else m="≠"; fi
  printf '  %s %-28s copia %6s · hoy %6s\\n' "$m" "$t" "$a" "$b"
done
echo "  fotos en la copia: $(tar -tzf "$FOTOS" | grep -vc '/$') · hoy en disco: $(find "$(leer ALMACEN_CARPETA)" -type f | wc -l)"
`;
    const r = ssh(usuario, "bash -s", guion);
    console.log(r.salida.replaceAll(clave, "***"));
    if (!r.ok) return 1;
    console.log("\n  ≠ solo en tablas que cambian solas (page_views, sesiones, codigos) es lo esperado: se escribió después de la copia.");
    return 0;
  } finally {
    paso(`Borrando ${nombre}`);
    const borrada = await api(`/accounts/${usuario}/databases/${nombre}`, { method: "DELETE" });
    const quedan = await api(`/accounts/${usuario}/databases?per_page=100`);
    const sigue = (quedan.cuerpo.data as { name: string }[] | undefined)?.some((d) => d.name === nombre);
    console.log(sigue ? `  ⚠️ sigue existiendo (${borrada.status}): bórrala en hPanel → Bases de datos` : "  borrada");
  }
}

/** La última copia a `outputs/respaldos/`, con sus fechas. Se quedan las cuatro más recientes. */
async function bajar(usuario: string): Promise<number> {
  paso("Última copia del servidor");
  const lista = ssh(usuario, "cd ~/respaldos && ls -1 base-*.sql.gz fotos-*.tar.gz | sort");
  if (!lista.ok) return fallo(lista.salida);
  const nombres = lista.salida.split("\n").map((l) => l.trim()).filter(Boolean);
  const ultimas = [nombres.filter((n) => n.startsWith("base-")).at(-1), nombres.filter((n) => n.startsWith("fotos-")).at(-1)].filter(Boolean) as string[];
  if (ultimas.length < 2) return fallo("no hay copias en ~/respaldos: corre primero «instalar»");
  const destino = join(raiz, "outputs", "respaldos");
  mkdirSync(destino, { recursive: true });
  for (const n of ultimas) {
    const r = spawnSync(
      "scp",
      [
        "-p",
        "-P", process.env.HOSTINGER_SSH_PORT ?? "65002",
        "-i", process.env.HOSTINGER_SSH_KEY ?? join(homedir(), ".ssh", "seregenera_hostinger"),
        "-o", "BatchMode=yes",
        `${usuario}@${process.env.HOSTINGER_SSH_HOST}:respaldos/${n}`,
        n,
      ],
      { cwd: destino, stdio: "inherit" },
    );
    if (r.status !== 0) return fallo(`no bajó ${n}`);
    console.log(`  ${n}`);
  }
  for (const prefijo of ["base-", "fotos-"]) {
    const viejas = readdirSync(destino).filter((n) => n.startsWith(prefijo)).sort().slice(0, -4);
    for (const n of viejas) unlinkSync(join(destino, n));
  }
  console.log(`  en ${destino}`);
  return 0;
}

function fallo(texto: string): number {
  console.error(`  falló: ${texto}`);
  return 1;
}

const ORDENES: Record<string, (usuario: string) => Promise<number>> = { instalar, probar, bajar };
const orden = process.argv[2] ?? "";
if (!Object.hasOwn(ORDENES, orden)) {
  console.error("Uso: node --env-file=.env scripts/respaldos.mts instalar|probar|bajar");
  process.exitCode = 1;
} else if (!process.env.HOSTINGER_API_KEY || !process.env.HOSTINGER_SSH_HOST) {
  console.error("Faltan HOSTINGER_API_KEY y HOSTINGER_SSH_HOST en el .env (docs/VARIABLES.md).");
  process.exitCode = 1;
} else {
  process.exitCode = await ORDENES[orden](await usuarioDeHosting());
}
