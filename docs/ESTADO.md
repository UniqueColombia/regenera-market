# Dónde estamos

**Este archivo responde a «¿en qué vamos?».** Es el único que dice qué está a
medias *ahora mismo* y qué sigue. Si acabas de hacer `git pull` y quieres saber
qué hacer, empieza aquí y no en el ROADMAP.

- **Corte:** 2026-09-05
- **Producción:** `v0.2.1` en `main`
- **Fase del roadmap:** 0 cerrada. En curso: **Bloque 0** de `docs/BETA.md`.

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

## En una frase

El sitio está desplegado y navegable, con el catálogo todavía **en memoria**
(`src/data/`). La base de datos ya existe pero **el esquema no está aplicado**.
El código que conecta con ella está escrito y a la espera.

---

## Lo que ya está

| | Estado |
|---|---|
| Sitio navegable: catálogo, carrito, checkout manual | ✅ en producción |
| Identidad visual, marca, 28 imágenes | ✅ |
| Interacción táctil y contraste AA | ✅ `v0.2.1` |
| Prospector de proveedores (RUES → Excel) | ✅ |
| Clientes de Supabase, `src/proxy.ts`, `src/lib/auth.ts` | ✅ escritos, **inertes** |
| `0001_init.sql` (14 tablas, 37 políticas) y `0002_auth.sql` | ✅ escritos, **sin aplicar** |
| Proyecto de Supabase creado | ✅ ref `mgsrzlqellphmfbhpdoj`, región `us-east-2` |

«Inerte» quiere decir que sin `NEXT_PUBLIC_SUPABASE_URL` el proxy deja pasar la
petición sin hacer nada y ningún cliente se construye. **La propiedad de
`docs/DEPLOY.md` sigue viva: `npm run dev` con `.env.local` vacío levanta una
app navegable.** No la rompas.

---

## Lo que falta, y quién puede hacerlo

Ordenado por lo que bloquea a más cosas.

### 🔴 Solo Ivan (`UniqueColombia`)

**1. Integración de Supabase con GitHub / Vercel.** Jesús es colaborador con
permiso `write`, no `admin`: al seleccionar el repositorio desde Supabase,
`regenera-market` no le aparece en la lista. Requiere admin sobre el repositorio.

> **Esto NO bloquea el Bloque 0.** Esa integración sirve para *branching* de base
> por PR, que además es función de plan pago. El esquema se aplica sin ella.
> Hazla cuando quieras, no cuando puedas.

**2. SMTP de Google Workspace.** Authentication → SMTP Settings, con una
contraseña de aplicación de una cuenta `@uniquecolombia` (exige verificación en
dos pasos activa en esa cuenta). Remitente tipo `no-responder@uniquecolombia.com`
con nombre visible «Seregenera».

Por qué solo Ivan: la cuenta de Workspace es suya. Por qué importa: el enviador
gratuito de Supabase está limitado a unos pocos correos por hora y su propia
documentación lo declara **solo para pruebas** — el segundo usuario que se
registre no recibe el código. El límite exacto lo dice el panel
(*Authentication → Rate Limits*), no este archivo.

Prueba de que quedó: Authentication → Users → *Invite user* a un correo real. Si
llega, resuelto. **Bloquea el Bloque 2 para gente real, no el desarrollo.**

**3. `bash scripts/politica-de-ramas.sh`.** Requiere admin. Comprobado el
2026-09-05: `seiler18` tiene `admin: false` y la protección sigue sin aplicarse.

```bash
gh api repos/UniqueColombia/regenera-market/branches/main/protection >/dev/null 2>&1 \
  && echo "aplicada" || echo "SIN aplicar"
```

No bloquea nada. Lo único que impone es que no se pueda borrar `main`.

### 🟠 Roto ahora mismo — cualquiera con acceso a Vercel

**4. Falta `NEXT_PUBLIC_SITE_URL` en el entorno Production.** Se comprueba en un
comando:

```bash
curl -s <url-de-produccion> | grep -o '<meta property="og:image"[^>]*>'
```

El 2026-09-05 respondía `content="http://localhost:3000/opengraph-image.jpg…"`.
Efecto real: cualquier enlace de Seregenera compartido en WhatsApp o LinkedIn
**sale sin imagen**. El código ya está arreglado — `src/app/layout.tsx` lee la
variable; lo que falta es ponerla.

En Vercel → Settings → Environment Variables:

| Variable | Valor | Entorno |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | la URL de producción | Production |
| `NEXT_PUBLIC_SITE_URL` | la URL de la preview estable de `staging` | Preview |

