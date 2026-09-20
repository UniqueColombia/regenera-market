# La causa era un `.refine()` que lanzaba: nadie sin página web podía darse de alta

- **Fecha:** 2026-09-20
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `fix/js-website-refine` → #55
- **Fase del roadmap:** 1 y 2 — corrección

> Cierra lo que quedó abierto en
> [2026-09-20-alta-de-empresa-diagnosticable.md](2026-09-20-alta-de-empresa-diagnosticable.md),
> que decía: «la causa original sigue sin identificarse». Ya está identificada,
> reproducida y corregida.

## Qué se hizo

Se encontró por qué fallaba el alta de una empresa. **El campo de página web,
cuando se dejaba vacío, hacía lanzar a la validación entera.**

```ts
website: z.union([
  z.url("Revisa la dirección web")
    .refine((u) => /^https?:$/.test(new URL(u).protocol), "…"),
  z.literal(""),
])
```

Con `website: ""`, `z.url()` falla — y **en Zod 4 el `.refine()` se ejecuta
igual**, porque los refinamientos ya no cortan la cadena cuando algo anterior
falló. Así que el refinamiento corría con la cadena vacía y `new URL("")`
lanzaba `TypeError: Invalid URL`.

Una excepción dentro de un refinamiento **sale de `safeParse`**: no se convierte
en un error de validación, se propaga. La acción lanzaba antes de tocar la base,
y por eso el síntoma era «da error y no crea la empresa» sin una sola fila en
`provider_applications`.

Se cambió la comprobación por una expresión regular sobre la cadena, que no
puede fallar. La protección es la misma: `javascript:alert(1)` sigue sin pasar.

## Por qué costó encontrarlo

Porque **no se podía ver desde fuera y se veía como otra cosa**. Tres intentos
de encontrarlo leyendo el código no dieron con él, y conviene apuntar por qué:

- El fallo estaba en el esquema de validación, que es el último sitio donde uno
  busca una excepción: un validador se lee como algo que *devuelve* errores, no
  como algo que *lanza*.
- El mensaje que llegaba a la persona era genérico, y hasta el 2026-09-19 ni
  siquiera había un código con el que buscarlo.
- **Le pasaba solo a quien dejaba el campo vacío.** El alta del 2026-09-18 que
  sí funcionó llevaba página web, y eso hizo parecer que el camino estaba
  probado. La distinción no era el país, ni la sesión, ni el correo: era un
  campo opcional que la mayoría deja en blanco.

Lo que sí funcionó, y en dos minutos:

1. **Comprobar en la base si el RPC llegó a ejecutarse.** No había ninguna fila
   de ese día en `provider_applications` → el fallo era anterior a la base.
2. **Mirar los registros de peticiones de Supabase.** Cero llamadas a
   `/rest/v1/rpc/postular_proveedor` en 26 horas → supabase-js nunca llegó a
   pedir nada → la excepción era anterior a la llamada.
3. **Ejecutar la acción real desde una ruta temporal** con el payload exacto y
   devolver `e.stack`. Ahí apareció `TypeError: Invalid URL`.

Los pasos 1 y 2 son los que acotaron el problema a tres líneas de código. Están
escritos como procedimiento para la próxima vez.

## Por qué la instrumentación del día anterior no sobró

Sin ella este hito no existiría: el código `JG5R5F` que reportó la persona es lo
que confirmó que la acción **capturaba** una excepción en vez de fallar en la
base, y eso es lo que orientó la búsqueda hacia el lado de JavaScript. La
diferencia entre «da error» y «captura una excepción antes de llamar a la base»
es la que convierte un misterio en tres pasos.

## Qué quedó pendiente

- **Nada de este fallo.** Está reproducido, corregido y comprobado ejecutando la
  acción real de punta a punta.
- La prueba se hizo con la ruta anónima (sin sesión), que es la que se puede
  correr sin crear una empresa de verdad. La fila de prueba se borró; el camino
  con sesión está comprobado aparte, llamando a `postular_proveedor()` dentro de
  una transacción con `rollback`.

## Qué se rompe si tocas esto

- **Un `.refine()` no puede lanzar nunca.** Está como regla en la skill
  `componentizacion`, con las dos formas de escribirlo bien. Si alguien
  «simplifica» el `typeof u !== "string"` de delante, vuelve el fallo: ese
  guardia es el caso en que la validación anterior ya falló.
- **La protección del campo web sigue siendo necesaria.** No es cosmética: sin
  ella, `javascript:alert(1)` acaba en el `href` de un enlace que pulsa un
  administrador en `/admin/postulaciones`. Si algún día se reescribe, la
  comprobación tiene que seguir rechazando todo lo que no empiece por `http://`
  o `https://`.

## Verificación

Ejecutando la acción real (`submitApplication`) con el payload exacto del
reporte —Chile, descripción de 184 caracteres, **campo web vacío**—:

| | Antes | Después |
|---|---|---|
| Resultado | `TypeError: Invalid URL` capturado, código en pantalla | `{ ok: true }` |
| Filas en `provider_applications` | ninguna | la esperada |

Y antes de eso, con la base delante: `postular_proveedor()` llamado dentro de
una transacción con `rollback` y una sesión simulada devuelve
`activado: true` con su `provider_id` y su `provider_slug` — o sea que la
función nunca estuvo rota.

`npm run build`, `npx tsc --noEmit` y `npx eslint src --max-warnings 0`, los tres
en limpio. La fila de prueba y la ruta temporal de diagnóstico se borraron.
