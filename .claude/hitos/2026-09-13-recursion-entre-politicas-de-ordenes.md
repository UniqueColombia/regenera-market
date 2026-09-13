# Dos políticas de `0001` se llamaban la una a la otra, y nadie podía saberlo

- **Fecha:** 2026-09-13
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `feat/js-clave-y-panel-admin` → sin PR todavía
- **Fase del roadmap:** 1 y 2 — corrección

Continúa a
[el acceso pasa a contraseña con segundo factor…](2026-09-13-clave-con-segundo-factor-y-panel-admin.md),
que es lo que lo destapó.

## Qué se hizo

`0005_recursion_ordenes_y_cotizaciones.sql`: cuatro políticas de lectura pasan a
resolverse con funciones `security definer` en vez de con subconsultas cruzadas.
Sin eso, **cualquier lectura de `orders` desde la aplicación falla**:

```
ERROR 42P17: infinite recursion detected in policy for relation "orders"
```

## Por qué así

**El fallo estaba escrito desde el primer día.** En `0001_init.sql`:

- `orders_provider_read` consulta `order_items` para saber si alguno de los ítems
  es de una empresa que gestionas.
- `order_items_read` consulta `orders` para saber si la orden es tuya.

Para decidir si te deja leer la orden, Postgres necesita leer sus ítems; para
decidir si te deja leer un ítem, necesita leer su orden. El planificador lo corta.

**Nadie lo notó durante tres semanas porque las órdenes vivían en un `Map` en
memoria**: ninguna consulta llegaba jamás a la tabla, y las ~35 políticas se
habían revisado leyéndolas, no ejecutándolas. Apareció en la primera visita a
`/admin` después de que `src/lib/orders.ts` pasara a Postgres — lo encontró
Jesús probando la pantalla en el navegador, minutos después de que el build, los
tipos, el lint y doce pruebas de RLS pasaran en verde.

**Es el argumento entero del Bloque 5 de `docs/BETA.md`, y conviene no
olvidarlo:** una política se valida ejecutándola con el rol equivocado, no
leyéndola. Ninguna comprobación estática podía encontrar esto. Las pruebas de RLS
que sí se corrieron ese día tocaban dispositivos, roles y postulaciones — no
órdenes, precisamente porque todavía no había ninguna.

**La salida es la que el propio esquema ya usaba para los roles.** `has_role()` e
`is_admin()` son `security definer` exactamente por esto: sin ellas, la política
de `user_roles` entraría en recursión consigo misma. Una función `security
definer` corre con los privilegios de su dueño, así que su consulta interna no
vuelve a pasar por RLS y el círculo se rompe. No se relaja ni un permiso: la
condición comprobada es literal la misma, movida de sitio.

**Se arreglaron también `quotations` y `quotation_items`**, que tienen el mismo
par cruzado y el mismo fallo esperando. Todavía no se consultan desde ninguna
parte, así que nadie lo ha visto; se corrige ahora para que la próxima persona no
lo descubra del mismo modo, con la pantalla delante y sin saber por dónde empezar.

## Qué quedó pendiente

- [ ] **Revisar si hay más pares cruzados** en las ~35 políticas. Se revisaron
      órdenes y cotizaciones porque el error apuntó ahí; `reviews` mira
      `order_items` y `orders`, pero en una sola dirección y ninguna de las dos
      mira `reviews`, así que no cierra el círculo. Nadie lo ha ejecutado.
- [ ] El Bloque 5 (`docs/BETA.md`) sigue sin correrse completo: la matriz de
      órdenes ya está probada, el resto no.

## Qué se rompe si tocas esto

- **Revertir `0005` deja la aplicación sin poder leer una sola orden.** El
  rollback está escrito al final del archivo, pero reintroduce el fallo a
  propósito: solo sirve si el problema fuera otra cosa de esa migración.
- **Cualquier política nueva que consulte otra tabla cuyas políticas consulten la
  primera vuelve a cerrar el círculo.** La regla práctica: si una política
  necesita mirar otra tabla protegida, la pregunta se responde con una función
  `security definer` con `set search_path = public`, no con un `exists (...)`
  dentro de la política.
- `0001`, `0002`, `0003`, `0004` y `0005` son inmutables: ya corrieron contra la
  base. Todo cambio posterior es `0006_`.

## Verificación

Reproducido antes y comprobado después, simulando la identidad en el SQL Editor:

```sql
set local role authenticated;
set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}';
select count(*) from orders;
```

Antes: `42P17: infinite recursion`. Después, con una orden de prueba cuya línea
es de un proveedor real, y borrando todo al terminar:

| Quién | Órdenes que ve | Ítems que ve | Esperado |
|---|---|---|---|
| admin | 1 | 1 | ✅ todo |
| proveedor con un ítem en esa orden | 1 | 1 | ✅ solo esa |
| otro comprador cualquiera | 0 | 0 | ✅ ninguna |
| anónimo | 0 | 0 | ✅ ninguna |
