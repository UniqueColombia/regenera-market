#!/usr/bin/env node
/**
 * Las copias de seguridad de producción (seregenera.com): la base y las fotos, cifradas.
 *
 *   node scripts/respaldos.mts llave                              crea en este PC la pareja de llaves del cifrado (una vez)
 *   node --env-file=.env scripts/respaldos.mts instalar           sube respaldar.sh y el certificado a ~/respaldos y hace una copia ya
 *   node --env-file=.env scripts/respaldos.mts probar             restaura la última copia en una base temporal, la compara y la borra
 *   node --env-file=.env scripts/respaldos.mts bajar              trae la última copia (cifrada) a outputs/respaldos/
 *   node --env-file=.env scripts/respaldos.mts retirar-sin-cifrar borra del servidor las copias viejas en claro
 *   node scripts/respaldos.mts descifrar <archivo.cms>            descifra una copia bajada, junto a ella
 *
 * La copia la hace cada día un cron de la cuenta de Hostinger que corre
 * `respaldar.sh` (se crea una vez, con la API: `hosting_cron-jobs_create`). Lo que
 * guarda, cuánto tiempo y cómo se restaura: docs/MODO-MYSQL.md, «Copias de
 * seguridad».
 *
 * **El cifrado (desde el 2026-10-20).** El servidor cifra cada copia con un
 * certificado (CMS de OpenSSL); la llave privada que la abre solo está en el PC
 * y en el gestor de contraseñas. Por defecto, la pareja vive junto a la llave SSH:
 * `~/.ssh/seregenera_respaldos.key` y `.crt` (o en `RESPALDOS_LLAVE` y
 * `RESPALDOS_CERTIFICADO`). **Perder la llave privada es perder todas las copias**:
 * por eso `llave` pide guardarla en el gestor antes de seguir, e `instalar`
 * comprueba que la llave de este PC abre lo que el certificado cierra antes de
 * subirlo.
 *
 * `probar` necesita descifrar en el servidor: manda la llave por la entrada
 * estándar de SSH a un archivo temporal (permisos 600) que se borra al terminar,
 * pase lo que pase. Nunca va en una línea de comando.
 *
 * **Por qué `bajar`:** las copias del servidor sirven contra un error (un
 * despliegue que borra, una consulta mal hecha), no contra perder la cuenta de
 * hosting. Para eso hace falta una fuera, y la única máquina nuestra es este PC.
 * Llegan cifradas y así se quedan; `descifrar` las abre cuando hagan falta.
 * `outputs/` no se versiona: la copia tiene datos personales y el repo es público.
 *
 * Lo que necesita del `.env` (salvo `llave` y `descifrar`, que son locales):
 * `HOSTINGER_API_KEY`, `HOSTINGER_SSH_HOST`, `HOSTINGER_SSH_PORT` (y la llave
 * `~/.ssh/seregenera_hostinger`), como `scripts/desplegar.mts`. El usuario de
 * hosting se le pide a la API: no se escribe en el repositorio.
 */
import { spawnSync } from "node:child_process";
import { randomInt } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, unlinkSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { gunzipSync } from "node:zlib";

const DOMINIO = "seregenera.com";
const API = "https://developers.hostinger.com/api/hosting/v1";
const raiz = join(import.meta.dirname, "..");
const ENV_APP = "$HOME/domains/seregenera.com/hbuilds/config/.env";
const LLAVE = process.env.RESPALDOS_LLAVE ?? join(homedir(), ".ssh", "seregenera_respaldos.key");
const CERTIFICADO = process.env.RESPALDOS_CERTIFICADO ?? join(homedir(), ".ssh", "seregenera_respaldos.crt");

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

/**
 * El `openssl` de este PC. En Windows no suele estar en el PATH de PowerShell,
 * pero Git for Windows trae uno; `OPENSSL` manda sobre todo.
 */
function openssl(): string {
  if (process.env.OPENSSL) return process.env.OPENSSL;
  if (process.platform === "win32") {
    // El de mingw64 primero: es un binario de Windows y entiende sus rutas sin traducir.
    for (const ruta of ["C:\\Program Files\\Git\\mingw64\\bin\\openssl.exe", "C:\\Program Files\\Git\\usr\\bin\\openssl.exe"]) {
      if (existsSync(ruta)) return ruta;
    }
  }
  return "openssl";
}

