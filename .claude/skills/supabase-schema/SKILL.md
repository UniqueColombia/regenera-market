---
name: supabase-schema
description: Reglas para tocar supabase/migrations/ y src/lib/repo.ts en Seregenera — migraciones aditivas, políticas RLS, y la migración del catálogo desde datos semilla en memoria a consultas reales. Cárgala antes de crear una tabla, cambiar una columna, escribir una política RLS, sembrar datos o reemplazar el cuerpo de una función de repo.
---

# Esquema y acceso a datos

> ⚠️ **Desde el 2026-10-17 producción no corre sobre Supabase sino sobre el
> MariaDB de Hostinger** (`BASE_DE_DATOS=mysql`, `docs/MODO-MYSQL.md`).
> Una migración en `supabase/migrations/` ya no llega a producción: el esquema
> vivo es `mysql/esquema.sql` + `mysql/logica.sql` + `src/lib/mysql/modelo.ts`,
> y las funciones que la app llama con `rpc()` están en
> `src/lib/mysql/postgrest/rpc.ts`. Hasta que haya un flujo de migraciones para
> MariaDB, un cambio de esquema es SQL a mano en la base de producción,
> reflejado en esos archivos, con `npm run test:mysql`. Lo de abajo es el
> flujo de Postgres, que sigue valiendo para la vuelta atrás.

Estado al escribirse esta skill (histórico): `supabase/migrations/0001_init.sql` (491 líneas) tiene el esquema
completo con RLS escrito, **pero nunca se ha ejecutado contra ninguna base**. La
aplicación lee de `src/data/` en memoria. Esto es lo primero que cambia cuando se
cree el proyecto de Supabase.

## Migraciones

Una migración es **inmutable en cuanto se aplica a cualquier base compartida**.
Nunca edites `0001_init.sql` después de eso: escribe `0002_...`. Mientras nadie
la haya aplicado en ningún entorno, corregirla en su sitio está bien — pero
dilo en el PR.

Nombre: `NNNN_descripcion_en_snake_case.sql`, con `NNNN` de cuatro dígitos y
correlativo. Si Ivan y Jesús crean `0002` a la vez, el segundo en mergear
renumera a `0003` — el número refleja **orden de aplicación**, no de escritura.

Toda migración debe ser:

- **Aditiva por defecto.** Agregar tabla, columna nullable, índice, política.
- **Idempotente donde se pueda.** `create table if not exists`,
  `create or replace function`, `drop policy if exists` antes de recrear.
- **Reversible en el papel.** Al final del archivo, un comentario con el SQL de
  rollback. No un archivo `.down.sql`: un comentario, para que el que revierte a
  las 2am no tenga que inventarlo.

**Destructivo = requiere autorización explícita de Ivan en el PR.** `drop table`,
`drop column`, `alter column ... type`, `not null` sobre columna con datos,
`delete`/`truncate`. Ninguna de esas se mergea con un "listo" implícito.

Un `alter column ... type` o un `not null` sobre una tabla con datos se hace en
tres migraciones, no en una: agregar la columna nueva → copiar y desplegar el
código que escribe en ambas → borrar la vieja.

## RLS: no negociable

**Toda tabla nueva lleva `enable row level security` y al menos una política en
la misma migración que la crea.** Una tabla con RLS activo y sin políticas es
inaccesible (falla ruidoso, se arregla). Una tabla sin RLS con la clave anon es
una fuga de datos (falla silencioso, se descubre tarde).

Las políticas del esquema siguen tres patrones; reutilízalos:

- Lectura pública de lo aprobado: `using (status = 'approved')`
- Escritura del dueño: vía `provider_members`, nunca comparando un texto libre
- Todo para admin: `using (is_admin())`

`has_role()` e `is_admin()` son `security definer` con `set search_path = public`
a propósito: sin eso, la política que consulta roles entra en recursión con la
RLS de `user_roles`. Cualquier función nueva que se llame desde una política
necesita el mismo tratamiento.

**La clave anon es pública por diseño.** La seguridad la dan las políticas, no
el secreto de la clave. Corolario: si tu feature "funciona" porque el frontend no
pide el dato, no funciona.

`SUPABASE_SERVICE_ROLE_KEY` se salta toda RLS. Solo en código de servidor
(server actions, route handlers), nunca en un componente cliente, nunca en una
variable con prefijo `NEXT_PUBLIC_`. Sus tres usos legítimos: importar catálogo,
confirmar pagos, asignar roles.

