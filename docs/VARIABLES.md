# Variables de entorno

**Este es el único sitio donde se documentan las variables de entorno de
Seregenera.** No hay `.env.example`: se quitó del repositorio el 2026-10-16
porque el `.env` de cada máquina lleva claves reales (Supabase, BOLD, SMTP,
Hostinger) y ningún archivo `.env*` entra al repo (lo vigila el job `secretos`
del CI).

Aquí van los **nombres**, para qué sirve cada una y de dónde sale. **Nunca los
valores**: el repositorio es público.

## Dónde vive cada valor

| Dónde | Qué va ahí |
|---|---|
| `.env` en la raíz del repo (cada PC) | Lo que necesita esa máquina. Next.js lo lee solo; Git lo ignora. **No viaja con `git pull`**: en un PC nuevo se recrea a mano con esta lista |
| *Variables de entorno* de la Web App en Hostinger (hPanel → `seregenera.com`) | **Producción** desde el 2026-10-16. Se cambian en el panel: la operación del MCP reemplaza el juego entero (ver la skill `desplegar-hostinger`) |
| *Environment Variables* de Vercel | El respaldo (`regenera-market.vercel.app`), mientras siga encendido |
| Gestor de contraseñas | La copia de seguridad de todos los valores. Sin ella, perder un PC es perder las llaves |

Si una variable falta, la aplicación **degrada sola**: con todo vacío,
`npm run dev` levanta una app navegable (ver `docs/DEPLOY.md`).

## Cómo documentar una variable nueva

En **el mismo commit** que la introduce, una fila en la tabla de abajo con: qué
es, dónde se obtiene, y qué pasa si está vacía. Nunca el valor. Si el nombre
empieza por `NEXT_PUBLIC_`, va a estar en el navegador: **jamás** un secreto (el
CI falla si aparece una con `SERVICE_ROLE`, `PRIVATE` o `SECRET`).

## Las variables

