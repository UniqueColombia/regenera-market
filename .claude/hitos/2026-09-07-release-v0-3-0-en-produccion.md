# El release `v0.3.0` está en producción: Vercel configurado y verificado

- **Fecha:** 2026-09-07
- **Autor:** Ivan Duarte (`UniqueColombia`)
- **Rama / PR:** `staging` → #34 (release), tag `v0.3.0`
- **Fase del roadmap:** 1 y 2 — cierra los Bloques 1, 2 y 3 de `docs/BETA.md`

## Qué se hizo

El trabajo del PR #31 —catálogo en Postgres, identidad y panel de
administración, descrito en
[2026-09-05-catalogo-en-postgres-identidad-y-admin.md](2026-09-05-catalogo-en-postgres-identidad-y-admin.md)—
**salió a producción**. Lo que faltaba no era código: eran las cuatro variables
de entorno de Vercel, sin las cuales la aplicación compila verde y revienta en
runtime.

Se configuró el entorno **Production** de Vercel, se mergeó el PR #34 con
`--merge`, Vercel desplegó `main` solo, y se etiquetó `v0.3.0` **después** de
comprobar que producción respondía.

**https://regenera-market.vercel.app** sirve el catálogo desde Postgres.

También se configuró Supabase → Authentication → URL Configuration con el
dominio de producción, sin lo cual el acceso por código de seis dígitos
funcionaría en local y se rompería en producción.

## Por qué así

**Las variables van antes del merge, no después.** Producción se despliega sola
cuando algo entra a `main`; si las variables no están puestas *antes*, hay una
ventana en la que el sitio está caído. El orden fue: configurar → mergear →
verificar → etiquetar.

**Se descartó `vercel --prod` desde el CLI.** Habría subido el contenido de la
carpeta de trabajo —que estaba en `staging`— directo a producción, saltándose el
PR, el merge y el tag. Vercel ya está conectado a GitHub: producción se despliega
al mergear, y esa es la única vía que deja rastro.

**El tag se puso después de verificar, no antes.** Un tag sobre un release roto
es peor que no tenerlo: convierte en «versión» algo que no lo es.

**Se descartó cargar las variables por CLI a mitad de camino.** `vercel env add`
guarda las comillas del `.env.local` **literalmente**, así que un
`NEXT_PUBLIC_SUPABASE_URL="https://…"` queda almacenado *con* las comillas y
ninguna petición a Supabase funciona — fallando en runtime, con el CI en verde.
Además `vercel env add <nombre> preview` abre un prompt interactivo (`? Git
branch?`) que no se puede contestar cuando el valor llega por tubería. El panel
web no tiene ninguno de los dos problemas.

**El agente nunca leyó `.env.local`.** `.claude/settings.json` lo deniega
(`Read(./.env.local)`) y la denegación se respetó: los valores fueron del disco
de Ivan a Vercel sin pasar por la conversación. Es la razón por la que este hito
puede existir en un repositorio público.

## Qué quedó pendiente

- **El SMTP de Google Workspace.** Es lo que de verdad frena la beta. El
  enviador por defecto de Supabase está limitado a unos pocos correos por hora y
  su documentación lo declara solo para pruebas: con más de un puñado de
  registros, el segundo usuario no recibe el código. Detalle en `docs/ESTADO.md`.
- **Las variables del entorno *Preview* de Vercel.** Solo las tres de Supabase;
  `NEXT_PUBLIC_SITE_URL` se queda en Production. No bloquea producción: hace que
  los despliegues de preview de cada PR fallen en runtime.
- **Nadie es admin todavía.** Correcto por diseño —
  `user_roles_admin_write` solo deja asignar roles a quien ya es admin — pero
  significa que `/admin` redirige a `/entrar` incluso con sesión. El arranque
  manual está en `docs/ESTADO.md`.
- **El registro de punta a punta sin probar.** Exige recibir un correo real.
- **La revisión visual de `/entrar`, `/registro` y `/admin`.** Nadie las ha
  mirado con los ojos, solo con `curl`.
- **Dos observaciones de la revisión del #31**, ninguna bloqueante, anotadas en
  la aprobación del PR: `provider_certs_public_read` abre las certificaciones
  verificadas de proveedores que no están aprobados (y la tabla lleva
  `document_url`), y `getRelatedListings` interpola `listing.category` en el
  `or()` de PostgREST sin pasar por `patron()`.

## Qué se rompe si tocas esto

- **`main` es producción de verdad desde hoy.** Cualquier merge a `main`
  despliega. No es un branch de archivo.
- **Las cuatro variables de Production no son opcionales.** Borrar o renombrar
  cualquiera de `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` o `SUPABASE_SERVICE_ROLE_KEY` tumba el sitio
  en el siguiente despliegue, sin que el CI diga nada.
- **`NEXT_PUBLIC_SITE_URL` es por entorno.** En Production es el dominio real;
  en `.env.local` es `http://localhost:3000`. Copiar el de local a Vercel deja
  el `og:image` apuntando a localhost.
- **Al agregar una variable en Vercel, los despliegues existentes no la toman.**
  Hace falta un build nuevo.
- **Supabase → Authentication → URL Configuration** tiene que incluir el dominio
  de producción. Es independiente de `NEXT_PUBLIC_SITE_URL`: si ahí solo está
  `localhost`, el código de seis dígitos falla en producción y en ningún log
  queda claro por qué.
- **El plan gratuito de Supabase pausa proyectos inactivos.** Ahora que hay una
  URL pública que se puede compartir, eso deja de ser teórico.

## Verificación

Contra `https://regenera-market.vercel.app` después del despliegue. Las seis
pruebas coinciden una a una con la tabla que el PR #31 declaró contra la base:

| Prueba | Esperado | Obtenido |
|---|---|---|
| `/`, `/catalogo`, `/proveedores` | 200 | 200 |
| Catálogo sin filtros | 18 ofertas | 18 |
| `?q=amazonia` / `?q=Amazonía` | 1 y 1, la misma | 1 y 1 |
| `?q=aromas` (nombre de proveedor) | 2 | 2 |
| `?tier=semilla` / `?tier=bosque` | 18 / 6, acumulativo | 18 / 6 |
| `/admin` sin sesión | 307 a `/entrar` | 307 a `/entrar` |
| `/auth/callback?next=https://ejemplo.com` | se queda en el dominio | se queda |
| `og:image` | el dominio real | `https://regenera-market.vercel.app/…` |

**Las 18 ofertas son la prueba de que las variables quedaron bien.** `repo.ts` ya
no importa `src/data/`, así que ese número solo puede venir de Postgres; si las
credenciales estuvieran mal —o guardadas con comillas— `/catalogo` sería un 500.

Antes de aprobar el #31 se corrió en local, en este orden: `npm run build`,
`npx tsc --noEmit`, `npx eslint .`. Los tres en limpio.

Del lado del repositorio:

```bash
git log --oneline origin/main -1      # 3993fa6 Merge pull request #34
git tag --points-at origin/main       # v0.3.0
```