## Lo que escribe un trigger, no el usuario

`sustainability_approved` (línea ~184 de `0001_init.sql`) escribe
`sustainability_score` y `tier` en `providers` cuando un admin aprueba una
evaluación. Ninguna política permite que el proveedor los escriba, y ninguna
debe permitirlo nunca. Lo mismo vale para cualquier campo derivado que se agregue
después: si el usuario se beneficia de su valor, lo calcula la base.

## Migrar `repo.ts` a consultas reales

`src/lib/repo.ts` es la única puerta a los datos y sus funciones ya son `async`.
El cambio es **cuerpo por cuerpo, sin tocar firmas ni páginas**:

1. Aplicar `0001_init.sql` al proyecto nuevo.
2. Sembrar desde `src/data/listings.ts` y `src/data/providers.ts` con un script
   de servidor que use la service role key. Deja el script en el repo
   (`scripts/seed.ts`) — se vuelve a necesitar en cada entorno nuevo.
3. Reemplazar una función a la vez, corriendo la app entre cada una.
   `searchListings()` es la más delicada: `matches()` y el `switch (filters.sort)`
   se vuelven `where` + `order by`, y hay que conservar el orden por defecto
   (destacados primero, luego mejor puntaje) y la normalización de tildes.
4. Cuando `repo.ts` no importe nada de `src/data/`, la migración terminó.
   `src/data/` queda solo como semilla.

Reglas durante la migración:

- **Ninguna página cambia.** Si tienes que editar algo en `src/app/`, la firma
  de repo está mal.
- **No se filtra en JavaScript lo que puede filtrar Postgres.** Traer todo el
  catálogo y filtrarlo en Node funciona con 15 ofertas y muere con 1.500.
- Cada nuevo `where` que no sea sobre una PK necesita su índice en una
  migración.
- El filtro de nivel sigue siendo "de este nivel hacia arriba"
  (`sustainability_score >= min`), no igualdad.

## Verificación

```bash
npm run build        # primero: genera los tipos de rutas que tsc necesita
npx tsc --noEmit
npx eslint .
```

Y sobre la base: probar cada política **con el rol equivocado**. Una política se
valida demostrando que niega, no que permite. Como mínimo: un `buyer` no ve
órdenes de otro, un `provider` no ve órdenes que no incluyen sus ítems, un
anónimo no ve nada en `status = 'draft'`.

**Eso ya no se hace a mano: `npm run test:base`** (desde el 2026-10-12). Levanta
un Postgres 17 desechable, le aplica `supabase/pruebas/supabase-minimo.sql` y
todas las migraciones, y corre `supabase/pruebas/*.test.ts`. Unos 10 segundos,
sin instalar nada, y corre en el CI. Una migración nueva va con su prueba:

- **Funciones que escriben** → un caso en el archivo de su tema (`compras`,
  `envios-y-resenas`…), entrando como la aplicación con `comoUsuario()`.
- **Políticas** → `permisos.test.ts`, con el rol equivocado.
- **Candados** → `concurrencia.test.ts`, con dos conexiones (`conectar()`).
- **Una regla con gemela en TypeScript** → `gemelos.test.ts` compara los dos lados.

Tres comprobaciones corren solas sobre todo el esquema
(`migraciones.test.ts`), y fallan si una migración nueva:

- deja una tabla de `public` sin RLS;
- crea una función `security definer` sin `search_path`;
- crea una vista sin `security_invoker`.

Una cuarta falla si `anon` puede ejecutar una función `security definer`
que no está en la lista aprobada. **Supabase concede `execute` a `anon` sobre
toda función nueva**, y `revoke … from public` no lo quita: hay que nombrar el
rol (`revoke execute on function f(…) from public, anon`). Así entró el hueco
que cerró la 0015.

Si la migración usa algo de Supabase que el shim no tiene (otro esquema, otra
extensión, otra columna de `auth.users`), las pruebas fallan al aplicarla. Se
agrega a `supabase-minimo.sql` imitando a Supabase y se anota en
`docs/PORTABILIDAD.md`.

Al terminar, registra un hito (skill `registrar-hito`): qué migración se aplicó,
en qué entorno, qué quedó pendiente.
