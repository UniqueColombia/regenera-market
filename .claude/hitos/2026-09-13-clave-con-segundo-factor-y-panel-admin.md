# El acceso pasa a contraseña con segundo factor, y el panel de administración deja de ser una sola pantalla

- **Fecha:** 2026-09-13
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `feat/js-clave-y-panel-admin` → sin PR todavía
- **Fase del roadmap:** 1 y 2 — cierre del Bloque 3

## Qué se hizo

Tres cosas que no estaban conectadas entre sí más que por ser lo que faltaba
para operar la beta:

1. **El acceso tiene contraseña.** El registro pide nombre, apellido, teléfono
   con indicativo de país y una contraseña con barra de fuerza. El código de seis
   dígitos deja de pedirse en cada acceso y pasa a ser **segundo factor**: solo
   aparece al registrarse y al entrar desde un dispositivo que no se reconoce.
2. **El panel de administración pasa de una pantalla a seis**: resumen, ofertas
   (el CRUD que faltaba), proveedores, postulaciones, órdenes y usuarios. Las
   postulaciones y las órdenes, que vivían en memoria del proceso de Node y se
   perdían en cada redespliegue, ahora están en Postgres.
3. **La base ya no se va a dormir.** Un workflow de GitHub Actions la toca todos
   los días a las 07:10 de Colombia.

Además: **las cuentas de Jesús y de Ivan son administradoras** — antes no lo era
nadie, que era el requisito previo que bloqueaba el Bloque 3 entero. Los correos
no se escriben aquí: el repositorio es público.

## Por qué así

**El código de seis dígitos no se quitó: se ascendió.** Pedirlo en cada acceso
era un peaje diario, y un peaje diario acaba en gente dejando la sesión abierta
en computadores compartidos. Pedirlo solo en aparatos nuevos es el trato que la
gente ya conoce de su banco. La cookie que recuerda el aparato es propia,
`httpOnly` y de un año; en la base se guarda **el hash**, nunca el valor, por lo
mismo que una tabla de sesiones no guarda tokens en claro. No es huella de
navegador: la persona puede borrarla y solo le cuesta un código.

**La contraseña se comprueba con un cliente que no escribe cookies**
(`src/lib/supabase/efimero.ts`). Con el cliente normal, `signInWithPassword`
abriría la sesión en el instante en que la contraseña resulta correcta, y el
código posterior sería decorativo: bastaría cerrar la pestaña para navegar ya con
sesión. Esta es la pieza de la que depende que el segundo factor sea real.

**«Olvidé mi contraseña» no usa `resetPasswordForEmail`, y es deliberado.** Eso
exigiría una tercera plantilla de correo bien configurada, y las dos que
funcionan hoy costaron tres hallazgos encadenados (ver
[el hito del 11](2026-09-11-el-registro-funciona-de-punta-a-punta.md)): la
plantilla *Reset Password* de fábrica solo trae `{{ .ConfirmationURL }}`, que no
pasa por `/auth/callback` y no enseña ningún código. Así que recuperar la clave
**es** entrar con código y definir una nueva. Un camino menos que se pueda
romper en silencio, y de paso resuelve a quien se registró cuando no había
contraseñas: al entrar con código, la aplicación le exige ponerse una
(`requireUser()` redirige a `/cuenta/clave`).

**La fuerza de la clave la calcula `src/lib/password.ts`, el mismo módulo en los
dos lados.** Se descartó `zxcvbn`: estima mejor y arrastra ~400 kB de diccionario
que descargaría todo el que entra al sitio, abra o no el registro. Para frenar
«12345678», el propio correo y «seregenera2026», las reglas propias alcanzan.
Dos implementaciones distintas —una para la barra y otra para validar— acabarían
divergiendo, y el resultado sería una barra verde con un servidor que rechaza.

**Las órdenes las escribe el servidor con la clave de servicio.** Es la decisión
incómoda y está razonada entera en `src/lib/orders.ts`: se puede comprar sin
cuenta, así que una política RLS de inserción tendría que permitir escribir a
cualquiera, y entonces cualquiera podría mandar a PostgREST una orden con el
total que se le antoje. El total lo calcula el servidor (invariante 1) y RLS no
sabe expresar eso. **Las lecturas del panel sí van con el cliente de sesión**:
ahí hay usuario y `orders_admin` decide.

**La pantalla de usuarios no usa la clave de servicio** aunque necesite leer
correos de `auth.users`, que la clave anon no puede tocar. En su lugar, la
migración 0004 añade `admin_listar_usuarios()`, `security definer` con un
`where is_admin()` dentro: **ese `where` es la política**. Si la pantalla hubiera
tirado de `admin.ts`, el permiso lo estaría concediendo el código de la
aplicación en vez de la base.

**Contra la pausa de Supabase se descartó `pg_cron`.** Un trabajo dentro de
Postgres no genera ni una petición a la API, que es lo que cuenta el reloj de
inactividad: correría todos los días sin evitar la pausa. El latido tiene que
venir de fuera, y por eso lo dispara GitHub. Toca `/api/latido`, que consulta
`providers` de verdad —no un `select 1`— para que lo que se comprueba sea el
camino entero: PostgREST, conexión, RLS y tabla. De regalo, es el único aviso
automático que existe hoy de que producción se cayó.

