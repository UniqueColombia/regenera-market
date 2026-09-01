# Los prospectos salen en Excel, y el puntaje aprende a separar

- **Fecha:** 2026-08-29
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `feat/js-agente-prospeccion` → #<n>
- **Fase del roadmap:** — (habilita la Fase 4, «Primer lote real de onboarding»)

Continúa [2026-08-28-prospector-de-proveedores.md](2026-08-28-prospector-de-proveedores.md).

## Qué se hizo

`scripts/exportar-excel.mts` junta los CSV del prospector en un libro de Excel
categorizado en `outputs/`: una hoja por vertical, una con todo, un resumen con
los cortes por perfil, cámara, forma jurídica y banda de puntaje, y un
diccionario que explica qué mide el puntaje y qué no. Filtro automático y
primera fila fijada en cada hoja de datos.

De paso, el motor de puntaje aprendió dos cosas que la primera corrida completa
dejó en evidencia. El lote actual son **2.826 prospectos únicos** sobre los 20
perfiles.

## Por qué así

**El XLSX se escribe a mano, sin dependencias.** Un `.xlsx` es un ZIP de XML y
Node ya trae `zlib`; meter una librería al `package.json` de la aplicación por
un script que corre a mano arrastra a producción una dependencia que producción
no usa. El costo es un escritor de ZIP de unas 60 líneas, y a cambio `npm ci`
del sitio no cambia.

**Los códigos «n.c.p.» se tratan aparte.** Son los cajones de sastre del CIIU y
rompían la prospección por dos lados a la vez. `9499` —«otras asociaciones»—
tiene 92.503 empresas activas: todas las juntas de acción comunal y
asociaciones de copropietarios del país. Correr la vertical `agencias` entera
devolvía 269.533 empresas y la consulta se cortaba por timeout.

Se resolvió empujando el filtro al servidor: a un código cajón de sastre se le
exige además una señal en el nombre. `9499` pasa de 92.503 a 5.451 filas en ocho
segundos. Y en el puntaje valen 6 puntos en vez de 15, porque un código que no
describe el negocio no es evidencia de nada.

**Las señales verdes se comparan al inicio de palabra, no como subcadena.**
Buscar «eco» suelto marcaba «RECOLECCION» y «bio» marcaba «TABIO». El ranking se
llenaba de empresas cuyo único mérito era llamarse así.

**Las bandas de color cortan en 72 y 63, no en 80 y 65.** Sin credenciales de
MercadoLibre nadie puede sumar los 20 puntos de presencia comercial: el techo
real es 87, no 100. Sobre los 2.826 prospectos la mediana es 63 y solo cinco
pasan de 80. Un semáforo calibrado sobre el 0-100 nominal pintaba de verde a
cinco empresas y de gris a las otras 2.821 — no informaba nada. Con 72 la banda
alta es el 5,7% superior: 162 candidatos únicos, una lista de llamadas de una
semana. (El resumen por vertical suma 246 porque 1.360 prospectos sirven a más
de una y se cuentan en cada hoja; el total sin repetir es 162.)

**El Excel no se versiona.** `outputs/` entra a `.gitignore` por el mismo motivo
que `.claude/prospectos/`: son empresas y personas identificables y el
repositorio es público.

## Qué quedó pendiente

- [ ] **Nadie ha enriquecido todavía un solo prospecto.** Las columnas de
      contacto, ciudad, encaje y notas están vacías en las 2.826 filas. Ese es
      el trabajo del subagente `prospector-proveedores` y es el siguiente paso
      real: sin él, el libro es un universo ordenado, no una lista de llamadas.
- [ ] Recalibrar los pesos **con el resultado de ese enriquecimiento**. Hasta
      entonces siguen siendo una heurística declarada.
- [ ] El libro contiene los 250 mejores de cada perfil, no el universo. Está
      dicho en el diccionario, pero conviene que el script lo escriba solo.
- [ ] `transporte` sigue siendo la vertical más floja: su oferta es de servicio
      y el CIIU la describe mal. Es la que más candidatos de prioridad alta
      produce (105) y probablemente la que más falsos positivos tenga.
- [ ] Sin `MELI_CLIENT_ID` / `MELI_CLIENT_SECRET` ningún prospecto puede pasar
      de 87.

## Qué se rompe si tocas esto

- **El orden de los elementos dentro de `<worksheet>` es obligatorio**:
  `dimension`, `sheetViews`, `sheetFormatPr`, `cols`, `sheetData`, `autoFilter`.
  Excel rechaza el libro si se alteran, y no dice por qué.
- **Un carácter de control invalida el libro entero.** `xml()` los filtra por
  código, a propósito y no con una clase de caracteres: una expresión regular
  con literales de control deja el archivo fuente ilegible y `grep` lo trata
  como binario.
- **El ZIP se escribe con fecha fija (1980-01-01).** Si se pone la hora de
  generación, dos exportaciones del mismo dato dejan de ser comparables byte a
  byte.
- **`estiloPuntaje` y las bandas del resumen y del diccionario tienen que
  moverse juntas.** Están en tres sitios del mismo archivo; si divergen, el
  color dice una cosa y el conteo otra.
- **La deduplicación por NIT fusiona `perfiles` y `verticales` y conserva el
  puntaje mayor.** Un proveedor en varios perfiles no es un duplicado: 1.360 de
  los 2.826 sirven a más de una vertical, y eso los hace más interesantes.
- **`CIIU_CAJON` se usa en dos sitios** —la consulta y el puntaje—. Agregar un
  código ahí cambia el tamaño del universo, no solo su orden.

## Verificación

`npm run build`, `npx tsc --noEmit` y `npx eslint .`, los tres en limpio.

Las 20 corridas del prospector y la exportación:

```
node scripts/exportar-excel.mts
2826 prospectos únicos en 8 hojas.
```

El libro se validó **sin abrir Excel**, en dos niveles: que el ZIP tenga
integridad y que cada XML parsee (`zipfile` + `ElementTree`), y que un lector
que aplica el esquema lo abra de verdad —`openpyxl` devuelve las ocho hojas,
`freeze_panes=A2` y `auto_filter=A1:Y2827`—. Un ZIP bien formado con XML válido
todavía puede ser un libro que Excel rechaza; por eso la segunda comprobación.

Distribución del puntaje sobre los 2.826, que es de donde salieron las bandas:
máximo 87, mediana 63, p90 68; 162 en 72 o más, 5 en 80 o más.
