# El registro funciona de punta a punta, y la configuración que lo permite no está en el repositorio

- **Fecha:** 2026-09-11
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `fix/js-longitud-del-codigo` → #39 · `docs/js-estado-al-dia-y-pendientes` → #40
- **Fase del roadmap:** 1 y 2 — cierre real del Bloque 2

Continúa [2026-09-11-la-migracion-a-postgres-dejo-dos-cabos-sueltos.md](2026-09-11-la-migracion-a-postgres-dejo-dos-cabos-sueltos.md),
que dejó como pendiente precisamente esto: «nada de esto se probó de punta a
punta con un correo real». Ya se probó.

## Qué se hizo

Una persona se registra en `/registro`, recibe un correo con un código de seis
dígitos, lo escribe y entra. El enlace del correo también funciona. **Comprobado
contra producción el 2026-09-11 con un correo real.**

Lo que costó no fue código: fueron tres hallazgos encadenados en el panel de
Supabase, y ninguno de los tres es visible desde el repositorio.

## Por qué así

### El orden SMTP → plantillas no es una preferencia, es una dependencia

El síntoma inicial era que el correo traía un enlace y la pantalla pedía seis
dígitos. La causa era que las plantillas de fábrica solo usan
`{{ .ConfirmationURL }}` y nunca `{{ .Token }}`.

Al ir a editarlas apareció el muro: *«Set up custom SMTP to edit templates»*. Se
leyó primero como un muro de plan y **no lo es**. Desde el 3 de junio de 2026
Supabase bloquea la edición de plantillas a los proyectos gratuitos que usan su
enviador por defecto — estarían mandando texto arbitrario desde infraestructura
de Supabase. Configurar un SMTP propio las desbloquea, y eso no se cobra. El
nuestro se creó en septiembre, así que le aplica.

La consecuencia que cambió el plan del día: **el SMTP dejó de ser una tarea de
Ivan que bloqueaba la beta.** Las plantillas son configuración aparte y
sobreviven al cambio de credenciales, así que sirvió un Gmail personal para
desbloquearlas, editarlas y probar el flujo entero. La cuenta de Workspace pasa
de requisito a mejora del remitente.

### Se descartó el Send Email hook

Está disponible en el plan gratuito, así que era una alternativa real. No se usó
porque no edita las plantillas: **las reemplaza**, obligando a escribir el correo
en código. Y una función de Postgres no puede mandar un correo —Postgres no habla
SMTP—: el ejemplo oficial solo encola en una tabla y todavía hacen falta
`pg_cron`, un proceso que la vacíe y un proveedor externo. Se acaba necesitando
el proveedor igual, más código propio que mantener. Es la herramienta para lógica
que las plantillas no expresan (idiomas, plantillas por tipo de cliente), no un
atajo.

### La longitud del código la manda el panel

Con el correo ya llegando, traía **ocho** dígitos. `Email OTP Length` es un
ajuste del panel, configurable entre 6 y 10, y estaba en 8.

Había además dos números clavados en el código, los dos equivocados: la
validación exigía seis exactos y el campo tenía `maxLength={7}`. Ese `maxLength`
es el peor de los tres, porque **no rechazaba el código: no dejaba terminar de
escribirlo**. El campo cortaba en el séptimo carácter, así que el síntoma era «me
manda un código de siete dígitos».

Se puso el panel en 6, pero la validación se abrió al rango entero (6–10) en vez
de clavar el 6. El motivo es el mismo patrón que ya había mordido con las
plantillas: **un ajuste que vive en el panel, que el repositorio no ve y el CI no
puede comprobar, no puede estar duplicado en el código como un número exacto.** Si
alguien lo sube, con la versión anterior nadie podría entrar y el mensaje de
error diría que el código está mal teniendo el usuario el correcto delante.

El texto visible sigue diciendo «seis dígitos» porque ayuda y porque el panel
queda en 6. Una pista puede envejecer mal; una puerta no.

### Las plantillas van sin imágenes

Gmail bloquea las imágenes remotas hasta que el destinatario las pide, y no
admite SVG — que es el único formato en que existe el isotipo
(`public/img/marca/`). Un correo cuya identidad depende de una imagen bloqueada
llega roto. La marca la llevan la tipografía y el color: Georgia (que es el
respaldo que el propio sitio declara en `--font-display`, así que cae en la misma
letra) y el verde `#1b5b3d` de `globals.css`.

El código va en serif y muy separado, igual que el campo de `/entrar`: quien
tiene el correo y la pantalla delante ve la misma forma dos veces, que es lo que
hace que se copie sin equivocarse. El enlace va como enlace de texto y no como
botón verde, para no convertir un camino claro en dos opciones que pesan igual.

## Qué quedó pendiente

- **El SMTP definitivo.** Hoy el remitente es el Gmail personal de Jesús. No
  bloquea nada, pero un correo de acceso desde un Gmail personal no se sostiene
  frente a un hotel, y el techo de una cuenta personal es de ~500 al día.
- **Nadie es admin todavía.** Es lo siguiente, y es requisito para poder siquiera
  ver el panel que ya existe.
- **El Bloque 3 no está cerrado**, aunque `docs/ESTADO.md` lo diera por cerrado
  hasta hoy. `/admin` es una pantalla que hace una cosa. Faltan cuatro.
- Las tres variables de Supabase en *Preview*.

## Qué se rompe si tocas esto

- **Si alguien recrea el proyecto de Supabase, se pierde todo esto en silencio.**
  No hay `supabase/config.toml` en el repositorio: ni las plantillas, ni el SMTP,
  ni `Email OTP Length` están versionados, y el CI no puede detectar que faltan.
  El build seguirá verde y el registro dejará de funcionar. La sección «Cómo
  quedó configurado» de `docs/ESTADO.md` es la única copia.
- **La plantilla no puede volver a `{{ .ConfirmationURL }}`.** Es lo que dice
  cualquier tutorial. Si alguien la «arregla» así, `/auth/callback` deja de
  recibir visitas y el enlace vuelve a no hacer nada, sin error.
- **El remitente del SMTP tiene que ser la misma cuenta que autentica.** Gmail
  reescribe o rechaza un `From` que no sea suyo ni un alias verificado. Poner
  `info@uniquecolombia.co` autenticando con un Gmail personal no funciona.
- **`Email OTP Length` y el texto de `/entrar` deben coincidir.** La validación
  ya no se rompe si divergen, pero la pantalla mentirá.

## Verificación

`npm run build`, `npx tsc --noEmit` y `npx eslint .` en limpio. CI en verde en
los PR #36, #38, #39 y #40.

Contra producción, `v0.3.1` y `v0.3.2`:

| Prueba | Resultado |
|---|---|
| `/catalogo` | 200, 18 ofertas |
| `/admin` sin sesión | 307 |
| `/auth/callback` sin parámetros | 307 a `/entrar?error=sin-codigo` |
| `/auth/callback` con `token_hash` falso y `next` externo | no sale del dominio |
| `/entrar?error=codigo-invalido` | muestra el mensaje |
| **Registro real en `/registro`** | **llega el código, entra** |
| **El enlace del correo** | **entra** |

Las dos últimas las hizo Jesús a mano, con un correo real y en producción.
