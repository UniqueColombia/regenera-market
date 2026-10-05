# 09 · Oferta publicada

**Plantilla de Supabase:** ninguna — **este correo lo manda la aplicación.**
**Se dispara cuando:** el equipo aprueba una oferta (`approved`) desde
`/admin/ofertas`.

> **Escrito y sin conectar.** La función `correoOfertaPublicada()` existe en
> `src/lib/correo/plantillas.ts`. Iría en `cambiarEstadoOferta()` de
> `src/app/admin/ofertas/actions.ts` cuando el estado nuevo es `approved`. **Antes
> hay que resolver a quién se le manda**: esa acción hoy no lee el correo de los
> miembros de la empresa dueña de la oferta.

## Asunto

```
«{título}» ya está en Seregenera
```

## Qué dice, en texto plano

```
Tu oferta ya está publicada

«{título}» ya aparece en el catálogo y se puede comprar.

Ver mi oferta: {sitio}/oferta/{slug}

— Seregenera
```

## Lo que no existe todavía

No hay correo de «oferta no aprobada»: el panel cambia el estado a `rejected` sin
guardar un motivo, y un rechazo sin motivo es un correo que solo genera dudas.
Si se quiere, primero hace falta un campo de motivo en la base.
