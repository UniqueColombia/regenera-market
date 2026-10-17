#!/usr/bin/env node
/**
 * Despliega un tag en producción (seregenera.com, Hostinger) de punta a punta.
 *
 *   node --env-file=.env scripts/desplegar.mts v0.11.2
 *   node --env-file=.env scripts/desplegar.mts v0.11.2 --sin-subir   # el zip ya está arriba
 *
 * Hace los pasos 3 a 7 de la skill `desplegar-hostinger`: arma el zip del tag,
 * lo sube a `public_html` por SFTP, compila con la API de Hostinger siguiendo el
 * registro, comprueba producción desde fuera y borra los zips viejos del PC.
 * El tag lo crea la persona antes (paso 2): este script no decide qué versión
 * sale.
 *
 * ## Por qué SFTP y no la API, ni un navegador automatizado
 *
 * La API de Hostinger compila y lista archivos con la llave de Jesús, pero **no
 * deja subir**: `files/upload-urls` responde 404 con el acceso compartido a la
 * cuenta de Ivan (comprobado el 2026-10-16 y el 2026-10-17). Automatizar hPanel
 * con Selenium se descartó: el login tiene captcha y segundo factor, el script
 * guardaría la contraseña de una cuenta que entra a todo el hosting de Ivan, y
 * cualquier cambio de pantalla lo rompe sin avisar. SFTP es el canal que el
 * plan ofrece para esto, y con una llave SSH no hay contraseña que guardar.
 *
 * ## Lo que necesita en el `.env`
 *
 * - `HOSTINGER_API_KEY`: la llave de la API (la misma del MCP).
 * - `HOSTINGER_SSH_HOST` y `HOSTINGER_SSH_PORT`: hPanel → `seregenera.com` →
 *   Avanzado → Acceso SSH. El puerto suele ser 65002.
 * - `HOSTINGER_SSH_KEY`, opcional: la llave privada; por defecto
 *   `~/.ssh/seregenera_hostinger`. Su `.pub` se agrega una vez en esa misma
 *   pantalla. Cómo, en `desplegar-hostinger`.
 *
 * El usuario de SSH no se escribe en ningún lado: es el `username` de hosting,
 * que se le pide a la API. El repositorio es público.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, unlinkSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DOMINIO = "seregenera.com";
const API = "https://developers.hostinger.com/api/hosting/v1";

/** La misma configuración que se usó a mano desde `v0.11.0` (skill `desplegar-hostinger`). */
const AJUSTES_BUILD = {
  node_version: 22,
  app_type: "next",
  root_directory: ".",
  output_directory: ".next",
  build_script: "build",
  package_manager: "npm",
  source_type: "archive",
};

const args = process.argv.slice(2);
const version = args.find((a) => !a.startsWith("--"));
const sinSubir = args.includes("--sin-subir");

const raiz = join(import.meta.dirname, "..");
const carpetaZips = join(raiz, "outputs", "despliegue");

function git(...a: string[]): { ok: boolean; salida: string } {
  const r = spawnSync("git", a, { cwd: raiz, encoding: "utf8" });
  return { ok: r.status === 0, salida: (r.stdout ?? "").trim() + (r.stderr ?? "").trim() };
}

function paso(texto: string) {
  console.log(`\n▸ ${texto}`);
}

/**
 * Todo lo que habla con la red va aquí y devuelve el código de salida, sin
 * `process.exit()`: en Windows, con Node 24, cortar mientras `fetch` cierra sus
 * conexiones revienta con «Assertion failed: !(handle->flags &
 * UV_HANDLE_CLOSING)». Mismo motivo que en `plantillas-supabase.mts`.
 */
