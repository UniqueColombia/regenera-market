# Portabilidad: cómo salir de Supabase sin reescribir el producto

**Este archivo responde a «¿qué pasa si mañana queremos la base en una VPS?».**
Dice qué depende de Supabase hoy, qué ya está aislado, qué costaría cada
camino y qué reglas mantienen barata esa mudanza mientras no se haga.

No hay fecha para migrar. `src/lib/almacenamiento.ts` deja escrito el plan de
pasar las imágenes al VPS propio cuando el MVP esté cerrado; lo demás se decide
entonces. Lo que sí se hace desde ya es **no hacer la mudanza más cara**.

## La buena noticia: el producto vive en Postgres

Casi toda la lógica que importa —precios, stock, cupos, comisiones, estados de
una orden, reseñas, puntos, límites— está en funciones, triggers y políticas de
Postgres, no en Supabase. Postgres se lleva a cualquier sitio.

**Está probado, no supuesto.** `npm run test:base` aplica las migraciones, de la
`0001` a la última, sobre un **Postgres 17 pelado** con solo lo que dice
[`supabase/pruebas/supabase-minimo.sql`](../supabase/pruebas/supabase-minimo.sql)
(unas 150 líneas). Corre en cada push, en el CI. Si una migración nueva empieza
a depender de algo de Supabase que no está en ese archivo, el CI falla con «La
migración NNNN no corre sobre Postgres + supabase-minimo.sql».

Ese archivo es el **contrato**: lo que hay que darle a un Postgres propio para
que el esquema corra sin cambiar una línea.

| Qué da el shim | Por qué lo necesitan las migraciones |
|---|---|
| Roles `anon`, `authenticated`, `service_role` | Las políticas y los `grant` los nombran |
| `alter default privileges` a esos roles | Supabase da acceso a todo `public`; la seguridad la ponen las políticas |
| `auth.users` (id, email, metadatos, fechas) | Llaves foráneas desde `profiles`, `orders`, `reviews`…; trigger de alta en 0002/0004 |
| `auth.uid()`, `auth.role()`, `auth.jwt()` | Medio centenar de llamadas en políticas y funciones. Leen `request.jwt.claims`, igual que PostgREST |
| `storage.buckets`, `storage.objects`, `storage.foldername()` | Las políticas de fotos de la 0008 |
| Esquema `extensions` con `unaccent` y `pg_trgm` | La búsqueda (0003) |

`pg_cron` **no** está en el shim, a propósito: la 0014 funciona sin él (los
pedidos vencen al abrir `/admin/ordenes`), y así las pruebas cubren ese camino.

### Probar contra el Postgres de destino

```bash
PRUEBAS_PG_URL=postgres://superusuario:clave@mi-vps:5432/postgres npm run test:base
```

Aplica el shim y todas las migraciones en una base nueva de ese servidor y corre
las mismas pruebas. Es lo primero que se hace el día que exista la VPS.

## Lo que sí depende de Supabase, y qué costaría

| Pieza | Dónde | Supabase en Docker | PostgREST + GoTrue sueltos | Capa propia (`pg` + Auth.js o similar) |
|---|---|---|---|---|
| Consultas (`supabase-js`: `.from()`, `.rpc()`) | `src/lib/repo.ts`, `orders.ts`, `ofertas.ts` y ~15 acciones de `src/app/` | Nada | Nada (PostgREST es lo mismo) | Alto: reescribir ~80 consultas |
| Sesión y acceso (código de 6 dígitos, contraseña) | `src/lib/auth.ts`, `src/proxy.ts`, `src/app/entrar`, `registro` | Nada | Bajo: GoTrue es el auth de Supabase | **Alto**: sesiones, códigos por correo, migrar cuentas |
| `auth.uid()` en SQL | 10 migraciones | Nada | Nada | Bajo: el shim ya lo resuelve con `set_config` por petición |
| Imágenes | `src/lib/almacenamiento.ts` (solo ahí) | Nada | Medio: otra implementación de `AlmacenDeImagenes` (disco o MinIO/S3) + reescribir URLs guardadas | Igual |
| Correos de acceso | Plantillas en el panel de Supabase (`plantillas-correo/` es copia) | Nada | Bajo: GoTrue lee plantillas por variables | Medio: generarlos nosotros |
| `pg_cron` | 0014, opcional | Nada | Instalar la extensión o un cron del sistema | Igual |

**Recomendación para cuando toque:** empezar por **Supabase autoalojado en
Docker** en la VPS (`supabase/docker` del repositorio oficial). Es el camino de
menor riesgo: la aplicación no cambia ni una línea, solo
`NEXT_PUBLIC_SUPABASE_URL` y las claves. La copia de datos es un `pg_dump` del
proyecto actual (incluye `auth.users` con las contraseñas cifradas, así que
nadie tiene que volver a registrarse) y un `pg_restore` en la VPS. Las imágenes
se copian del bucket a la carpeta del contenedor de storage.

Reemplazar el auth por uno propio solo si aparece una razón fuerte: es la pieza
más cara y la que más se puede romper (nadie podría entrar).

## Reglas para que la mudanza siga siendo barata

Ninguna de estas es nueva; lo nuevo es saber por qué importan.

1. **Toda consulta pasa por `src/lib/`** (invariante 18 de `dominio-regenera`).
   Hoy ~15 acciones de `src/app/` consultan directo; cada una que se toque, se
   mueve a una función de `src/lib/`. Con una capa propia, esa es la lista de
   lo que habría que reescribir: mejor que sea corta y esté en un solo sitio.
2. **`supabase.storage` solo en `src/lib/almacenamiento.ts`.**
3. **`supabase.auth` no se extiende a archivos nuevos.** Hoy lo llaman siete:
   `src/lib/auth.ts`, `src/proxy.ts`, `src/lib/correo/notificaciones.ts`
   (`auth.admin`) y las acciones de `entrar`, `salir`, `cuenta` y
   `auth/callback`. Lo nuevo que necesite la sesión pasa por `src/lib/auth.ts`.
4. **La lógica de dinero y permisos va en SQL estándar**, no en Edge Functions,
   Realtime ni nada que solo exista en Supabase. Una función de Postgres viaja;
   una Edge Function hay que reescribirla.
5. **Una migración que necesite algo nuevo de Supabase** lo agrega a
   `supabase-minimo.sql` imitando lo que hace Supabase, y lo anota en la tabla
   de arriba. Si no se puede imitar, se discute antes de escribirla.

## Qué no cubre esto

- **La aplicación contra la VPS.** Las pruebas validan la base; que Next.js
  hable con un Supabase autoalojado se comprueba el día de la mudanza, con el
  ciclo de compra de punta a punta (la lista está en el hito del 2026-10-09).
- **Copias de seguridad, monitoreo y actualizaciones de Postgres.** Hoy los hace
  Supabase. En una VPS son trabajo de alguien, y es el costo real de la mudanza,
  más que el código.
