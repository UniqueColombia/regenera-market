# 08 · Oferta en revisión

**Plantilla de Supabase:** ninguna — **este correo lo manda la aplicación.**
**Se dispara cuando:** una empresa manda una oferta a revisión desde
`/cuenta/empresa/ofertas`.

> **Conectado.** Lo manda `correoOfertaEnRevision()` (en
> `src/lib/correo/plantillas.ts`) desde `src/app/cuenta/empresa/ofertas/actions.ts`,
> a quien envió la oferta, justo después de guardarla con
> `status = "pending_review"`. Un borrador no manda nada. Si el correo falla, la
> oferta queda guardada igual.

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
- Cada vez que se **reenvía** a revisión (por ejemplo, tras editarla) llega otro
  correo. Es lo esperado: cada envío es una cola nueva.
