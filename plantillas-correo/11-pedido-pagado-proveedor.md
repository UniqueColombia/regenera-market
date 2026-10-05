# 11 · Pedido pagado, aviso al proveedor

**Plantilla de Supabase:** ninguna — **este correo lo manda la aplicación.**
**Se dispara cuando:** el equipo confirma el pago de una orden (`paid`) y esa
orden incluye productos de una empresa.

> **Conectado**, en el mismo sitio que el correo 10: `avisarCambioDeOrden()` en
> `src/lib/correo/notificaciones.ts`. Cuando el estado es `paid`, además del
> comprador se le escribe **a cada persona que gestiona cada empresa con productos
> en esa orden**, y cada empresa recibe **solo sus propios productos**.

## Por qué al pagar y no al comprar

Antes del pago no hay nada que preparar, y avisarle a una empresa de una orden sin
pagar la invita a despachar algo que puede cancelarse. El aviso llega cuando el
equipo confirma el dinero.

## Asunto

```
Pedido pagado {ref} · {empresa}
```

## Qué dice, en texto plano

```
Tienes un pedido pagado

El pedido {ref} ya está pagado y incluye productos de {empresa}:
2 × {producto}
1 × {producto}

Tu empresa: {sitio}/cuenta/empresa

— Seregenera
```

**No lleva importes.** Las cifras las calcula la base y el correo no las repite
(invariantes 1 y 2 de `dominio-regenera`). El botón lleva a `/cuenta/empresa`
porque el panel de proveedor todavía no tiene una pantalla de sus órdenes
(Bloque 4); cuando exista, el enlace se cambia a ella.

## Una empresa sin nadie asignado no recibe nada

Como en el correo 09: sin `provider_members`, no hay a quién escribirle, y no da
error.
