---
name: supabase-schema
description: Reglas para tocar supabase/migrations/ y src/lib/repo.ts en Regenera Market — migraciones aditivas, políticas RLS, y la migración del catálogo desde datos semilla en memoria a consultas reales. Cárgala antes de crear una tabla, cambiar una columna, escribir una política RLS, sembrar datos o reemplazar el cuerpo de una función de repo.
---

# Esquema y acceso a datos

Estado actual: `supabase/migrations/0001_init.sql` (491 líneas) tiene el esquema
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

Al terminar, registra un hito (skill `registrar-hito`): qué migración se aplicó,
en qué entorno, qué quedó pendiente.
