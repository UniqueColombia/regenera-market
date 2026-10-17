/**
 * La app entera, en los dos modos, vista por un visitante: cada página pública
 * pedida a dos servidores —uno con Supabase y otro con el modo MySQL— y
 * comparada en lo que ve una persona: el texto, los enlaces y las fotos.
 *
 *   npm run build
 *   npx next start -p 3101                                            # Supabase
 *   BASE_DE_DATOS=mysql ALMACEN_CARPETA=… npx next start -p 3102      # MySQL
 *   node scripts/mysql/comparar-sitio.mts
 *
 * Antes, `scripts/mysql/copiar-datos.mts`: si no, las bases no tienen por qué
 * coincidir. Solo hace GET.
 *
 * Las fotos se comparan por su dueño y su archivo: en MySQL salen de
 * `/archivos/…` (y Next las optimiza) y en Supabase de Storage, así que la
 * marca cambia aunque la foto sea la misma.
 */

const [supabase = "http://localhost:3101", mysql = "http://localhost:3102"] = process.argv.slice(2);

const FIJAS = [
  "/", "/catalogo", "/proveedores", "/comunidad", "/niveles", "/legal", "/privacidad", "/terminos",
  "/vender", "/verificacion", "/entrar", "/registro", "/carrito", "/sitemap.xml", "/robots.txt", "/llms.txt",
  "/cuenta", "/admin", "/orden/SR-NO-EXISTE", "/oferta/no-existe", "/proveedor/no-existe",
];

const CATALOGO = [
  "sort=relevance", "sort=price_asc", "sort=price_desc", "sort=impact", "sort=newest", "kind=product",
  "kind=experience", "kind=service", "vertical=hoteles", "vertical=transporte", "category=agua",
  "category=habitacion&subcategory=amenities", "department=Nari%C3%B1o", "department=Narino",
  "certification=b-corp", "tier=semilla", "tier=raiz", "tier=bosque", "q=organico", "q=ORG%C3%81NICO",
  "q=bambu", "q=kit", "q=xyz-no-existe", "kind=product&sort=price_desc&tier=raiz", "pagina=2",
].map((c) => `/catalogo?${c}`);

