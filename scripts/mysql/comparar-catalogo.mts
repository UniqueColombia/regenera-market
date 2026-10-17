/**
 * Etapa 1 del experimento MySQL, de punta a punta: la misma app, dos fuentes.
 * Pide `/catalogo` con cada combinación de filtros a dos servidores —uno lee
 * de Supabase y el otro del espejo en MySQL— y compara el total y las ofertas,
 * **en orden**.
 *
 *   npm run build
 *   npx next start -p 3101                          # Supabase (como hoy)
 *   FUENTE_CATALOGO=mysql npx next start -p 3102    # el espejo
 *   node scripts/mysql/comparar-catalogo.mts [http://localhost:3101] [http://localhost:3102]
 *
 * Solo hace GET. Antes hay que correr `scripts/mysql/espejo.mts`, o las dos
 * bases no tienen por qué coincidir.
 */

const [supabase = "http://localhost:3101", mysql = "http://localhost:3102"] = process.argv.slice(2);

const CASOS = [
  "",
  "sort=relevance",
  "sort=price_asc",
  "sort=price_desc",
  "sort=impact",
  "sort=newest",
  "kind=product",
  "kind=experience",
  "kind=service",
  "vertical=hoteles",
  "vertical=transporte",
  "category=agua",
  "category=habitacion&subcategory=amenities",
  "department=Nari%C3%B1o",
  // Igualdad exacta, como en Postgres: sin la tilde no es el mismo departamento.
  "department=Narino",
  "department=Boyac%C3%A1",
  "certification=b-corp",
  "certification=fsc",
  "tier=semilla",
  "tier=raiz",
  "tier=bosque",
  "q=amenities",
  // Sin tildes ni mayúsculas tiene que encontrar «orgánicos», «bambú», «café».
  "q=organico",
  "q=ORG%C3%81NICO",
  "q=bambu",
  "q=cafe",
  "q=kit",
  "q=xyz-no-existe",
  "kind=product&sort=price_desc&tier=raiz",
  "vertical=hoteles&q=kit&sort=newest",
  "pagina=2",
];

interface Resultado {
  estado: number;
  destino: string;
  conteo: string;
  ofertas: string[];
  ms: number;
}

async function pedir(base: string, caso: string): Promise<Resultado> {
  const t = performance.now();
  const r = await fetch(`${base}/catalogo${caso ? `?${caso}` : ""}`, { redirect: "manual" });
  const html = await r.text();
  const ms = performance.now() - t;
  const ofertas = [...new Set([...html.matchAll(/href="\/oferta\/([a-z0-9-]+)"/g)].map((m) => m[1]))];
  const conteo = /(\d[\d.]*) ofertas? encontradas?/.exec(html)?.[0] ?? "";
  return { estado: r.status, destino: r.headers.get("location") ?? "", conteo, ofertas, ms };
}

function mediana(xs: number[]): number {
  const o = xs.toSorted((a, b) => a - b);
  return Math.round(o[Math.floor(o.length / 2)]);
}

async function main(): Promise<number> {
  // Una vuelta para calentar los dos servidores (compilación perezosa, pools).
  await Promise.all([pedir(supabase, ""), pedir(mysql, "")]);

  let fallos = 0;
  const tiempos = { supabase: [] as number[], mysql: [] as number[] };
  for (const caso of CASOS) {
    const a = await pedir(supabase, caso);
    const b = await pedir(mysql, caso);
    tiempos.supabase.push(a.ms);
    tiempos.mysql.push(b.ms);
    const igual =
      a.estado === b.estado &&
      a.destino === b.destino &&
      a.conteo === b.conteo &&
      a.ofertas.join() === b.ofertas.join();
    const etiqueta = (caso || "(sin filtros)").padEnd(42);
    const resumen = a.estado === 200 ? `${a.conteo || "sin conteo"}` : `${a.estado} → ${a.destino}`;
    if (igual) {
      console.log(`  ✓ ${etiqueta} ${resumen}`);
    } else {
      fallos++;
      console.log(`  ✗ ${etiqueta}`);
      console.log(`      Supabase ${a.estado} ${a.conteo} [${a.ofertas.join(", ")}]`);
      console.log(`      MySQL    ${b.estado} ${b.conteo} [${b.ofertas.join(", ")}]`);
    }
  }
  console.log(
    `\nTiempo de /catalogo (mediana de ${CASOS.length}): Supabase ${mediana(tiempos.supabase)} ms · MySQL ${mediana(tiempos.mysql)} ms`,
  );
  console.log(fallos ? `${fallos} de ${CASOS.length} casos distintos.` : `Los ${CASOS.length} casos, idénticos.`);
  return fallos ? 1 : 0;
}

process.exitCode = await main();
