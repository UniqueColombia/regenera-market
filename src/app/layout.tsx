import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getSesion } from "@/lib/auth";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

// Serif de contraste para titulares: da al marketplace un tono artesanal que
// una sans sola no consigue.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
});

/**
 * Sin `metadataBase`, Next resuelve `opengraph-image.jpg` y `twitter-image.jpg`
 * contra `http://localhost:3000` y lo avisa en cada build. Consecuencia real:
 * el enlace compartido en WhatsApp o LinkedIn sale sin imagen, porque apunta a
 * la máquina de quien compiló. Se toma de `NEXT_PUBLIC_SITE_URL`, que es la
 * variable que `docs/DEPLOY.md` ya reserva por entorno.
 */
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Seregenera | Productos y servicios regenerativos para el turismo colombiano",
    template: "%s | Seregenera",
  },
  description:
    "Marketplace que conecta hoteles, glampings, restaurantes, transportadores y operadores con proveedores colombianos verificados de productos, experiencias y servicios regenerativos.",
  keywords: [
    "turismo sostenible Colombia",
    "turismo regenerativo",
    "proveedores sostenibles",
    "amenities ecológicos",
    "marketplace sostenible",
  ],
  openGraph: {
    type: "website",
    locale: "es_CO",
    siteName: "Seregenera",
  },
};

/**
 * La sesión se lee aquí y baja al encabezado como prop.
 *
 * Leer la cookie en el layout vuelve dinámicas todas las páginas, incluidas las
 * que antes se prerenderizaban. Es el precio de que el encabezado no parpadee
 * entre "Entrar" y tu nombre en cada carga, y la mayoría ya eran dinámicas desde
 * que el catálogo salió de la base.
 */
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const sesion = await getSesion();

  return (
    <html
      lang="es-CO"
      className={`${inter.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <SiteHeader sesion={sesion} />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
