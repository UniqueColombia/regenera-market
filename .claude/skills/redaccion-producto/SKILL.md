---
name: redaccion-producto
description: Cómo se escribe el texto que lee un usuario o un proveedor en Seregenera — qué se nombra, qué sobra y cómo se cita una ley sin volver el sitio colombiano. Úsala antes de escribir o cambiar cualquier texto visible: un título de sección, una tarjeta de beneficio, un mensaje de confirmación, una etiqueta de formulario, un correo o una descripción de metadatos.
---

# Redacción de producto

Estas reglas salieron de una revisión del 2026-09-19 en la que la mitad de las
observaciones eran de texto, no de código. El patrón era siempre el mismo, así
que aquí está escrito una vez.

## Regla 1 — Nombra lo que hay, no lo que falta

**Si una frase se puede sustituir por «no te hacemos X» sin perder información,
sobra.**

El texto de `/vender` decía:

> **Publicas hoy, no cuando te aprobemos**
> Te registras y tu ficha existe. No hay comité, ni cinco días hábiles, ni un
> correo que nunca llega.

Todo es verdad y nada de eso dice qué recibe quien se registra. Quien llega a esa
página quiere saber **qué le dan**, no de qué se libra. Además tiene un efecto de
segundo orden: para entender la frase hay que imaginarse primero el trámite
horrible que no ocurre, así que el texto le mete en la cabeza al lector la
burocracia que estaba intentando negar.

Lo mismo pasaba en cuatro sitios más: «No hay nada que aprobar», «No revisamos ni
aprobamos nada», «ninguna es un trámite nuestro», «no comprándola ni esperando a
que alguien la apruebe».

| En vez de | Escribe |
|---|---|
| «Publicas hoy, no cuando te aprobemos» | «Tu catálogo publicado y buscable» + qué incluye |
| «No hay nada que aprobar» | «Ya puedes publicar lo que vendes» |
| «Sin comité ni cinco días hábiles» | nada: bórralo |
| «Tu nivel no lo aprueba nadie» | «El nivel se acumula con la actividad del día a día» |

La excepción son los **límites de verdad**, que sí hay que decir: «Publicar
siempre es gratis, en cualquier nivel» o «solo se cobra comisión sobre una venta
cerrada» acotan una expectativa de dinero. La diferencia es que informan de una
condición real, no describen un trámite ausente.

## Regla 2 — Una pantalla de confirmación tiene un solo trabajo: el siguiente paso

No explicar el modelo de negocio, no tranquilizar sobre lo que no va a pasar.
Qué quedó hecho, en una frase, y a dónde ir ahora.

Se aplica a `Listo` de `src/app/vender/application-form.tsx` y a
`src/app/registro/listo/page.tsx`.

## Regla 3 — El formulario pregunta lo que no sabe

Si hay sesión abierta, el sitio ya sabe el nombre, el correo y el teléfono. Un
campo que vuelve a pedirlos comunica que el registro anterior no sirvió de nada.

Dos salidas, y hay que elegir según el caso:

- **Prellenar y dejar editable** cuando el dato puede legítimamente ser otro. El
  correo de la cuenta puede ser el personal y el de la empresa otro; el
  representante legal puede no ser quien teclea. Es lo que hace
  `datosConocidos()` en `src/app/vender/page.tsx`.
- **No preguntar** cuando el dato no puede ser otro.

**Y revisa a quién le habla el campo.** En `/vender` no se está dando de alta una
persona: se está dando de alta **una empresa**. «Tu nombre» era la pregunta
equivocada aunque el dato fuera el correcto; la pregunta es «nombre del
representante legal». Antes de escribir una etiqueta, pregúntate de qué entidad
es ese atributo.

## Regla 4 — Ninguna ley concreta sin el país delante

La cláusula de autorización de datos decía «conforme a la Ley 1581 de 2012». Esa
es la ley **colombiana**, en un formulario que acepta proveedores de dieciocho
países. Pasa una de dos cosas, y las dos son malas: o el peruano que la lee
concluye que el sitio no es para él, o firma una autorización que cita una norma
que no le aplica — y entonces no autoriza nada.

El patrón que se usa:

1. La redacción que manda es **general**: «conforme a la normativa de protección
   de datos que resulte aplicable».
2. Se **nombra** la del país elegido cuando la sabemos, desde
   `PAISES[].proteccionDatos` en `src/lib/paises.ts`. Nombrarla es lo que le da
   fuerza a una autorización: saber bajo qué norma se otorga.
3. Cuando no la sabemos (`Otro`, o un país sin dato), la cláusula general se
   queda sola. **No se inventa una ley.**

La misma tabla resuelve el problema hermano, que ya estaba resuelto: el documento
tributario se llama NIT, RUC, RFC, CUIT o RUT según el país, y decirle «RUT» a
todo el mundo hacía que el formulario se leyera como chileno.

**Generalizando: ningún texto visible asume Colombia.** Ni una moneda, ni un
documento, ni una ley, ni una división administrativa («departamento» es
«provincia», «región» o «estado» según dónde estés). Colombia es el mercado de
hoy y por eso va primero en las listas; no es el único.

## Regla 5 — No prometas puntos por algo que no se puede hacer

`articulo_publicado` y `articulo_destacado` vivieron un tiempo en
`otorgar_experiencia()` y en `src/lib/niveles.ts` sin que existiera la Comunidad.
`/niveles` los escondía con una lista `AUN_NO`, y esa es la salida correcta: el
valor se define con la regla, pero **la pantalla solo anuncia lo que se puede
hacer hoy**.

Si vuelve a pasar, se filtra en la página; nunca se quita de `src/lib/niveles.ts`,
que es el gemelo de la base.

## Lo de siempre

- **Español en todo**, incluido el texto de los errores.
- **La marca es Seregenera.** El repositorio se llama `regenera-market`; ningún
  texto visible dice «Regenera Market».
- Los proveedores de `src/data/` son **de demostración**. No se presentan como
  reales en ninguna parte.
- Un error se dice junto al campo, en texto, y explica qué hacer: «El código no
  es válido o ya venció. Pide uno nuevo», no «Error de validación».

## Antes de cerrar

- [ ] Ninguna frase describe un trámite que no ocurre
- [ ] Ninguna ley, moneda o documento asume un país
- [ ] Ningún formulario pregunta algo que la sesión ya sabe sin prellenarlo
- [ ] Cada etiqueta pregunta por el atributo de la entidad correcta
- [ ] Ninguna pantalla anuncia algo que todavía no se puede hacer
