# Dónde estamos

**Este archivo responde a «¿en qué vamos?».** Es el único que dice qué está a
medias *ahora mismo* y qué sigue. Si acabas de hacer `git pull` y quieres saber
qué hacer, empieza aquí y no en el ROADMAP.

- **Corte:** 2026-09-05
- **Producción:** `v0.2.4` en `main`
- **Fase del roadmap:** 0 cerrada. **Bloques 0, 1, 2 y 3 de `docs/BETA.md`
  implementados**, a la espera de las variables de entorno en Vercel.

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

## 🔴 Lo primero: producción se cae sin las variables de Supabase

Desde que `src/lib/repo.ts` consulta Postgres, **la aplicación ya no funciona sin
credenciales.** Es un cambio irreversible de propiedad: antes el catálogo vivía
en `src/data/` y el sitio se levantaba con `.env.local` vacío; ahora no.

Falla de forma ruidosa y con un mensaje que dice qué hacer, que es lo que se
quería — un sitio que sirviera datos de demostración en silencio sería peor.

**Ningún merge a `main` debe ocurrir antes de que estas cuatro variables estén en
el entorno Production de Vercel.** El build del CI sí pasa sin ellas —todas las
páginas son dinámicas, así que nada se renderiza en compilación—, o sea que el
verde del CI **no** te protege de esto.

### Los comandos, para hacerlo de una

Con el CLI de Vercel, desde la raíz del repositorio:

```bash
vercel login                    # con la cuenta que tenga acceso al proyecto
vercel link                     # elegir uniquecolombias-projects/regenera-market
```

Los valores salen del panel de Supabase (Settings → API) y del propio Vercel.
`vercel env add` lee el valor de la entrada estándar, así que se puede encadenar:

```bash
# --- Production ---
echo "https://<dominio-de-produccion>"          | vercel env add NEXT_PUBLIC_SITE_URL production
echo "https://mgsrzlqellphmfbhpdoj.supabase.co" | vercel env add NEXT_PUBLIC_SUPABASE_URL production
echo "<clave anon / publishable>"               | vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
echo "<clave service_role / secret>"            | vercel env add SUPABASE_SERVICE_ROLE_KEY production

# --- Preview (la URL es la de la preview estable de staging) ---
echo "https://<preview-de-staging>"             | vercel env add NEXT_PUBLIC_SITE_URL preview
echo "https://mgsrzlqellphmfbhpdoj.supabase.co" | vercel env add NEXT_PUBLIC_SUPABASE_URL preview
echo "<clave anon / publishable>"               | vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY preview
echo "<clave service_role / secret>"            | vercel env add SUPABASE_SERVICE_ROLE_KEY preview

vercel --prod                   # redesplegar para que las tome
```

> `SUPABASE_SERVICE_ROLE_KEY` **jamás** lleva prefijo `NEXT_PUBLIC_`. El job
> `secretos` del CI falla si aparece en el código, y hace bien: esa clave en el
> bundle del navegador es acceso total a la base saltándose RLS.

Se comprueba así, y las tres líneas tienen que dar lo esperado:

```bash
vercel env ls                                            # las cuatro, en los dos entornos
curl -s <url-de-produccion> | grep -o '<meta property="og:image"[^>]*>'
#   si dice localhost:3000, falta NEXT_PUBLIC_SITE_URL
curl -s -o /dev/null -w "%{http_code}\n" <url-de-produccion>/catalogo
#   200 = la base responde; 500 = faltan las claves de Supabase
```

**De paso, mira Settings → Node.js Version.** El CI usa 22
(`.github/workflows/ci.yml`); si no coinciden, el CI pasa en verde y producción
falla.

---

## En una frase

El catálogo se sirve de Postgres, hay registro y acceso por código de seis
dígitos, y existe un panel de administración para aprobar proveedores. Falta
configurar Vercel, el correo, y que alguien sea admin.

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

**4. Las cuatro variables de entorno.** Ver el bloque rojo de arriba. Es lo que
bloquea el merge a `main`.

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