async function main(): Promise<number> {
  if (!version || !/^v\d+\.\d+\.\d+$/.test(version)) {
    console.error("Uso: node --env-file=.env scripts/desplegar.mts vX.Y.Z [--sin-subir]");
    return 1;
  }
  const token = process.env.HOSTINGER_API_KEY;
  const host = process.env.HOSTINGER_SSH_HOST;
  const puerto = process.env.HOSTINGER_SSH_PORT ?? "65002";
  const llave = process.env.HOSTINGER_SSH_KEY ?? join(homedir(), ".ssh", "seregenera_hostinger");
  if (!token) {
    console.error("Falta HOSTINGER_API_KEY en el .env.");
    return 1;
  }
  if (!sinSubir && (!host || !existsSync(llave))) {
    console.error(
      !host
        ? "Falta HOSTINGER_SSH_HOST en el .env (hPanel → seregenera.com → Avanzado → Acceso SSH)."
        : `No encuentro la llave SSH en ${llave}. Ver «Subir sin hPanel» en la skill desplegar-hostinger.`,
    );
    return 1;
  }

  const cabeceras = { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json" };
  const api = async (ruta: string, init?: RequestInit) => {
    const r = await fetch(`${API}${ruta}`, { ...init, headers: cabeceras });
    const texto = await r.text();
    let cuerpo: unknown = texto;
    try {
      cuerpo = JSON.parse(texto);
    } catch {
      /* se queda el texto */
    }
    return { status: r.status, cuerpo: cuerpo as Record<string, unknown> };
  };

  // --- 1. El tag existe en GitHub y está en main --------------------------------
  paso(`Tag ${version}`);
  git("fetch", "-q", "origin", "--tags");
  if (!git("ls-remote", "--exit-code", "--tags", "origin", `refs/tags/${version}`).ok) {
    console.error(`${version} no está en GitHub. Créalo sobre origin/main y empújalo (paso 2 de la skill).`);
    return 1;
  }
  if (!git("merge-base", "--is-ancestor", version, "origin/main").ok) {
    console.error(`${version} no está en origin/main: producción sale siempre de main.`);
    return 1;
  }
  console.log("  en GitHub y dentro de main");

  // --- 2. El zip, plano --------------------------------------------------------
  const nombreZip = `seregenera-${version}.zip`;
  const zip = join(carpetaZips, nombreZip);
  paso(`Zip ${nombreZip}`);
  mkdirSync(carpetaZips, { recursive: true });
  if (!existsSync(zip)) {
    const r = git("archive", "--format=zip", "-o", zip, version);
    if (!r.ok) {
      console.error(`git archive falló: ${r.salida}`);
      return 1;
    }
  }
  console.log("  listo (git archive: solo lo versionado, sin .env ni node_modules)");

  // --- 3. El sitio y que no haya un build en marcha -----------------------------
  paso("Hostinger");
  const sitios = await api(`/websites?domain=${DOMINIO}`);
  const sitio = (sitios.cuerpo.data as { domain: string; username: string; root_directory: string }[] | undefined)?.find(
    (w) => w.domain === DOMINIO,
  );
  if (sitios.status !== 200 || !sitio) {
    console.error(`No encuentro ${DOMINIO} en la API (${sitios.status}). ¿Venció la llave?`);
    return 1;
  }
  const base = `/accounts/${sitio.username}/websites/${DOMINIO}/nodejs/builds`;
  const enMarcha = await api(`${base}?per_page=1&states[]=running&states[]=pending`);
  if ((enMarcha.cuerpo.meta as { total?: number } | undefined)?.total) {
    console.error("Hay un build en marcha. Espera a que termine (o mira hPanel) y vuelve a correrlo.");
    return 1;
  }
  console.log("  sin builds en marcha");

  // --- 4. Subir por SFTP --------------------------------------------------------
  if (!sinSubir) {
    paso("Subiendo por SFTP");
    const r = spawnSync(
      "scp",
      [
        "-P", puerto,
        "-i", llave,
        "-o", "BatchMode=yes",
        "-o", "StrictHostKeyChecking=accept-new",
        zip,
        `${sitio.username}@${host}:${sitio.root_directory}/${nombreZip}`,
      ],
      { stdio: "inherit" },
    );
    if (r.status !== 0) {
      console.error("La subida falló. Si dice «Permission denied», la llave no está agregada en hPanel → Acceso SSH.");
      return 1;
    }
  }
  const archivos = await api(`/accounts/${sitio.username}/domains/${DOMINIO}/files?max_depth=1`);
  const nombres = ((archivos.cuerpo.items as { name: string }[] | undefined) ?? []).map((i) => i.name);
  if (!nombres.includes(nombreZip)) {
    console.error(`${nombreZip} no está en public_html (hay: ${nombres.join(", ") || "nada"}).`);
    return 1;
  }
  console.log(`  ${nombreZip} está en public_html`);

  // --- 5. Compilar y seguir el registro -----------------------------------------
  paso("Compilando en Hostinger");
  const inicio = await api(base, {
    method: "POST",
    body: JSON.stringify({ ...AJUSTES_BUILD, source_options: { archive_path: nombreZip } }),
  });
  const uuid = ((inicio.cuerpo.data as Record<string, unknown> | undefined) ?? inicio.cuerpo).uuid as string | undefined;
  if (!uuid) {
    console.error(`No arrancó el build (${inicio.status}): ${JSON.stringify(inicio.cuerpo).slice(0, 300)}`);
    return 1;
  }
  let lineas = 0;
  let estado = "pending";
  const limite = Date.now() + 15 * 60_000;
  while (Date.now() < limite) {
    await new Promise((r) => setTimeout(r, 5000));
    const registro = await api(`${base}/${uuid}/logs?from_line=${lineas}`);
    const nuevo = registro.cuerpo as { logs?: string; lines?: number };
    if (nuevo.logs) process.stdout.write(nuevo.logs.endsWith("\n") ? nuevo.logs : `${nuevo.logs}\n`);
    if (typeof nuevo.lines === "number") lineas = nuevo.lines;
    const b = await api(`${base}/${uuid}`);
    estado = String(((b.cuerpo.data as Record<string, unknown> | undefined) ?? b.cuerpo).state ?? estado);
    if (estado === "completed" || estado === "failed") break;
  }
  if (estado !== "completed") {
    console.error(
      estado === "failed"
        ? "El build falló. La versión anterior sigue sirviendo. El registro está arriba; la skill tiene las trampas conocidas."
        : "El build no terminó en 15 minutos. Míralo en hPanel antes de volver a lanzarlo.",
    );
    return 1;
  }

  // --- 6. Comprobar desde fuera -------------------------------------------------
  paso("Comprobando producción");
  const sitioUrl = `https://${DOMINIO}`;
  let fallos = 0;
  for (const ruta of ["/", "/catalogo", "/proveedores", "/entrar", "/registro", "/terminos", "/privacidad", "/api/latido", "/robots.txt", "/bimi.svg"]) {
    const r = await fetch(sitioUrl + ruta, { redirect: "manual" });
    const ok = r.status === 200;
    if (!ok) fallos++;
    console.log(`  ${ok ? "✓" : "✗"} ${r.status} ${ruta}`);
  }
  const catalogo = await (await fetch(`${sitioUrl}/catalogo`)).text();
  const ofertas = new Set(catalogo.match(/href="\/oferta\/[a-z0-9-]+"/g) ?? []).size;
  console.log(`  ${ofertas > 0 ? "✓" : "✗"} ${ofertas} ofertas en el catálogo`);
  if (ofertas === 0) fallos++;
  // El enlace del correo: antes de `v0.11.2` redirigía a https://0.0.0.0:3000.
  const callback = await fetch(`${sitioUrl}/auth/callback`, { redirect: "manual" });
  const destino = callback.headers.get("location") ?? "";
  const callbackOk = destino.startsWith(`${sitioUrl}/`);
  if (!callbackOk) fallos++;
  console.log(`  ${callbackOk ? "✓" : "✗"} /auth/callback → ${destino || "(sin redirección)"}`);
  const portada = await fetch(sitioUrl, { method: "HEAD" });
  for (const c of ["content-security-policy", "strict-transport-security", "x-frame-options"]) {
    const ok = portada.headers.has(c);
    if (!ok) fallos++;
    console.log(`  ${ok ? "✓" : "✗"} cabecera ${c}`);
  }
  if (fallos > 0) {
    console.error(`\n${fallos} comprobaciones fallaron. No se borra nada: el zip anterior es la vuelta atrás.`);
    return 1;
  }

  // --- 7. Limpiar: solo queda la versión vigente --------------------------------
  paso("Limpiando");
  for (const viejo of readdirSync(carpetaZips).filter((n) => /^seregenera-.*\.zip$/.test(n) && n !== nombreZip)) {
    unlinkSync(join(carpetaZips, viejo));
    console.log(`  borrado del PC: ${viejo}`);
  }
  const despues = await api(`/accounts/${sitio.username}/domains/${DOMINIO}/files?max_depth=1`);
  const quedan = ((despues.cuerpo.items as { name: string }[] | undefined) ?? []).map((i) => i.name);
  const sobran = quedan.filter((n) => n.endsWith(".zip"));
  console.log(
    sobran.length > 0
      ? `  ! en public_html quedó ${sobran.join(", ")}: bórralo en el Administrador de archivos`
      : "  public_html sin zips",
  );

  console.log(`\n✓ ${version} en producción. Lo visual se revisa en el navegador.`);
  return 0;
}

process.exitCode = await main();