function ossl(args: string[], entrada?: string | Buffer): { ok: boolean; salida: string; bytes: Buffer } {
  const r = spawnSync(openssl(), args, { input: entrada, maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, salida: `${r.stderr ?? ""}`.trim() || String(r.error ?? ""), bytes: r.stdout ?? Buffer.alloc(0) };
}

function paso(texto: string): void {
  console.log(`\n▸ ${texto}`);
}

/**
 * ¿La llave de este PC abre lo que cierra el certificado? Se cifra una frase con
 * el certificado y se descifra con la llave: si no vuelve igual, subir ese
 * certificado sería empezar a hacer copias que nadie puede abrir.
 */
function comprobarPareja(): string | null {
  if (!existsSync(LLAVE) || !existsSync(CERTIFICADO)) {
    return `falta la pareja de llaves (${LLAVE} y ${CERTIFICADO}): créala con «node scripts/respaldos.mts llave» o tráela del gestor de contraseñas`;
  }
  const frase = `prueba ${Date.now()}`;
  const cifrado = ossl(["cms", "-encrypt", "-binary", "-aes256", "-outform", "DER", CERTIFICADO], frase);
  if (!cifrado.ok) return `no se pudo cifrar con el certificado: ${cifrado.salida}`;
  const vuelta = ossl(["cms", "-decrypt", "-binary", "-inform", "DER", "-inkey", LLAVE], cifrado.bytes);
  if (!vuelta.ok || vuelta.bytes.toString() !== frase) return "la llave de este PC NO abre lo que cierra el certificado: no son pareja";
  return null;
}

// ---------------------------------------------------------------------------

/** Crea la pareja en este PC. Nunca pisa una que ya exista. */
async function llave(): Promise<number> {
  if (existsSync(LLAVE) || existsSync(CERTIFICADO)) {
    const problema = comprobarPareja();
    console.log(problema ? `  Ya hay archivos de llave, pero: ${problema}` : `  Ya existe y es pareja: ${LLAVE}`);
    return problema ? 1 : 0;
  }
  paso("Creando la pareja de llaves del cifrado de copias");
  mkdirSync(join(homedir(), ".ssh"), { recursive: true });
  const r = ossl([
    "req", "-x509", "-newkey", "rsa:4096", "-nodes",
    "-keyout", LLAVE, "-out", CERTIFICADO,
    "-days", "3650", "-subj", "/CN=seregenera respaldos",
  ]);
  if (!r.ok) return fallo(r.salida);
  const problema = comprobarPareja();
  if (problema) return fallo(problema);
  console.log(`  llave privada: ${LLAVE}`);
  console.log(`  certificado:   ${CERTIFICADO}`);
  console.log("\n  ⚠️  ANTES DE SEGUIR: guarda el contenido de la llave privada en el gestor de");
  console.log("     contraseñas (nota segura «Seregenera — llave de respaldos»). Sin ella, las");
  console.log("     copias cifradas no se pueden abrir nunca, y este PC puede perderse.");
  console.log("     El certificado no es secreto, pero guárdalo junto a la llave.");
  return 0;
}

async function instalar(usuario: string): Promise<number> {
  paso("Comprobando la pareja de llaves de este PC");
  const problema = comprobarPareja();
  if (problema) return fallo(problema);
  console.log("  la llave abre lo que cierra el certificado");

  paso("Subiendo el certificado y respaldar.sh a ~/respaldos");
  const certificado = readFileSync(CERTIFICADO, "utf8").replace(/\r\n/g, "\n");
  const subidaCert = ssh(usuario, "umask 077; mkdir -p ~/respaldos && cat > ~/respaldos/respaldos.crt", certificado);
  if (!subidaCert.ok) return fallo(subidaCert.salida);
  const script = readFileSync(join(raiz, "scripts", "servidor", "respaldar.sh"), "utf8").replace(/\r\n/g, "\n");
  const subida = ssh(usuario, "umask 077; mkdir -p ~/respaldos && cat > ~/respaldos/respaldar.sh && chmod 700 ~/respaldos/respaldar.sh", script);
  if (!subida.ok) return fallo(subida.salida);

  paso("Primera copia");
  const copia = ssh(usuario, "bash ~/respaldos/respaldar.sh");
  console.log(`  ${copia.salida}`);
  if (!copia.ok) return 1;
  console.log(`\n  El cron diario corre: /bin/bash /home/${usuario}/respaldos/respaldar.sh`);
  console.log("  Siguiente: «probar», para comprobar que la copia cifrada se restaura entera.");
  return 0;
}

/** Solo nombres que este script escribe: nada de `/`, `..` ni espacios (auditoría del 2026-10-22). */
const NOMBRE_DE_COPIA = /^(base|fotos)-\d{4}-\d{2}-\d{2}\.(sql|tar)\.gz\.cms$/;

/** Baja por scp un archivo de `~/respaldos` a `carpeta`, conservando la fecha. */
function bajarArchivo(usuario: string, nombre: string, carpeta: string): boolean {
  const r = spawnSync(
    "scp",
    [
      "-p",
      "-P", process.env.HOSTINGER_SSH_PORT ?? "65002",
      "-i", process.env.HOSTINGER_SSH_KEY ?? join(homedir(), ".ssh", "seregenera_hostinger"),
      "-o", "BatchMode=yes",
      `${usuario}@${process.env.HOSTINGER_SSH_HOST}:respaldos/${nombre}`,
      nombre,
    ],
    { cwd: carpeta, stdio: "inherit" },
  );
  return r.status === 0;
}

/**
 * Restaura la última copia en una base temporal creada para esto, compara las
 * filas con producción y borra la base. Los conteos pueden diferir en lo que se
 * escribió después de la copia (las visitas de `page_views`, sobre todo): lo que
 * se prueba es que la copia **se restaura entera** —tablas, filas, rutinas,
 * triggers y vistas—, no que coincida al segundo.
 *
 * **La llave privada no sale de este PC** (desde el 2026-10-22). Antes viajaba
 * al servidor en un temporal que solo se borraba si la conexión no se cortaba, y
 * eso rompía la promesa de `respaldar.sh`: en el servidor solo está el
 * certificado. Ahora las copias cifradas bajan, se descifran aquí, y al servidor
 * llega el SQL ya en claro por la entrada estándar, directo a la base temporal.
 * Los descifrados del PC se borran al terminar, pase lo que pase.
 */
async function probar(usuario: string): Promise<number> {
  const problema = comprobarPareja();
  if (problema) return fallo(problema);

  const lista = ssh(usuario, "cd ~/respaldos && ls -1");
  const nombres = lista.salida.split("\n").map((l) => l.trim()).filter((n) => NOMBRE_DE_COPIA.test(n)).sort();
  const base = nombres.filter((n) => n.startsWith("base-")).at(-1);
  const fotos = nombres.filter((n) => n.startsWith("fotos-")).at(-1);
  if (!base || !fotos) return fallo("no hay copias cifradas en ~/respaldos: corre primero «instalar»");

  const nombre = `${usuario}_restauracion`;
  const grupos = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnopqrstuvwxyz", "23456789"];
  const c = grupos.map((g) => g[randomInt(g.length)]);
  while (c.length < 28) c.push(grupos.join("")[randomInt(grupos.join("").length)]);
  const clave = c.sort(() => randomInt(3) - 1).join("");
  const temporal = mkdtempSync(join(tmpdir(), "seregenera-probar-"));

  paso(`Bajando ${base} y ${fotos}`);
  if (!bajarArchivo(usuario, base, temporal) || !bajarArchivo(usuario, fotos, temporal)) {
    rmSync(temporal, { recursive: true, force: true });
    return fallo("no bajaron las copias");
  }

  paso(`Base temporal ${nombre}`);
  const creada = await api(`/accounts/${usuario}/databases`, {
    method: "POST",
    body: JSON.stringify({ name: nombre, user: nombre, password: clave, website_domain: DOMINIO }),
  });
  if (creada.status >= 300) {
    rmSync(temporal, { recursive: true, force: true });
    return fallo(`no se pudo crear (${creada.status}): ${JSON.stringify(creada.cuerpo).replaceAll(clave, "***").slice(0, 300)}`);
  }

  try {
    paso("Descifrando aquí, restaurando allá y comparando");
    const sqlGz = join(temporal, "base.sql.gz");
    const tarGz = join(temporal, "fotos.tar.gz");
    for (const [entra, sale] of [[join(temporal, base), sqlGz], [join(temporal, fotos), tarGz]]) {
      const r = ossl(["cms", "-decrypt", "-binary", "-inform", "DER", "-inkey", LLAVE, "-in", entra, "-out", sale]);
      if (!r.ok) return fallo(r.salida);
    }
    // Las cláusulas DEFINER se quitan porque la base temporal tiene otro
    // usuario; restaurando en producción, con su propio usuario, no hace falta.
    const volcado = gunzipSync(readFileSync(sqlGz)).toString("utf8").replace(/DEFINER=`[^`]*`@`[^`]*`/g, "");
    // La clave va en la primera línea de la entrada, no en la línea de comando.
    const restaurada = ssh(
      usuario,
      `read -r TMP_PWD; MYSQL_PWD="$TMP_PWD" mariadb -h 127.0.0.1 -u '${nombre}' '${nombre}'`,
      `${clave}\n${volcado}`,
    );
    if (!restaurada.ok) return fallo(restaurada.salida.replaceAll(clave, "***"));
    // Solo el nombre, con la carpeta como `cwd`: con la ruta entera, el `tar` de
    // Git que suele ganar en el PATH de Windows lee `C:` como un servidor
    // remoto, no lista nada, y la copia salía con «0 fotos» teniendo diez
    // (2026-10-23). El `tar` de Windows y el de Git aceptan los dos un nombre
    // relativo.
    const enLaCopia = spawnSync("tar", ["-tzf", basename(tarGz)], {
      cwd: dirname(tarGz),
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
    });
    const fotosEnLaCopia = (enLaCopia.stdout ?? "").split("\n").filter((l) => l && !l.endsWith("/")).length;

    const guion = `
set -euo pipefail
leer() { local v; v=$(grep -E "^$1=" "${ENV_APP}" | head -n1 | cut -d= -f2-); v=\${v%$'\\r'}; case "$v" in \\'*\\' | \\"*\\") v=\${v:1:\${#v}-2} ;; esac; printf '%s' "$v"; }
TMP_PWD='${clave}'
en() { MYSQL_PWD="$TMP_PWD" mariadb -N -B -h 127.0.0.1 -u '${nombre}' '${nombre}' -e "$1"; }
prod() { MYSQL_PWD="$(leer MYSQL_PASSWORD)" mariadb -N -B -h 127.0.0.1 -u "$(leer MYSQL_USER)" "$(leer MYSQL_DATABASE)" -e "$1"; }
# Pocas conexiones: con dos por tabla, una tras otra, el MariaDB compartido
# dejó de aceptarlas a la décima tabla (ERROR 2002).
OBJETOS="select concat_ws(' · ', (select count(*) from information_schema.routines where routine_schema = database()), (select count(*) from information_schema.triggers where trigger_schema = database()), (select count(*) from information_schema.views where table_schema = database()))"
echo "  rutinas · triggers · vistas: copia $(en "$OBJETOS") · hoy $(prod "$OBJETOS")"
CONTEO=$(en "select group_concat(concat('select ''', table_name, ''', count(*) from ', char(96), table_name, char(96)) order by table_name separator ' union all ') from information_schema.tables where table_schema = database() and table_type = 'BASE TABLE'")
# Variables y \`<<<\`, no \`< <(…)\`: el servidor (CageFS) no tiene /dev/fd.
HOY=$(prod "$CONTEO")
COPIA=$(en "$CONTEO")
declare -A hoy
while IFS=$'\\t' read -r t n; do hoy[$t]=$n; done <<< "$HOY"
while IFS=$'\\t' read -r t a; do
  b=\${hoy[$t]:-?}
  if [ "$a" = "$b" ]; then m="✓"; else m="≠"; fi
  printf '  %s %-28s copia %6s · hoy %6s\\n' "$m" "$t" "$a" "$b"
done <<< "$COPIA"
echo "  fotos en la copia: ${fotosEnLaCopia} · hoy en disco: $(find "$(leer ALMACEN_CARPETA)" -type f | wc -l)"
`;
    const r = ssh(usuario, "bash -s", guion);
    console.log(r.salida.replaceAll(clave, "***"));
    if (!r.ok) return 1;
    console.log("\n  ≠ solo en tablas que cambian solas (page_views, sesiones, codigos) es lo esperado: se escribió después de la copia.");
    return 0;
  } finally {
    rmSync(temporal, { recursive: true, force: true });
    paso(`Borrando ${nombre}`);
    const borrada = await api(`/accounts/${usuario}/databases/${nombre}`, { method: "DELETE" });
    const quedan = await api(`/accounts/${usuario}/databases?per_page=100`);
    const sigue = (quedan.cuerpo.data as { name: string }[] | undefined)?.some((d) => d.name === nombre);
    console.log(sigue ? `  ⚠️ sigue existiendo (${borrada.status}): bórrala en hPanel → Bases de datos` : "  borrada");
    // Las llaves que pudo dejar la versión anterior de este comando.
    ssh(usuario, "rm -f ~/respaldos/.llave.*");
  }
}

/** La última copia cifrada a `outputs/respaldos/`, con sus fechas. Se quedan las cuatro más recientes. */
async function bajar(usuario: string): Promise<number> {
  paso("Última copia del servidor");
  const lista = ssh(usuario, "cd ~/respaldos && ls -1 | grep -E '^(base|fotos)-.*\\.cms$' | sort");
  if (!lista.ok) return fallo(lista.salida || "no hay copias cifradas en ~/respaldos: corre primero «instalar»");
  const nombres = lista.salida.split("\n").map((l) => l.trim()).filter((n) => NOMBRE_DE_COPIA.test(n));
  const ultimas = [nombres.filter((n) => n.startsWith("base-")).at(-1), nombres.filter((n) => n.startsWith("fotos-")).at(-1)].filter(Boolean) as string[];
  if (ultimas.length < 2) return fallo("no hay copias cifradas en ~/respaldos: corre primero «instalar»");
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
    const viejas = readdirSync(destino).filter((n) => n.startsWith(prefijo) && n.endsWith(".cms")).sort().slice(0, -4);
    for (const n of viejas) unlinkSync(join(destino, n));
  }
  const enClaro = readdirSync(destino).filter((n) => /^(base|fotos)-.*\.(sql|tar)\.gz$/.test(n));
  if (enClaro.length) console.log(`  ⚠️ quedan ${enClaro.length} copias en claro de antes del cifrado en ${destino}: bórralas cuando «probar» haya salido bien.`);
  console.log(`  en ${destino} (cifradas; ábrelas con «descifrar»)`);
  return 0;
}

