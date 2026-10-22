# La contraseña quedaba en la URL si se entraba antes de que cargara la página

- **Fecha:** 2026-10-22
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `fix/js-claves-fuera-de-la-url` → `staging` → `main` (entrega directa), tag `v0.13.2`
- **Fase del roadmap:** — (seguridad)
- **Sigue a:** [2026-10-22-fechas-de-experiencias.md](2026-10-22-fechas-de-experiencias.md)

## Qué pasó

Jesús entró en `www.seregenera.com/entrar` y la barra de direcciones quedó en
`/entrar?email=…&password=…`, con la contraseña en claro.

**Causa:** ningún formulario de la app declaraba `method`. Todos se manejan con
`onSubmit` + `preventDefault()`, que solo existe cuando React ya tomó la página.
Si se envía antes —el navegador autocompleta y se aprieta Entrar mientras el
JavaScript todavía carga, algo común con conexión lenta— el navegador manda el
formulario él solo, y sin `method` lo hace por **GET**: cada campo con `name`
va a la URL. Quedan en el historial del navegador, en el registro de acceso del
servidor y en cualquier captura.

Se comprobó con un navegador automatizado que `/entrar` hidrata bien y sin
errores, en `seregenera.com` y en `www.`: no era una página rota, era una
carrera contra la carga.

**Lo que no estaba mal:** las contraseñas se guardan con hash (scrypt en
`src/lib/mysql/cuentas.ts`; las que venían de Supabase, en bcrypt, pasan a scrypt
en el primer acceso). La fuga era en el camino, no en la base. Las analíticas
propias (`medicion-uso.tsx`) guardan solo la ruta, sin la búsqueda, así que ahí
no quedó.

La auditoría de seguridad del 2026-10-20 revisó la custodia de las claves, las
cabeceras y las sesiones, pero no cómo se envía cada formulario sin JavaScript.

## Qué se hizo

| Capa | Qué hace |
|---|---|
| `method="post"` en los 14 formularios con `onSubmit` | La causa. Enviado antes de tiempo, va por POST: Next devuelve la misma página (comprobado en producción, 200) y nada queda en la URL. Los dos de búsqueda (portada y catálogo) siguen en GET a propósito |
| `useHidratado()` en acceso, registro y cambio de clave | El botón espera a que la página esté lista. Sin esto, el envío por POST antes de tiempo recargaba la página vacía y parecía que el botón no hacía nada |
| `redireccionCanonica()` en `src/proxy.ts` + `src/lib/url-sensible.ts` | Segunda barrera: una URL con `password`, `password2`, `actual`, `clave` o `token` se redirige (303, sin caché) a la misma ruta sin ellos ni el correo que los acompañaba, antes de pintar nada |
| `www.` → dominio sin `www` (308, solo GET/HEAD), en el mismo sitio | `www.seregenera.com` servía otra copia del sitio con sus propias cookies: la sesión de un dominio no valía en el otro y los redirects del acceso saltaban de dominio |

## Lo que no se puede arreglar desde el código

- La petición con la contraseña ya está en el registro de acceso de Hostinger.
  **Jesús cambia su contraseña**; con eso lo registrado deja de servir.
- Cualquier otra persona que haya entrado así tiene el mismo problema y no lo
  sabemos. Cambiar la contraseña al entrar es lo que se le pediría.

## Para lo que venga

**Todo `<form>` que se maneje con `onSubmit` lleva `method="post"`.** Si uno
nuevo se olvida, `url-sensible.ts` lo frena para las contraseñas y los códigos,
pero no para otros datos personales (teléfono, dirección, documento).
