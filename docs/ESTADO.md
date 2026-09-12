# Dónde estamos

**Este archivo responde a «¿en qué vamos?».** Es el único que dice qué está a
medias *ahora mismo* y qué sigue. Si acabas de hacer `git pull` y quieres saber
qué hacer, empieza aquí y no en el ROADMAP.

- **Corte:** 2026-09-07
- **Producción:** `v0.3.0` en `main` → **https://regenera-market.vercel.app**
- **Fase del roadmap:** 0 cerrada. **Bloques 0, 1, 2 y 3 de `docs/BETA.md`
  implementados y en producción.** Falta el correo para que el registro sirva
  para gente real.

> **Antes de creerle a este archivo, comprueba que no está viejo.** Es el único
> documento del repositorio que caduca.
>
> ```bash
> git log --oneline $(git tag -l --sort=-v:refname | head -1)..origin/main
> ls .claude/hitos/ | tail -3
> ```
>
> Si hay commits o hitos posteriores al corte de arriba y este archivo no los
> menciona, está desactualizado: **gana el hito**. Quien avance un bloque
> actualiza este archivo en el mismo PR.

---

## ✅ Producción está configurada — y por qué eso hay que cuidarlo

**Resuelto el 2026-09-07** con el release `v0.3.0`. Las cuatro variables están en
el entorno **Production** de Vercel y el sitio sirve el catálogo desde Postgres.
Ver [el hito](../.claude/hitos/2026-09-07-release-v0-3-0-en-produccion.md).

Desde que `src/lib/repo.ts` consulta Postgres, **la aplicación ya no funciona sin
credenciales.** Es un cambio irreversible de propiedad: antes el catálogo vivía
en `src/data/` y el sitio se levantaba con `.env.local` vacío; ahora no.

Falla de forma ruidosa y con un mensaje que dice qué hacer, que es lo que se
quería — un sitio que sirviera datos de demostración en silencio sería peor.

**El verde del CI no protege de esto.** El build compila sin las variables: las
páginas que leen datos están marcadas `force-dynamic` y `getUser()` devuelve
anónimo cuando no hay Supabase configurado, para que un clon recién bajado
compile. Lo que falla sin ellas es el runtime. Corolario: **borrar o renombrar
cualquiera de las cuatro tumba el sitio en el siguiente despliegue y ningún check
te avisa.**

| Variable | Production | Preview |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | ✅ el dominio real | — (se queda en Production) |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | ❌ **falta** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | ❌ **falta** |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | ❌ **falta** |

`NEXT_PUBLIC_SITE_URL` es **por entorno**: en Production el dominio real, en
`.env.local` `http://localhost:3000`. Copiar el de local a Vercel deja el
`og:image` apuntando a localhost.

> `SUPABASE_SERVICE_ROLE_KEY` **jamás** lleva prefijo `NEXT_PUBLIC_`. El job
> `secretos` del CI falla si aparece en el código, y hace bien: esa clave en el
> bundle del navegador es acceso total a la base saltándose RLS.

### Cárgalas por el panel, no por el CLI

`https://vercel.com/uniquecolombias-projects/regenera-market/settings/environment-variables`

Se intentó con `vercel env add` y hay dos trampas que cuestan una hora:

1. **Guarda las comillas literalmente.** Un `NEXT_PUBLIC_SUPABASE_URL="https://…"`
   copiado de `.env.local` queda almacenado *con* las comillas, y ninguna
   petición a Supabase funciona. El CLI lo avisa con
   `! Value includes surrounding quotes`, en medio de mucho ruido.
2. **`vercel env add <nombre> preview` abre un prompt interactivo** (`? Git
   branch?`) que no se puede contestar si el valor llega por tubería. Los `add`
   de Preview se quedan colgados sin guardar nada.

Además, `vercel env add` **falla en silencio si la variable ya existe**: hay que
`vercel env rm <nombre> <entorno> --yes` antes de reintentar. Si el `created` del
`env ls` no cambia, no se guardó nada.

Y **al agregar una variable, los despliegues existentes no la toman**: hace falta
un build nuevo.

### Aparte del CLI y de las variables

- **Supabase → Authentication → URL Configuration.** ✅ hecho. El dominio de
  producción en *Site URL*, y `…/auth/callback` + `…/**` en *Redirect URLs*. Es
  independiente de `NEXT_PUBLIC_SITE_URL`: si ahí solo estuviera `localhost`, el
  código de seis dígitos falla en producción sin dejar claro por qué.
- **Vercel → Settings → Node.js Version.** El CI usa 22
  (`.github/workflows/ci.yml`); si no coinciden, el CI pasa en verde y producción
  falla.

