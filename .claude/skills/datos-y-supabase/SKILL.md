---
name: datos-y-supabase
description: Cómo se accede a los datos en Regenera Market, cómo se migra de semillas en memoria a Supabase sin tocar las páginas, y las reglas de RLS, dinero y roles. Úsala antes de tocar src/lib/repo.ts, src/data/, supabase/migrations/, cualquier cálculo de precio o comisión, o de escribir una consulta.
---

# Datos y Supabase

## El estado actual

El catálogo se sirve desde **semillas en memoria** (`src/data/`). El esquema de
Supabase está escrito con RLS completa (`supabase/migrations/0001_init.sql`)
pero **nunca se ha ejecutado contra una base**. Las órdenes y las postulaciones
viven en memoria del servidor y se pierden al reiniciar.

Decir "está conectado a Supabase" hoy sería falso. Verifica antes de afirmarlo.

## La regla que sostiene todo

**`src/lib/repo.ts` es el único punto de acceso a datos.** Ninguna página, ningún
componente, ninguna Server Action consulta datos por su cuenta.

Sus funciones son `async` **a propósito**, aunque hoy solo lean arreglos en
memoria. Ese es el contrato: cuando entre Supabase, se reemplaza el cuerpo de
esas funciones y **ninguna página cambia**. Si escribes una función de acceso a
datos síncrona, rompes la migración antes de empezarla.

## Migrar a Supabase, cuando toque

1. Crear el proyecto (uno **nuevo y limpio** — no se reutiliza el de Lovable).
2. Aplicar `supabase/migrations/0001_init.sql`.
3. Cargar `src/data/` como semilla.
4. Reemplazar **solo los cuerpos** de `src/lib/repo.ts`.
5. Verificar que ninguna página cambió. Si alguna cambió, el paso 4 se hizo mal.

Cliente de Supabase: `@supabase/ssr`. Cliente de servidor en Server Components y
Server Actions; el de navegador solo donde haya sesión de usuario que refrescar.
La clave `service_role` **nunca** cruza al cliente.

## Reglas que no se negocian

**El precio nunca lo calcula el cliente.** El carrito guarda identificadores y
cantidades; el servidor los valoriza contra el catálogo en cada cambio
(`src/lib/pricing.ts`). Un carrito guardado hace un mes no puede comprar al
precio de hace un mes.

**La comisión se guarda por ítem, no sobre el total.** Una orden se reparte entre
varios proveedores y cada uno tiene que poder auditar exactamente lo que se le
descontó.

**Título y precio se congelan en la orden.** Si el proveedor los cambia mañana,
la orden histórica sigue diciendo lo que el comprador aceptó.

**Los roles viven en su propia tabla,** no en el perfil. Si el usuario pudiera
actualizar su fila de perfil, podría autoasignarse `admin`.

**El puntaje de sostenibilidad lo escribe un trigger,** no el proveedor. Las
certificaciones suman **con tope**: un taller sin plata para certificarse puede
llegar a Raíz por prácticas reales, y una certificación comprada no basta sola.
Si cambias los pesos en `src/lib/sustainability.ts`, cambia el trigger en la
misma migración — divergir es servir dos niveles distintos para el mismo
proveedor.

**Dinero en enteros.** COP sin decimales. Nunca `float` para plata.

## Migraciones

- Numeradas y correlativas: `0002_descripcion.sql`. Nunca se edita una migración
  ya aplicada.
- Toda tabla nueva nace con RLS habilitada y su política en la misma migración.
  Una tabla con RLS pendiente es una tabla pública.
- Toda política se escribe pensando en tres actores: el visitante anónimo, el
  proveedor dueño de la fila, y el admin.

## Al cambiar el modelo

`src/lib/types.ts` es el modelo de dominio y se propaga a todo. Cambiarlo es un
hito (ver la habilidad `registro-de-hitos`). El orden es: tipos → migración →
`repo.ts` → páginas.