Redespliega y repite el `curl`. Si deja de decir `localhost`, quedó.

**5. Igualar la versión de Node.** El CI usa `node-version: 22`
(`.github/workflows/ci.yml`). Si el proyecto en Vercel usa otra, el CI pasa en
verde y producción falla.

### 🟡 El siguiente paso real — cualquiera

**6. Aplicar el esquema.** Es lo único que separa al proyecto del Bloque 1.

SQL Editor del proyecto → pegar **entero** `supabase/migrations/0001_init.sql` →
ejecutar. Después, **en otra ejecución**, `supabase/migrations/0002_auth.sql`.
Ese orden importa: el segundo referencia tablas que crea el primero.

Debe correr sin un solo error. **Si algo falla, no lo parchees en el panel:** se
corrige en el archivo, se descarta el proyecto y se reaplica limpio. Una base
cuyo estado no está en el repositorio es una base que nadie puede reconstruir.

Criterio de salida — deben aparecer **14 tablas**:

```sql
select table_name from information_schema.tables
 where table_schema = 'public' order by 1;
-- certifications, listing_availability, listings, order_items, orders,
-- profiles, provider_certifications, provider_members, providers,
-- quotation_items, quotations, reviews, sustainability_assessments, user_roles
```

Y el trigger que agrega `0002`:

```sql
select tgname from pg_trigger where tgname = 'on_auth_user_created';
```

**Desde que `0001` corra bien, ese archivo es inmutable.** Todo cambio posterior
es `0003_`. Ver la skill `supabase-schema`.

**7. URLs de redirección.** Authentication → URL Configuration: agregar
`http://localhost:3000` y la URL de la preview de `staging`. Si falta, el enlace
del correo devuelve al usuario a un sitio equivocado y el registro parece roto.

**8. Las claves.** Settings → API. En local, `cp .env.example .env.local` y
rellenar. En Vercel, las mismas tres en el entorno Preview.

> `SUPABASE_SERVICE_ROLE_KEY` **jamás** lleva prefijo `NEXT_PUBLIC_`. El job
> `secretos` del CI falla si aparece, y hace bien: esa clave en el bundle del
> navegador es acceso total a la base saltándose RLS.

---

## Y después

Con el esquema aplicado y las claves puestas arranca el **Bloque 1** de
`docs/BETA.md`: `scripts/seed.ts` y reemplazar `src/lib/repo.ts` función por
función, en el orden que ese documento fija. Es el bloque que resuelve que
cambiar un dato dispare un deploy — con los datos en Postgres, editar un
proveedor pasa a ser un `UPDATE` y Vercel ni se entera.

Dependencias entre bloques: `0 → 1 → 2 → (3 ∥ 4) → 5`. El 3 (panel de
administración) y el 4 (panel de proveedor) son el mismo patrón sobre dos roles y
se pueden repartir entre los dos en paralelo.

---

## Trampas vigentes

- **`middleware.ts` no existe aquí, es `src/proxy.ts`.** Next 16 deprecó esa
  convención y la renombró. Cualquier tutorial de Supabase que encuentres crea
  `middleware.ts` porque está escrito para Next 15.
- **El plan gratuito de Supabase pausa los proyectos inactivos.** Si el proyecto
  se detiene tres semanas y luego se le pasa la URL a un hotel, se encuentra una
  página muerta. Si va a haber una pausa larga, avisarlo.
- **Vercel Hobby es para proyectos no comerciales.** Mientras la beta sea
  gratuita y no se cobre comisión, pasa. El día que entre dinero real son 20
  USD/mes de Vercel Pro. No es urgente; es previsible.
- **Nadie es admin en la aplicación todavía, y es correcto por diseño.** La
  política `user_roles_admin_write` solo deja escribir roles a quien ya es admin,
  y no hay ninguno. El arranque es manual, una sola vez, desde el SQL Editor, y
  va en el Bloque 2 — después de que los dos se registren por la aplicación.
- **`hairline` y `control` no son intercambiables.** El primero separa
  superficies; el segundo dibuja el borde de un control, donde WCAG pide 3:1.
  Ver la skill `diseno-visual`.

---

## Comprobar el estado sin preguntarle a nadie

```bash
git fetch origin --prune && git log --oneline origin/main -5
git tag --points-at origin/main          # vacío = release sin etiquetar
gh pr list                               # qué hay abierto
ls .claude/hitos/                        # la historia; lo último al final
grep -rn "@/data/" src/lib/repo.ts       # vacío = el Bloque 1 terminó
```
