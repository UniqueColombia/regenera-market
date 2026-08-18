import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

// Serif de contraste para titulares: da al marketplace un tono artesanal que
// una sans sola no consigue.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
});

export const metadata: Metadata = {
  title: {
    default: "Regenera Market | Productos y servicios regenerativos para el turismo colombiano",
    template: "%s | Regenera Market",
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
    siteName: "Regenera Market",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es-CO"
      className={`${inter.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
