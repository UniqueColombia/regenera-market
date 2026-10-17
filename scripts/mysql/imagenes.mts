/**
 * Etapa 3 del experimento MySQL: las fotos del catálogo que hoy están en
 * Supabase Storage, copiadas a la carpeta de `AlmacenDisco`, y sus URL
 * cambiadas **en el espejo de MySQL**.
 *
 *   node --env-file=.env scripts/mysql/espejo.mts       # primero: rehace el espejo
 *   ALMACEN_CARPETA=… node --env-file=.env scripts/mysql/imagenes.mts
 *
 * Una sola dirección, como el espejo: descarga las fotos públicas (las mismas
 * URL que ve cualquier visitante) y escribe solo en la carpeta y en MySQL.
 * **En Supabase no cambia nada**: ni los archivos, ni las URL guardadas.
 *
 * `ALMACEN_CARPETA` va en el comando y no en el `.env`. En el `.env`, un
 * `npm run dev` guardaría las fotos nuevas en el disco del PC y su URL en la
 * base de producción, donde se verían rotas.
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { nuevaBaseMysql } from "../../src/lib/mysql/conexion.ts";
import { comoUsuario } from "../../src/lib/mysql/ofertas.ts";
import { leerImagen, urlEnDisco } from "../../src/lib/almacen-disco.ts";
import type { Bucket } from "../../src/lib/almacenamiento.ts";

const STORAGE = /\/storage\/v1\/object\/public\/(avatares|logos)\/([0-9a-f-]{36})\/([a-z0-9.-]+)(?:\?v=(\d+))?$/;

async function main(): Promise<number> {
  const carpeta = process.env.ALMACEN_CARPETA;
  if (!carpeta) {
    console.error("Falta ALMACEN_CARPETA (en el comando, no en el .env).");
    return 1;
  }
  const db = nuevaBaseMysql();
  let fallos = 0;
  try {
    const ofertas = await comoUsuario(db, { id: null, rol: "servicio" }, (t) =>
      t.selectFrom("listings").select(["id", "slug", "images"]).execute(),
    );
    let copiadas = 0;
    for (const oferta of ofertas) {
      const imagenes = oferta.images;
      if (!imagenes.some((u) => STORAGE.test(u))) continue;
      const nuevas: string[] = [];
      for (const url of imagenes) {
        const m = STORAGE.exec(url);
        if (!m) {
          nuevas.push(url);
          continue;
        }
        const [, bucket, duenio, archivo, v] = m;
        const r = await fetch(url);
        if (!r.ok) {
          fallos++;
          console.log(`  ✗ ${oferta.slug}: ${r.status} al bajar ${archivo}`);
          nuevas.push(url);
          continue;
        }
        const bytes = Buffer.from(await r.arrayBuffer());
        await mkdir(join(carpeta, bucket, duenio), { recursive: true });
        await writeFile(join(carpeta, bucket, duenio, archivo), bytes);
        const nueva = urlEnDisco(bucket as Bucket, duenio, v ? Number(v).toString(36) : "0", archivo);
        // Se lee de vuelta por el mismo camino que usa la ruta `/archivos`.
        const leida = await leerImagen(carpeta, nueva.replace(/^\/archivos\//, "").split("/"));
        const igual = leida && createHash("sha256").update(leida.cuerpo).digest("hex") === createHash("sha256").update(bytes).digest("hex");
        if (!igual) {
          fallos++;
          console.log(`  ✗ ${oferta.slug}: ${archivo} no se lee igual desde el disco`);
          nuevas.push(url);
          continue;
        }
        copiadas++;
        nuevas.push(nueva);
      }
      await comoUsuario(db, { id: null, rol: "servicio" }, (t) =>
        t.updateTable("listings").set({ images: JSON.stringify(nuevas) }).where("id", "=", oferta.id).execute(),
      );
      console.log(`  ✓ ${oferta.slug}: ${nuevas.filter((u) => u.startsWith("/archivos/")).length} foto(s) al disco`);
    }
    console.log(`\n${copiadas} fotos copiadas a ${carpeta} y apuntadas en MySQL. Supabase, sin cambios.`);
  } finally {
    await db.destroy();
  }
  return fallos ? 1 : 0;
}

process.exitCode = await main();
