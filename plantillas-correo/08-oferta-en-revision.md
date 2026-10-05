# 08 · Oferta en revisión

**Plantilla de Supabase:** ninguna — **este correo lo manda la aplicación.**
**Se dispara cuando:** una empresa manda una oferta a revisión desde
`/cuenta/empresa/ofertas`.

> **Escrito y sin conectar.** La función `correoOfertaEnRevision()` existe en
> `src/lib/correo/plantillas.ts`, pero ninguna acción la llama todavía. Iría en
> `src/app/cuenta/empresa/ofertas/actions.ts`, después de guardar con
> `status = "pending_review"`, y con el mismo patrón que el correo del pedido en
> `src/app/carrito/actions.ts`: fuera del camino crítico, dentro de un `try`.

## Asunto

```
Recibimos tu oferta «{título}»
```

## Qué dice, en texto plano

```
Tu oferta está en revisión

Recibimos «{título}». El equipo la revisa antes de mostrarla en el catálogo y
te avisamos apenas esté publicada.
Si la editas, vuelve a la cola de revisión.

Mis ofertas: {sitio}/cuenta/empresa/ofertas

— Seregenera
```

## Qué se rompe si se toca

- «Si la editas, vuelve a la cola de revisión» es **verdad por diseño**
  (ver la cabecera de `ofertas/actions.ts`). Si cambia esa regla, cambia este texto.
- El título de la oferta lo escribe la empresa: pasa por `escapar()`.