### Cómo se comprueba que producción está viva

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://regenera-market.vercel.app/catalogo
#   200 = la base responde; 500 = faltan las claves de Supabase
curl -s https://regenera-market.vercel.app | grep -o '<meta property="og:image"[^>]*>'
#   si dice localhost:3000, falta NEXT_PUBLIC_SITE_URL
curl -s https://regenera-market.vercel.app/catalogo | grep -o 'href="/oferta/[a-z0-9-]*"' | sort -u | wc -l
#   18 = el catálogo sale de Postgres (repo.ts ya no importa src/data/)
```

---

## En una frase

El catálogo se sirve de Postgres **en producción**, hay registro y acceso por
código de seis dígitos, y existe un panel de administración para aprobar
proveedores. Falta el correo —sin él el registro no sirve para gente real— y que
alguien sea admin.

---

## Lo que ya está

| | Estado |
|---|---|
| Sitio navegable, identidad visual, interacción táctil, contraste AA | ✅ en producción |
| Prospector de proveedores (RUES → Excel) | ✅ |
| Proyecto de Supabase | ✅ ref `mgsrzlqellphmfbhpdoj`, región `us-east-2` |
| `0001_init.sql`, `0002_auth.sql`, `0003_busqueda.sql` | ✅ **aplicadas**, inmutables |
| `scripts/seed.mts` — catálogo sembrado | ✅ idempotente |
| `src/lib/repo.ts` contra Postgres | ✅ **Bloque 1 cerrado** |
| Registro y acceso por código (`/entrar`, `/registro`) | ✅ **Bloque 2**, falta el correo |
| Panel de administración (`/admin`) | ✅ **Bloque 3**, falta que alguien sea admin |
| Vercel Production configurado y verificado | ✅ `v0.3.0`, **https://regenera-market.vercel.app** |
| Vercel Preview | ❌ faltan las tres de Supabase |
| Panel de proveedor | ❌ **Bloque 4, sin empezar** |

---

## Lo que falta, y quién puede hacerlo

### 🔴 Solo Ivan (`UniqueColombia`)

**1. SMTP de Google Workspace.** Authentication → SMTP Settings, con contraseña
de aplicación de una cuenta `@uniquecolombia` (exige verificación en dos pasos
activa). Remitente tipo `no-responder@uniquecolombia.com`, nombre visible
«Seregenera».

**Sin esto el registro no sirve para gente real.** El enviador gratuito de
Supabase está limitado a unos pocos correos por hora y su propia documentación lo
declara solo para pruebas: el segundo que se registre no recibe el código. El
límite exacto lo dice el panel (*Authentication → Rate Limits*).

Prueba de que quedó: Authentication → Users → *Invite user* a un correo real.

**2. Integración de Supabase con GitHub.** Jesús es colaborador con permiso
`write`, no `admin`, así que al seleccionar el repositorio no le aparece
`regenera-market`. **No bloquea nada:** sirve para branching de base por PR, que
además es de plan pago.

**3. `bash scripts/politica-de-ramas.sh`.** Requiere admin. Comprobado el
2026-09-05: `admin: false` para `seiler18` y la protección sigue sin aplicarse.
Lo único que impone es que no se pueda borrar `main`.

```bash
gh api repos/UniqueColombia/regenera-market/branches/main/protection >/dev/null 2>&1 \
  && echo "aplicada" || echo "SIN aplicar"
```

### 🟠 Cualquiera con acceso a Vercel

**4. Las tres variables de Supabase en el entorno *Preview*.** Las de Production
ya están (release `v0.3.0`). **No bloquea producción:** lo que hace es que los
despliegues de preview de cada PR compilen verde y luego fallen en runtime, o
sea que las previews no sirven para revisar nada que toque datos.

Se hace en el panel, editando cada una de las tres y marcando *Preview* además de
Production. `NEXT_PUBLIC_SITE_URL` se queda solo en Production. Ver arriba por
qué el CLI no sirve para esto.

### 🟡 Cualquiera, una sola vez

**5. Darse de alta como administradores.** Nadie es admin todavía, y **eso es
correcto por diseño**: la política `user_roles_admin_write` solo deja escribir
roles a quien ya es admin, y no hay ninguno. El arranque es manual.

Primero los dos se registran **por la aplicación**, en `/registro`, para que
exista la fila en `auth.users`. Después, una vez, desde el SQL Editor:

```sql
insert into user_roles (user_id, role)
select id, 'admin' from auth.users
 where email in ('<correo de Ivan>', '<correo de Jesús>')