| Variable | ¿Obligatoria? | Para qué / de dónde sale |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Sí (para datos reales) | URL de la API de Supabase: Supabase → Settings → API. **Se graba al compilar** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sí | Llave pública (anon/publishable), mismo panel. Es pública por diseño: la seguridad la dan las políticas RLS de `supabase/migrations/`. **Se graba al compilar** |
| `SUPABASE_SERVICE_ROLE_KEY` | Sí | Llave de servicio. **Nunca** al navegador. Solo tareas de servidor que saltan RLS: importar el catálogo, confirmar pagos, asignar roles |
| `NEXT_PUBLIC_SITE_URL` | Sí | Dominio público (`https://seregenera.com`; en local, `http://localhost:3000`). Lo usan el sitemap, `robots`, el SEO, los correos y el webhook. **Se graba al compilar** |
| `BOLD_LLAVE_IDENTIDAD` | Para pagar en línea | panel.bold.co → Integraciones → Llaves de integración, sección «Botón de pagos». Pública por diseño (va en el botón) pero se lee en el servidor |
| `BOLD_LLAVE_SECRETA` | Para pagar en línea | Mismo panel. Firma cada cobro y verifica el webhook. **Nunca** con prefijo público. Con las dos llaves, el pedido muestra «Paga en línea»; sin ellas, solo Bre-B y transferencia, confirmadas a mano en `/admin/ordenes`. El webhook se configura en BOLD: `https://<dominio>/api/webhooks/bold` |
| `BOLD_MODO_PRUEBAS` | **Vacía en producción** | `1` verifica el webhook con la llave vacía, como pide BOLD en pruebas. `src/lib/payments.ts` la ignora **solo si `VERCEL_ENV` es `production`**: fuera de Vercel, si queda en `1`, cualquiera puede firmar un aviso de pago falso |
| `APP_ENV` | Tras reemplazar `VERCEL_ENV` | Reservada: `production` en producción. Ver `ROADMAP-MIGRACION.md`, Fase 0, paso 7 |
| `PAGO_LLAVE_BREB` | Para pagar sin pasarela | La llave de la cuenta (celular, correo, documento o alfanumérica). Va aquí y no en el código porque una cuenta publicada en GitHub es materia prima de una página de pago falsa. Vacía, el pedido dice a qué correo escribir |
| `PAGO_BANCO`, `PAGO_TIPO_CUENTA`, `PAGO_NUMERO_CUENTA`, `PAGO_NIT` | Para pagar por transferencia | Datos de la cuenta bancaria. Mismo motivo |
| `PAGO_TITULAR` | Opcional | Si se deja vacío, la razón social de `src/lib/legal.ts` |
| `PAGO_CORREO_COMPROBANTES` | Opcional | Si se deja vacío, el correo de contacto |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD` | Para los correos de la aplicación | Desde el 2026-10-16, el buzón **`info@seregenera.com`** del correo de Hostinger: `SMTP_HOST=smtp.hostinger.com`, `SMTP_USER=info@seregenera.com` y la contraseña del buzón (hPanel → Correos electrónicos; solo en el gestor y en los paneles). Son los correos que manda la **app** (bienvenida, pedidos, postulaciones, ofertas). Los de **acceso** los manda Supabase con su propio SMTP (Authentication → SMTP Settings), con las mismas credenciales. Sin ellas, el correo se escribe en la consola del servidor y la acción sigue. Ver `docs/CORREOS.md` |
| `SMTP_PORT` | Opcional | Por defecto `587`. En producción, `465` (TLS desde el saludo, el que recomienda Hostinger). En el PC de Jesús el 465 no funciona porque Avast intercepta el SMTP: allí, `587` y arrancar con `NODE_OPTIONS=--use-system-ca` |
| `SMTP_REMITENTE` | Opcional | `Seregenera <info@seregenera.com>`. Tiene que ser el buzón que autentica: los servidores de correo reescriben o rechazan cualquier otro `From`. Sin él se usa `SMTP_USER` |
| `IS_WEBPACK_TEST` | **Sobra; borrarla** | Se puso en Hostinger el 2026-10-16 para forzar webpack antes de que `npm run build` llevara `--webpack`. Es un flag interno de Next, pensado para sus pruebas. Desde `v0.11.1` no hace falta, y tenerla junto al `--webpack` no da conflicto |
| `SESION_SECRETO` | Opcional (recomendada) | Firma la cookie del reloj de inactividad (`src/lib/inactividad.ts`). Generarlo: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Sin él, la sesión sigue caducando a las 48 h pero la cookie va sin firmar y se puede falsificar. Ponerlo o cambiarlo **cierra la sesión de todos una vez** |
| `ALMACEN_URL` | Futuro | Reservada para un almacén de imágenes propio (`src/lib/almacenamiento.ts`) |
| `MELI_CLIENT_ID`, `MELI_CLIENT_SECRET` | Opcional | Solo para `scripts/prospectar.mts`; nada en `src/` las lee. Se registra una app gratis en developers.mercadolibre.com.co (flujo `client_credentials`). Ver la skill `prospeccion-proveedores`. Vacías, el prospector salta la señal comercial y avisa |
| `SUPABASE_ACCESS_TOKEN` | Opcional | Token personal de Supabase (supabase.com/dashboard/account/tokens), solo para administrar la base desde una máquina (migraciones, consultas, `npx supabase`, la API de administración). **No** lo usa la aplicación y **no va en Hostinger**. Es una llave de la cuenta entera, no de este proyecto. Caduca o se revoca: el 2026-10-16 el del PC de Jesús respondía 401. Lo usa `scripts/plantillas-supabase.mts` para subir las plantillas de correo (`docs/CORREOS.md`, parte B) |
| `HOSTINGER_API_KEY` | Opcional | Llave de la API de Hostinger (hPanel → perfil → API), la misma que usa el MCP. La lee `scripts/desplegar.mts` para compilar y comprobar. Da acceso a la cuenta de hosting: solo en el `.env`, **nunca** en las variables de la Web App |
| `HOSTINGER_SSH_HOST`, `HOSTINGER_SSH_PORT` | Opcional | Solo para `scripts/desplegar.mts`, que sube el zip por SFTP. Salen de hPanel → `seregenera.com` → Avanzado → Acceso SSH (el puerto suele ser 65002). No son secretos, pero no van al repositorio: el usuario de SSH es el de hosting, y el repo es público. **No** van en Hostinger. Junto con la llave `~/.ssh/seregenera_hostinger` (o la ruta en `HOSTINGER_SSH_KEY`); cómo se crea, en la skill `desplegar-hostinger` |
| `PRUEBAS_PG_URL` | Opcional | Solo para `npm run test:base` contra un Postgres propio (`docs/PORTABILIDAD.md`) |
| `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD` | Solo para el experimento MySQL | La base de pruebas `…_sgpruebas` de la cuenta de hosting (hPanel → Bases de datos). Desde el PC, `MYSQL_HOST` es el host remoto que muestra hPanel y la IP del PC tiene que estar autorizada en «MySQL remoto». Desde la app en Hostinger, `127.0.0.1`. La clave se generó al crear la base y solo está en el `.env`. Ver el hito `2026-10-17-experimento-mysql-etapas-0-y-1.md` |
| `FUENTE_CATALOGO` | Experimento; **vacía en producción** | `mysql` hace que `/catalogo` lea del espejo en MySQL (`src/lib/mysql/`) en vez de Supabase. Vacía o con cualquier otro valor, el catálogo lee de Supabase como siempre |

## Lo que NO va en el `.env` del proyecto

- **Usuario y contraseña de hPanel (Hostinger).** La aplicación no los usa. Quien
  los tenga controla el dominio, el hosting y la facturación: van solo en el
  gestor de contraseñas. Para operar Hostinger desde Claude Code se usa el MCP
  oficial, que inicia sesión por el navegador.
- **Las variables de Supabase autoalojado** (`POSTGRES_PASSWORD`, `JWT_SECRET`,
  `DASHBOARD_*`…), si algún día hay VPS: viven en el `.env` de ese servidor.

## Recrear el `.env` en un PC nuevo

1. Copiar a un archivo `.env` en la raíz las variables de la tabla que se vayan a
   usar (los nombres, con `=` y sin valor).
2. Pegar los valores desde el gestor de contraseñas o desde cada panel (Supabase,
   BOLD, el correo de Hostinger).
3. Comprobar que Git no lo ve: `git status` no debe listarlo (`.env*` está en el
   `.gitignore`).

La plantilla anterior, con todos sus comentarios, sigue en el historial:
`git show c24b496:.env.example`.
