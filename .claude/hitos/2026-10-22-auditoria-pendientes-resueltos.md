# Los nueve pendientes de la auditoría, resueltos como otras plataformas

- **Fecha:** 2026-10-22
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `fix/js-idioma-a-la-primera` → `staging` → `main` (entrega directa), tag `v0.14.0`
- **Fase del roadmap:** — (seguridad)
- **Sigue a:** [2026-10-22-auditoria-credenciales-y-datos.md](2026-10-22-auditoria-credenciales-y-datos.md)

## Por qué

La auditoría del mismo día dejó nueve puntos abiertos, la mayoría reglas de
negocio. Jesús pidió resolverlos todos tomando como referencia cómo los manejan
MercadoLibre y otras plataformas. De paso se arregló un bug: el selector de
idioma no cambiaba a la primera.

## El idioma, a la primera

El combo de Google aparecía con sus opciones antes de que Google le pusiera su
escucha: el primer `change` se perdía. Además la CSP bloqueaba un marco del
propio sitio que el traductor crea (`frame-src` sin `'self'`). Ahora
`aplicar()` repite el aviso hasta ver la página traducida (clase
`translated-ltr` y cookie `googtrans`), y la CSP permite `'self'` en marcos.
Reproducido y comprobado con un navegador automatizado.

## Las nueve decisiones

| # | Qué | Decisión | Como |
|---|---|---|---|
| 1 | Apartar inventario con pedidos sin pagar | 3 pedidos sin pagar a la vez, 15 ofertas apartadas, y más de 20 unidades solo hasta la mitad de lo que queda (`RESERVAS` en `rpc.ts`). El plazo sigue en 72 h: la transferencia la confirma una persona | El límite por cliente de Amazon; los 3 días del pago en efectivo de MercadoLibre |
| 2 | Topes de acceso en memoria, que contaban aciertos | Fallos guardados en la base (`intentos_fallidos`): 10 de contraseña en 15 min bloquean ese correo 15 min; 10 de código en un día, los códigos hasta el día siguiente. IPv6 por /64 | El bloqueo temporal de cuenta de Google y MercadoLibre |
| 3 | Empresas con un NIT ajeno | Publicar sigue siendo inmediato. «Empresa verificada» la pone el equipo (`documento_verificado_at`, botón en `/admin/proveedores`), se pierde si cambia el documento, y solo una verificada firma en la Comunidad | Las tiendas oficiales de MercadoLibre |
| 4 | Correos a terceros desde `/vender` | El acuse va al correo de la cuenta; sin cuenta no sale | Los correos automáticos solo a direcciones verificadas, como en todas |
| 5 | Llenar el disco con fotos | 300 fotos por empresa (las huérfanas de más de un día se borran solas al llegar al tope) y `ALMACEN_LIMITE_GB` en total | El tope de fotos por publicación de MercadoLibre y de archivos de Shopify |
| 6 | Puntos con cuentas propias | Una venta o reseña da puntos solo si la cuenta compradora tiene 7 días, otro teléfono que la empresa, y no le dio ya puntos en 90 días (`cuenta_para_puntos` en `logica.sql`) | La reputación de MercadoLibre (un comprador cuenta una vez por periodo); el peso menor de las cuentas nuevas en Amazon |
| 7 | CSP con `'unsafe-inline'` | Nonce por petición con `'strict-dynamic'` (`src/lib/csp.ts`, puesto por `src/proxy.ts`) | La CSP estricta que recomienda Next |
| 8 | `respaldos probar` subía la llave privada | Descifra en el PC y manda solo el SQL; `bajar` y `probar` aceptan solo nombres de copia válidos | — |
| 9 | El enlace del correo abría sesión con solo abrirlo | Lleva una llave firmada en vez del código, y se canjea con un botón por POST que exige el mismo origen (`/entrar/enlace`) | Los enlaces mágicos de Slack y Notion |

Además, al crear una empresa o una publicación de la Comunidad la base ya no
acepta puntos, puntaje, sellos, destacado ni reacciones que mande quien escribe.

## Cambio de esquema

`mysql/cambios/2026-10-22-auditoria.sql` (columna `documento_verificado_at`,
tabla `intentos_fallidos`) y `mysql/logica.sql`, aplicados desde el servidor con
`scripts/servidor/aplicar-sql.mjs` **antes** de desplegar. El camino quedó
escrito en `docs/MODO-MYSQL.md`, «Cambiar el esquema de producción».

## Lo que no se hizo

- Captcha: necesita una cuenta en un servicio externo (Cloudflare Turnstile).
  Los topes por cuenta cubren lo urgente.
- `img-src https:`: hay fotos de ofertas que son direcciones a la web del
  proveedor. Se cierra cuando subir la foto sea obligatorio.