/** Una foto, sin la marca de dónde sale: `logos/<dueño>/<archivo>`. */
function foto(url: string): string | null {
  const u = decodeURIComponent(url);
  const storage = /\/storage\/v1\/object\/public\/([a-z]+)\/([0-9a-f-]{36})\/([^?"&\s]+)/.exec(u);
  if (storage) return `${storage[1]}/${storage[2]}/${storage[3]}`;
  const disco = /\/archivos\/([a-z]+)\/([0-9a-f-]{36})\/[a-z0-9]+\/([^?"&\s]+)/.exec(u);
  if (disco) return `${disco[1]}/${disco[2]}/${disco[3]}`;
  const local = /^(\/img\/[^?"&\s]+)/.exec(u.replace(/^\/_next\/image\?url=/, ""));
  return local ? local[1] : null;
}

interface Vista {
  estado: number;
  destino: string;
  texto: string;
  enlaces: string[];
  fotos: string[];
}

/**
 * «Otras soluciones parecidas» (`getRelatedListings`) pide tres ofertas **sin
 * orden**: cada base elige otras tres, todas válidas. Se compara la ficha hasta
 * ahí; el bloque se marca aparte.
 */
const SIN_ORDEN = "Otras soluciones parecidas";

async function ver(base: string, ruta: string): Promise<Vista & { cortada: boolean }> {
  const r = await fetch(`${base}${ruta}`, { redirect: "manual", headers: { accept: "text/html" } });
  // Sin el código que Next manda en la página (el estado de React va ahí, en
  // otro orden), y después el corte: si no, el corte caería dentro del código.
  const visible = (await r.text()).replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ");
  const corte = visible.indexOf(SIN_ORDEN);
  const cuerpo = corte >= 0 ? visible.slice(0, corte) : visible;
  const sinCodigo = cuerpo;
  const texto = sinCodigo
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, (e) => e)
    .replace(/\s+/g, " ")
    // La hora de la petición (el `lastmod` del sitemap): cambia de un pedido al otro.
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g, "<ahora>")
    .trim();
  // Solo los `<a>`: lo que una persona puede pulsar. Los `<link rel="preload">`
  // cambian con el modo (una foto remota o una local) sin que cambie nada visible.
  const enlaces = [...sinCodigo.matchAll(/<a\s[^>]*?href="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((h) => !h.startsWith("/_next/"))
    .map((h) => (foto(h) && !h.startsWith("/img/") ? `foto:${foto(h)}` : h));
  const fotos = [...new Set([...cuerpo.matchAll(/(?:src|srcSet|srcset|href|url)=?["(]?([^"\s)]+)/g)].map((m) => foto(m[1])).filter((x): x is string => x !== null && !x.startsWith("/img/marca")))].sort();
  return { estado: r.status, destino: r.headers.get("location") ?? "", texto, enlaces, fotos, cortada: corte >= 0 };
}

function primeraDiferencia(a: string, b: string): string {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return `…${a.slice(Math.max(0, i - 60), i + 80)}…\n          MySQL: …${b.slice(Math.max(0, i - 60), i + 80)}…`;
}

async function main(): Promise<number> {
  await Promise.all([ver(supabase, "/"), ver(mysql, "/")]);
  // Las ofertas y empresas, del sitemap de Supabase: todas las públicas.
  const mapa = await (await fetch(`${supabase}/sitemap.xml`)).text();
  const dinamicas = [...new Set([...mapa.matchAll(/<loc>[^<]*?(\/(?:oferta|proveedor)\/[a-z0-9-]+)<\/loc>/g)].map((m) => m[1]))];
  const rutas = [...FIJAS, ...CATALOGO, ...dinamicas];

  let fallos = 0;
  let otroOrden = 0;
  // Mismas palabras, mismos enlaces y mismas fotos, en otro orden: una consulta
  // sin `order by` (`getListingsByProvider`, `getRelatedListings`). Postgres
  // devuelve el orden físico de sus filas, que no está garantizado ni se puede
  // imitar; no es una diferencia de datos.
  const bolsa = (s: string) => s.split(" ").sort().join(" ");
  for (const ruta of rutas) {
    const [a, b] = await Promise.all([ver(supabase, ruta), ver(mysql, ruta)]);
    if (
      a.estado === b.estado && a.texto !== b.texto && bolsa(a.texto) === bolsa(b.texto) &&
      [...a.enlaces].sort().join() === [...b.enlaces].sort().join() && a.fotos.join() === b.fotos.join()
    ) {
      otroOrden++;
      console.log(`≈ ${ruta}: mismo contenido, otro orden (consulta sin order by)`);
      continue;
    }
    const problemas: string[] = [];
    if (a.estado !== b.estado) problemas.push(`estado ${a.estado} ≠ ${b.estado}`);
    if (a.destino.replace(/^https?:\/\/[^/]+/, "") !== b.destino.replace(/^https?:\/\/[^/]+/, "")) problemas.push(`destino ${a.destino} ≠ ${b.destino}`);
    if (a.texto !== b.texto) problemas.push(`texto: ${primeraDiferencia(a.texto, b.texto)}`);
    if (a.enlaces.join("\n") !== b.enlaces.join("\n")) {
      const solo = (x: string[], y: string[]) => x.filter((e) => !y.includes(e)).slice(0, 3).join(", ");
      problemas.push(`enlaces: solo Supabase [${solo(a.enlaces, b.enlaces)}] · solo MySQL [${solo(b.enlaces, a.enlaces)}]`);
    }
    if (a.fotos.join() !== b.fotos.join()) problemas.push(`fotos: Supabase [${a.fotos.join(", ")}] · MySQL [${b.fotos.join(", ")}]`);
    if (problemas.length) {
      fallos++;
      console.log(`✗ ${ruta}\n    ${problemas.join("\n    ")}`);
    } else {
      console.log(
        `✓ ${ruta} (${a.estado}${a.destino ? ` → ${a.destino.replace(/^https?:\/\/[^/]+/, "")}` : ""})${a.cortada ? ` — sin «${SIN_ORDEN}», que va sin orden` : ""}`,
      );
    }
  }
  console.log(`\n${rutas.length - fallos - otroOrden} de ${rutas.length} páginas iguales${otroOrden ? `, ${otroOrden} con el mismo contenido en otro orden` : ""}${fallos ? `, ${fallos} distintas` : ""}.`);
  return fallos ? 1 : 0;
}

process.exitCode = await main();
