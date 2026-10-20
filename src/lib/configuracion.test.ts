import { describe, expect, it } from "vitest";
import { esProduccion, revisarConfiguracion } from "./configuracion";

/** Lo que tiene hoy `seregenera.com`, con valores inventados. */
const PRODUCCION = {
  NODE_ENV: "production",
  BASE_DE_DATOS: "mysql",
  MYSQL_HOST: "127.0.0.1",
  MYSQL_PORT: "3306",
  MYSQL_DATABASE: "u000_seregenera",
  MYSQL_USER: "u000_seregenera",
  MYSQL_PASSWORD: "valor-secreto-de-prueba",
  ALMACEN_CARPETA: "/home/u000/seregenera-archivos",
  NEXT_PUBLIC_SITE_URL: "https://seregenera.com",
  SESION_SECRETO: "0123456789abcdef0123456789abcdef0123456789abcdef",
  SMTP_HOST: "smtp.hostinger.com",
  SMTP_USER: "info@seregenera.com",
  SMTP_PASSWORD: "otro-valor-secreto",
};

describe("revisarConfiguracion", () => {
  it("la producción completa no tiene nada que decir", () => {
    expect(revisarConfiguracion(PRODUCCION)).toEqual({ criticos: [], avisos: [] });
  });

  it("sin BASE_DE_DATOS=mysql es crítico: la app volvería en silencio a Supabase", () => {
    const { criticos } = revisarConfiguracion({ ...PRODUCCION, BASE_DE_DATOS: undefined });
    expect(criticos).toHaveLength(1);
    expect(criticos[0]).toContain("BASE_DE_DATOS");
  });

  it("en modo MySQL exige las MYSQL_* y una carpeta de fotos absoluta", () => {
    const { criticos } = revisarConfiguracion({
      ...PRODUCCION,
      MYSQL_PASSWORD: "",
      ALMACEN_CARPETA: "seregenera-archivos",
    });
    expect(criticos).toEqual(["falta MYSQL_PASSWORD", "ALMACEN_CARPETA no es una ruta absoluta"]);
  });

  it("acepta la carpeta absoluta de Windows (el PC)", () => {
    const { criticos } = revisarConfiguracion({ ...PRODUCCION, ALMACEN_CARPETA: "C:\\datos\\fotos" });
    expect(criticos).toEqual([]);
  });

  it("el sitio tiene que ser https y BOLD_MODO_PRUEBAS ir vacía", () => {
    const { criticos } = revisarConfiguracion({
      ...PRODUCCION,
      NEXT_PUBLIC_SITE_URL: "http://seregenera.com",
      BOLD_MODO_PRUEBAS: "1",
    });
    expect(criticos).toHaveLength(2);
    expect(criticos.join(" ")).toContain("https://");
    expect(criticos.join(" ")).toContain("BOLD_MODO_PRUEBAS");
  });

  it("avisa de lo que sobra o falta sin volverlo crítico", () => {
    const { criticos, avisos } = revisarConfiguracion({
      ...PRODUCCION,
      SESION_SECRETO: "corta",
      SMTP_PASSWORD: undefined,
      BOLD_LLAVE_SECRETA: "solo-una",
      NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "llave",
      IS_WEBPACK_TEST: "1",
    });
    expect(criticos).toEqual([]);
    expect(avisos).toHaveLength(5);
    expect(avisos.join(" ")).toContain("SESION_SECRETO");
    expect(avisos.join(" ")).toContain("SMTP_PASSWORD");
    expect(avisos.join(" ")).toContain("BOLD");
    expect(avisos.join(" ")).toContain("NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
    expect(avisos.join(" ")).toContain("IS_WEBPACK_TEST");
  });

  it("nunca repite un valor en los mensajes: van al registro del servidor", () => {
    const { criticos, avisos } = revisarConfiguracion({
      ...PRODUCCION,
      ALMACEN_CARPETA: "relativa-secreta",
      NEXT_PUBLIC_SITE_URL: "http://valor-secreto-de-prueba",
      BOLD_LLAVE_SECRETA: "valor-secreto-de-prueba",
    });
    const todo = [...criticos, ...avisos].join(" ");
    expect(todo).not.toContain("valor-secreto-de-prueba");
    expect(todo).not.toContain("relativa-secreta");
  });

  it("esProduccion mira NODE_ENV", () => {
    expect(esProduccion({ NODE_ENV: "production" })).toBe(true);
    expect(esProduccion({ NODE_ENV: "development" })).toBe(false);
  });
});