/**
 * Borra del servidor las copias en claro de antes del cifrado. Solo si ya hay
 * al menos una cifrada de cada tipo: sin ellas, borrar las viejas es quedarse
 * sin copias. Igual caducarían solas a los 14 días; esto es para no esperar.
 */
async function retirarSinCifrar(usuario: string): Promise<number> {
  paso("Copias en claro en ~/respaldos");
  const guion = `
set -euo pipefail
cd ~/respaldos
ls -1 base-*.sql.gz.cms >/dev/null 2>&1 || { echo "no hay ninguna copia cifrada de la base: no se borra nada"; exit 1; }
ls -1 fotos-*.tar.gz.cms >/dev/null 2>&1 || { echo "no hay ninguna copia cifrada de las fotos: no se borra nada"; exit 1; }
n=0
for f in base-*.sql.gz fotos-*.tar.gz; do
  [ -e "$f" ] || continue
  rm -f -- "$f"; echo "  borrada $f"; n=$((n + 1))
done
echo "  $n copias en claro borradas; quedan $(ls -1 *.cms | wc -l) cifradas"
`;
  const r = ssh(usuario, "bash -s", guion);
  console.log(r.salida);
  return r.ok ? 0 : 1;
}

/** Descifra una copia bajada a su lado, sin la extensión `.cms`. */
async function descifrar(): Promise<number> {
  const archivo = process.argv[3];
  if (!archivo || !archivo.endsWith(".cms") || !existsSync(archivo)) {
    return fallo("Uso: node scripts/respaldos.mts descifrar outputs/respaldos/base-AAAA-MM-DD.sql.gz.cms");
  }
  if (!existsSync(LLAVE)) return fallo(`falta la llave privada en ${LLAVE} (está en el gestor de contraseñas)`);
  const salida = archivo.slice(0, -".cms".length);
  const r = ossl(["cms", "-decrypt", "-binary", "-inform", "DER", "-inkey", LLAVE, "-in", archivo, "-out", salida]);
  if (!r.ok) return fallo(r.salida);
  console.log(`  ${salida}`);
  console.log("  ⚠️ queda en claro: bórralo cuando termines (tiene datos personales).");
  return 0;
}

function fallo(texto: string): number {
  console.error(`  falló: ${texto}`);
  return 1;
}

const REMOTAS: Record<string, (usuario: string) => Promise<number>> = {
  instalar,
  probar,
  bajar,
  "retirar-sin-cifrar": retirarSinCifrar,
};
const LOCALES: Record<string, () => Promise<number>> = { llave, descifrar };
const orden = process.argv[2] ?? "";
if (Object.hasOwn(LOCALES, orden)) {
  process.exitCode = await LOCALES[orden]();
} else if (!Object.hasOwn(REMOTAS, orden)) {
  console.error("Uso: node [--env-file=.env] scripts/respaldos.mts llave|instalar|probar|bajar|retirar-sin-cifrar|descifrar <archivo>");
  process.exitCode = 1;
} else if (!process.env.HOSTINGER_API_KEY || !process.env.HOSTINGER_SSH_HOST) {
  console.error("Faltan HOSTINGER_API_KEY y HOSTINGER_SSH_HOST en el .env (docs/VARIABLES.md).");
  process.exitCode = 1;
} else {
  process.exitCode = await REMOTAS[orden](await usuarioDeHosting());
}
