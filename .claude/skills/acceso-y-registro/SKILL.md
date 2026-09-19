---
name: acceso-y-registro
description: Los tres caminos de entrada a Seregenera —registro, acceso con contraseña y código de seis dígitos— y a dónde termina cada uno. Úsala antes de tocar src/app/entrar/, src/app/registro/, src/components/paso-codigo.tsx, src/lib/auth.ts o src/app/cuenta/clave/, y siempre que cambies a dónde va alguien después de verificar un código o abrir sesión.
---

# Acceso y registro

El modelo está explicado en la cabecera de `src/app/entrar/actions.ts` y no se
repite aquí. Esta skill trata de lo que se rompe al tocarlo: **a dónde va la
persona después**, que es donde estaba el bug del 2026-09-19.

## Las tres puertas

| Camino | Qué pide | Dónde vive |
|---|---|---|
| **Registro** | nombre, correo, teléfono, contraseña → código que confirma el correo | `/registro` |
| **Acceso con contraseña** | contraseña; y el código solo si el aparato no se reconoce | `/entrar` |
| **Acceso con código** | solo el código. Cubre a quien nunca tuvo contraseña y a quien la olvidó | `/entrar` |

Los tres desembocan en `PasoCodigo` (`src/components/paso-codigo.tsx`), y por eso
es el componente que hay que mirar antes de cambiar nada de esto.

## La regla que se rompió: quién puede mandar a `/cuenta/clave`

`PasoCodigo` decidía el destino con `necesitaClave`, la bandera que dice que una
cuenta no tiene contraseña. **Esa bandera está pensada para `/entrar`**: cubre a
las cuentas que nacieron cuando el acceso era solo por código y a las que crea un
administrador con `scripts/crear-admin.mts`.

Aplicada al registro producía esto:

1. El formulario pide una contraseña y la persona la escribe dos veces.
2. Llega el código de seis dígitos y lo escribe.
3. El sitio lo manda a `/cuenta/clave`, que le pide **otra contraseña**.

Lo que comunica ese tercer paso es que el primero no sirvió de nada, y quien lo
vive razonablemente concluye que el registro está roto.

> **Nunca se le pide a alguien un dato que acaba de dar en el mismo flujo.**
> Si una pantalla lo vuelve a pedir, el flujo está mal, no el usuario.

La forma del arreglo importa: `PasoCodigo` recibe un parámetro `origen`
(`"acceso" | "registro"`) y **desde el registro ignora `necesitaClave`**. No se
tocó `necesitaClave` ni `requireUser()`, porque en `/entrar` hacen exactamente lo
que deben. Si la marca `tiene_clave` faltara de verdad, `requireUser()` lo llevará
a ponerse una la próxima vez que entre a algo que exija sesión — más tarde, y en
un momento en que la petición se entiende.

## El registro termina en `/registro/listo`

No en la portada y no en `/cuenta/clave`. La página dice lo único que hacía falta
decir —la cuenta quedó activa— y ofrece los tres siguientes pasos.

Dos detalles que parecen menores y no lo son:

- **Usa `getSesion()`, no `requireUser()`.** `requireUser()` rebota a
  `/cuenta/clave` cuando falta `tiene_clave`, que es justo el rebote que esta
  página existe para quitar de en medio.
- **Los dos caminos del registro pasan por ella**, también aquel en el que
  Supabase devuelve sesión sin pedir código (confirmación de correo desactivada
  en el panel). El resultado es el mismo y decirlo en los dos sitios evita que el
  registro termine en una portada que no explica qué pasó.

## `?volver=` es una URL de la barra de direcciones

Toda pantalla que redirija a lo que venga en `volver` lo comprueba antes:

```ts
const destino = volver?.startsWith("/") && !volver.startsWith("//") ? volver : "/";
```

Sin esas dos condiciones es un redirector abierto: un correo de suplantación
manda a `…?volver=https://otro` y la persona sale de un dominio en el que confía
sin enterarse. La comprobación está repetida en `PasoCodigo`,
`FormularioRegistro`, `/registro/listo` y `/auth/callback` — repetida a
propósito, porque cada una decide su propio redirect.

## Lo que no se toca sin leer primero

- **`createEphemeralClient()` en `entrarConClave`.** Comprueba la contraseña sin
  escribir cookies. Con el cliente normal, la sesión quedaría abierta en cuanto
  la contraseña resulta correcta y el código que se pide después no protegería de
  nada.
- **`signOut({ scope: "local" })`.** Sin `scope`, `signOut()` cierra la sesión en
  **todos** los dispositivos: entrar desde un computador nuevo echaría a la
  persona de su teléfono, y el síntoma («se me cierra sola») no apunta a la
  causa.
- **`confiarEnEsteAparato()` se llama solo tras verificar el código.** Es lo que
  sostiene el segundo factor: un aparato se vuelve de confianza como
  consecuencia de haberlo pasado, nunca antes.
- **`{{ .ConfirmationURL }}` en las plantillas de correo.** Verifica en el
  endpoint de Supabase y devuelve el token en el fragmento `#`, que no viaja al
  servidor: `/auth/callback` deja de recibir visitas y el enlace no hace nada.
  Las plantillas usan `{{ .Token }}` y `{{ .TokenHash }}`.
- **La longitud del código** la decide el panel de Supabase (6 a 10). El código
  acepta el rango entero; clavar el número de hoy convierte un cambio de ajuste
  en un bloqueo total del acceso.

## Antes de cerrar

- [ ] Ninguna pantalla pide un dato que se dio antes en el mismo flujo
- [ ] Todo redirect que venga de `volver` está comprobado
- [ ] El registro termina en una pantalla que dice qué quedó hecho
- [ ] `/entrar` sigue llevando a `/cuenta/clave` a quien de verdad no tiene una
- [ ] Probado desde un aparato «nuevo» (borrar la cookie del dispositivo)
