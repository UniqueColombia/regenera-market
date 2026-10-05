# 09 · Oferta publicada

**Plantilla de Supabase:** ninguna — **este correo lo manda la aplicación.**
**Se dispara cuando:** el equipo aprueba una oferta (`approved`) desde
`/admin/ofertas`.

> **Conectado.** Lo manda `avisarOfertaPublicada()`
> (`src/lib/correo/notificaciones.ts`) desde `cambiarEstadoOferta()` en
> `src/app/admin/ofertas/actions.ts`. Le llega **a cada persona que gestiona la
> empresa** (`provider_members`), y solo cuando la oferta **pasa** a aprobada:
> aprobar lo que ya estaba aprobado no manda nada.
>
> Para leer el correo de esas personas usa el cliente de servicio, porque el
> correo vive en `auth.users` y ninguna política RLS lo deja leer. Solo lee.

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
Si se quiere, primero hace falta un campo de motivo en la base, que es una
migración y una decisión de los dos.

## Una empresa sin nadie asignado no recibe nada

Los proveedores sembrados no tienen `provider_members`. Mientras una empresa no
tenga a nadie, aprobarle una oferta no manda ningún correo ni da error.
