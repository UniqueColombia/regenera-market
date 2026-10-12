import { describe, expect, it } from "vitest";
import { cuantasPaginas, leerPagina, numerosDePagina, rango, urlDePagina } from "./paginacion";

describe("leerPagina", () => {
  it("lo raro es la página 1", () => {
    for (const v of [undefined, "", "0", "-3", "abc", "2.5", "1e3", "9999999"]) {
      expect(leerPagina(v), String(v)).toBe(1);
    }
    expect(leerPagina("7")).toBe(7);
    expect(leerPagina(["3", "9"])).toBe(3);
  });
});

describe("rango", () => {
  it("es inclusivo y empieza en 0, como .range()", () => {
    expect(rango(1, 24)).toEqual([0, 23]);
    expect(rango(3, 24)).toEqual([48, 71]);
  });
});

describe("cuantasPaginas", () => {
  it("nunca menos de una", () => {
    expect(cuantasPaginas(0, 24)).toBe(1);
    expect(cuantasPaginas(24, 24)).toBe(1);
    expect(cuantasPaginas(25, 24)).toBe(2);
  });
});

describe("numerosDePagina", () => {
  it("todas cuando son pocas", () => {
    expect(numerosDePagina(1, 1)).toEqual([1]);
    expect(numerosDePagina(2, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("primera, última y dos a cada lado, con «…» donde se salta más de una", () => {
    expect(numerosDePagina(10, 20)).toEqual([1, null, 8, 9, 10, 11, 12, null, 20]);
    expect(numerosDePagina(1, 20)).toEqual([1, 2, 3, null, 20]);
    expect(numerosDePagina(20, 20)).toEqual([1, null, 18, 19, 20]);
  });

  it("un hueco de una sola página muestra el número, no «…»", () => {
    expect(numerosDePagina(5, 20)).toEqual([1, 2, 3, 4, 5, 6, 7, null, 20]);
  });
});

describe("urlDePagina", () => {
  it("conserva los filtros y quita la página 1", () => {
    const sp = { q: "café", kind: "product", pagina: "4", vacio: "" };
    expect(urlDePagina("/catalogo", sp, 1)).toBe("/catalogo?q=caf%C3%A9&kind=product");
    expect(urlDePagina("/catalogo", sp, 2)).toBe("/catalogo?q=caf%C3%A9&kind=product&pagina=2");
    expect(urlDePagina("/catalogo", {}, 1)).toBe("/catalogo");
  });
});