**Se aprovechó para enlazar personas con empresas desde `/admin/usuarios`.** Era
el cabo suelto más silencioso del proyecto: los trece proveedores sembrados no
tienen ninguna fila en `provider_members`, así que `manages_provider()` devuelve
falso para todo el mundo y nadie puede gestionarlos. No falla nada ni avisa
nada. Aprobar una postulación ahora crea las tres cosas —empresa, vínculo y
rol— y la pantalla de usuarios avisa de las empresas que quedaron sin dueño.

## Qué quedó pendiente

- [ ] **Probar el recorrido en un navegador.** Aquí no hay navegador
      automatizado: lo verificado es el build, los tipos, el lint y las políticas
      RLS con el rol equivocado. El registro, el acceso desde un aparato nuevo y
      el formulario de oferta **los tiene que recorrer una persona**.
- [ ] `/admin/evaluaciones` — la quinta pantalla que pide `docs/BETA.md` sigue sin
      existir. Las evaluaciones de sostenibilidad se siguen revisando por SQL.
- [ ] **Las fechas con cupo de una experiencia no se editan desde el panel.**
      Viven en `listing_availability` y solo las siembra el script. Una
      experiencia creada desde `/admin/ofertas` se puede comprar sin fecha.
- [ ] **Subir imágenes sigue sin existir**: el formulario pide direcciones de
      texto. Está fuera de la beta a propósito (`docs/BETA.md`), pero es lo
      primero que va a pedir un proveedor real.
- [ ] La referencia de una orden hace de llave para verla sin sesión, y son
      cuatro caracteres aleatorios. Lo correcto es un token propio para el
      enlace, no estrechar la referencia que la gente copia en la transferencia.
- [ ] El correo de acceso sigue saliendo del Gmail personal de Jesús.
- [ ] Los secretos `SUPABASE_URL` y `SUPABASE_ANON_KEY` del workflow de latido
      los tiene que crear alguien con permiso de administración del repositorio
      (Ivan). **Sin ellos el latido funciona igual**; lo que se pierde es poder
      distinguir «se cayó Vercel» de «se pausó Supabase».

## Qué se rompe si tocas esto

- **`src/lib/supabase/efimero.ts` es lo que hace real el segundo factor.** Si
  alguien cambia `entrarConClave()` para usar el cliente de `server.ts`, todo
  sigue funcionando de cara al usuario y el segundo factor deja de proteger:
  la sesión queda abierta antes de pedir el código. No hay ninguna prueba que lo
  detecte.
- **`user_metadata.tiene_clave` es la única forma de saber si una cuenta tiene
  contraseña.** Supabase no lo expone por ninguna vía: `user.identities` trae el
  proveedor `email` en los dos casos. Si se deja de escribir esa marca, a todo el
  mundo se le empezará a exigir crear una contraseña que ya tiene.
- **`requireUser()` redirige a `/cuenta/clave` a quien no tenga contraseña.** El
  corte del bucle es el parámetro `destino`: la propia pantalla llama a
  `requireUser("/cuenta/clave")`. Si alguien copia esa llamada sin el argumento
  en esa página, el sitio entra en un bucle de redirecciones.
- **`src/lib/order-status.ts` existe por una restricción del compilador**: un
  archivo `"use server"` solo puede exportar funciones asíncronas, así que las
  tablas de transiciones y etiquetas no pueden vivir en `ordenes/actions.ts`. La
  tabla de transiciones tiene que seguir siendo la misma en el cliente y en el
  servidor, o habrá botones que solo sirven para dar error.
- **El formulario de oferta limpia los campos del otro tipo al guardar.** Una
  experiencia convertida en producto pierde punto de encuentro e incluye. Es a
  propósito; si se quita, la ficha pública enseña datos que ya no significan nada.
- **`0004` ya está aplicada contra la base real.** Todo cambio posterior es
  `0005_`.
- La cookie del dispositivo se llama `sgr_dispositivo` y **no** usa el prefijo
  `__Host-`: ese prefijo exige `secure`, y en `localhost` sobre http el navegador
  la descartaría en silencio. El síntoma sería «el código se pide siempre» en
  desarrollo, sin ninguna pista.

## Verificación

```bash
npm run build && npx tsc --noEmit && npx eslint src scripts   # los tres en limpio
curl -s localhost:3000/api/latido                             # {"ok":true,...}
curl -s -o /dev/null -w "%{redirect_url}\n" localhost:3000/admin   # → /entrar?volver=%2Fadmin
```

La migración `0004` se aplicó con la Management API de Supabase (token personal
en `.env.local`, nunca en el repositorio) y se comprobó objeto por objeto: dos
tablas nuevas, cuatro políticas, la política de cupos para admin, las tres
columnas de impacto en `orders` y la función de usuarios.

**Las políticas se probaron con el rol equivocado**, que es lo único que prueba
algo. Con un usuario de prueba creado y borrado en el acto, doce comprobaciones,
las doce en verde:

| Quién | Intenta | Resultado |
|---|---|---|
| usuario nuevo | entrar con la contraseña correcta / incorrecta | entra / no entra |
| el trigger | crear perfil y rol `buyer` al registrarse | los crea |
| usuario | guardar **su** dispositivo de confianza | lo guarda |
| usuario | guardar un dispositivo **a nombre de otro** | `42501` |
| usuario | listar dispositivos ajenos | 0 filas |
| usuario | `insert into user_roles` con `'admin'` | `42501` |
| usuario | `admin_listar_usuarios()` | 0 filas |
| usuario y anónimo | leer postulaciones ajenas | 0 filas |
| anónimo | postular desde `/vender` | lo permite |

Las columnas nuevas de `orders` y `order_items` se comprobaron insertando una
orden de prueba con su línea y borrándola.