on conflict do nothing;
```

Los correos **no se escriben en este archivo**: el repositorio es público.

Comprobación: entrar en `/admin`. Si redirige a la portada, el rol no quedó.

**6. Rotar la contraseña de la base.** Settings → Database → *Reset database
password*. La que se usó para aplicar las migraciones pasó por un chat.

---

## Y después: el Bloque 4

El panel de proveedor. Es el mismo patrón que `/admin` aplicado al otro rol, y
`docs/BETA.md` lo detalla.

**Tiene un cabo suelto que hay que resolver ahí:** hoy nadie se convierte en
`provider`. Aprobar un proveedor desde `/admin` cambia su `status`, pero no crea
la fila en `provider_members` que enlaza a una persona con una empresa, ni le da
el rol. Los 13 proveedores sembrados no tienen dueño humano. El Bloque 4 tiene
que decidir cómo se hace ese enlace: probablemente la postulación de `/vender`
deba guardar quién postuló, y la aprobación crear `provider_members` y el rol.

---

## Trampas vigentes

- **Las plantillas de correo de Supabase no mandan el código si no se lo pides.**
  Las de fábrica solo traen `{{ .ConfirmationURL }}`: llega un enlace y la
  aplicación pide seis dígitos. El que los renderiza es `{{ .Token }}`, y hay que
  ponerlo en **dos** plantillas — *Magic Link* para quien ya tiene cuenta y
  *Confirm signup* para quien se registra por primera vez; `signInWithOtp` usa una
  u otra según exista el usuario, y arreglar solo una deja la mitad rota.
- **`{{ .ConfirmationURL }}` no pasa por `/auth/callback`.** Apunta al
  `/auth/v1/verify` de Supabase, que devuelve al *Site URL* con el token en el
  fragmento `#`, y un fragmento no llega al servidor. El enlace del correo tiene
  que ser
  `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email`.
- **`middleware.ts` no existe aquí, es `src/proxy.ts`.** Next 16 deprecó esa
  convención. Cualquier tutorial de Supabase que encuentres crea `middleware.ts`
  porque está escrito para Next 15.
- **`0001`, `0002` y `0003` son inmutables.** Ya corrieron contra la base. Todo
  cambio posterior es `0004_`.
- **`unaccent` es `stable` y una columna generada exige `immutable`.** Por eso
  existe `public.sin_tildes()` en `0003`, con el diccionario fijado por
  `::regdictionary`. Si tocas la búsqueda, esa es la trampa.
- **`public.sin_tildes()` y `normalize()` de `repo.ts` tienen que hacer lo
  mismo.** Una alimenta la columna indexada y la otra normaliza lo que escribe el
  usuario; si divergen, la búsqueda deja de encontrar cosas que sí están.
- **Las escrituras de administración van con el cliente de sesión, no con la
  clave de servicio.** Si se cambian a `admin.ts`, el permiso pasa a concederlo el
  código en vez de RLS, y cualquier fallo en `requireAdmin` se vuelve escritura
  libre.
- **RLS no da error cuando niega: devuelve cero filas.** Toda escritura tiene que
  comprobar el resultado, o un intento denegado se ve como éxito.
- **El plan gratuito de Supabase pausa los proyectos inactivos.** Si se detiene
  tres semanas y luego se le pasa la URL a un hotel, se encuentra una página
  muerta.
- **Vercel Hobby es para proyectos no comerciales.** El día que entre dinero real
  son 20 USD/mes de Pro.
- **`hairline` y `control` no son intercambiables.** El primero separa
  superficies; el segundo dibuja el borde de un control, donde WCAG pide 3:1.
- **La longitud del código de acceso vive en el panel, no en el código.**
  Authentication → Sign In / Providers → Email → *Email OTP Length*, entre 6 y
  10. Está en **6**, que es lo que dice la pantalla de `/entrar`. La validación
  acepta el rango entero a propósito: si alguien sube ese ajuste y el código
  exigiera seis exactos, **nadie podría entrar** y el mensaje de error diría que
  el código está mal cuando el correcto es el que tiene delante. Ya pasó con el
  panel en 8.

---

## Comprobar el estado sin preguntarle a nadie

```bash
git fetch origin --prune && git log --oneline origin/main -5
git tag --points-at origin/main          # vacío = release sin etiquetar
gh pr list                               # qué hay abierto
ls .claude/hitos/                        # la historia; lo último al final
grep -rn "@/data/" src/lib/repo.ts       # vacío = el Bloque 1 terminó
```

Y contra la aplicación corriendo:

```bash
npm run build && npm run start
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/catalogo   # 200 = la base responde
curl -s -o /dev/null -w "%{redirect_url}\n" localhost:3000/admin   # /entrar = el guardia funciona
```
