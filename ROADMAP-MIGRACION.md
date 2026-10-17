# Hoja de ruta: salir de Vercel y Supabase hacia Hostinger

**Qué es este archivo.** El paso a paso para que Seregenera deje de depender de
servicios gratuitos de terceros (Vercel Hobby, Supabase Free) y viva en lo que
ya tiene: **GitHub + Hostinger**.

> **Decisión vigente (Jesús, 2026-10-16): el plan de Ivan en Hostinger no incluye
> VPS** —es el hosting web con el dominio— **y por ahora no se puede costear uno.**
> Por eso **la ruta activa es la Vía B**. La **Vía A (VPS)** queda escrita completa
> para el día en que haya presupuesto; no se ejecuta hoy.

| | **Vía B — Hostinger Cloud (lo que hay hoy) — ACTIVA** | **Vía A — VPS en Hostinger — para cuando haya presupuesto** |
|---|---|---|
| Idea | La app en el plan Cloud; la base queda donde se pueda | Todo en un servidor propio: la app, Postgres y Supabase autoalojado |
| Base de datos | **B-1:** Supabase en la nube (puente) · **B-2:** MySQL (reescribir el backend) | **Postgres** (el esquema actual, sin tocar) |
| Código de la app | B-1 no cambia · **B-2 se reescribe** | **No cambia** (solo variables de entorno) |
| Costo adicional | B-1: US$0 (o Supabase Pro ≈ US$25/mes) · B-2: US$0 | VPS KVM 2 ≈ US$9/mes el primer período, ≈ US$15 al renovar |
| Esfuerzo | B-1: medio día · B-2: **semanas** | 1–2 días de montaje + mantenimiento mensual |
| Cuándo | **Ahora** | Cuando se pueda pagar el VPS |

**Recomendación:** ejecutar **B-1** (es barato, rápido y reversible) y quedarse ahí
hasta que haya presupuesto para un VPS: B-1 no cierra la puerta a la Vía A, y el
paso de una a otra no toca el código. **B-2 (MySQL) solo si ni B-1 es aceptable**
—es decir, si no se quiere depender de Supabase *en absoluto*—: es reescribir el
producto; leer la sección B-2 antes de decidir.

**Lo primero que hay que confirmar** (todo lo de la Vía B depende de ello): que el
plan de hosting de Ivan **incluya Node.js** (en hPanel → Sitios web debe existir
la opción *Web App*; solo la traen los planes Business y Cloud). Si no la trae, ver
«Si el plan no trae Node.js» en B1.1.

> ⚠️ **Este repositorio es público.** En este archivo no se escriben IPs de
> servidores, correos de personas, contraseñas, llaves ni tokens. Todo eso va en
> el `.env` de cada máquina (que no se versiona) o en un gestor de contraseñas.

- [0. Cómo está todo hoy](#0-cómo-está-todo-hoy-verificado-el-2026-10-16)
- [1. Fase 0 — preparación común a las dos vías](#1-fase-0--preparación-común-a-las-dos-vías)
- [2. Vía A — VPS con Supabase autoalojado](#2-vía-a--vps-con-supabase-autoalojado)
- [3. Vía B — Hostinger Cloud](#3-vía-b--hostinger-cloud)
- [4. Corte de dominio y vuelta atrás](#4-corte-de-dominio-y-vuelta-atrás)
- [5. Qué hacer al llegar al computador de la casa](#5-qué-hacer-al-llegar-al-computador-de-la-casa)
- [Anexo A — Variables de entorno](#anexo-a--variables-de-entorno)
- [Anexo B — Lista de pruebas de punta a punta](#anexo-b--lista-de-pruebas-de-punta-a-punta)
- [Anexo C — Fuentes](#anexo-c--fuentes)

---

## 0. Cómo está todo hoy (verificado el 2026-10-16)

Se revisó el panel de Hostinger (hPanel) en modo lectura, y el DNS público.

| Qué | Estado |
|---|---|
| Cuenta de Hostinger de Jesús | **Sin planes propios.** Ivan le **compartió los dominios** (Cuenta → Compartir cuenta). El hosting vive en la cuenta de Ivan |
| Dominio `seregenera.com` | Activo, **vence el 2027-07-23**, **autorrenovación apagada** (pedirle a Ivan que la active) |
| DNS | Servidores de nombres de Hostinger (`*.dns-parking.com`). `@` apunta a dos IP del hosting compartido; `www` es un CNAME al CDN de Hostinger (`*.cdn.hstgr.net`); **`MX` apunta a `mx1/mx2.hostinger.com`** (el correo del dominio) |
| Lo que sirve hoy `seregenera.com` | La **«Página por defecto»** de Hostinger (PHP 8.3). O sea: el sitio real todavía **no está** en Hostinger; sigue en Vercel |
| Qué plan tiene Ivan | **Sin VPS** (confirmado por Jesús el 2026-10-16): hosting web (se dijo «Cloud») más los dominios. Desde la cuenta de Jesús no se ve el detalle. **Por confirmar:** que incluya Node.js, que solo traen los planes **Business y Cloud** (no Premium) |
| Base de datos que trae ese plan | **Solo MySQL.** PostgreSQL en Hostinger **solo existe en VPS**, que no hay |
| Token de API de Hostinger | Se creó uno de prueba («Claude Code PC Jesus») que **nadie copió** (Hostinger lo muestra una sola vez). **Hay que borrarlo** en hPanel → API → Tokens |
| MCP de Hostinger | Configurado y **autenticado** en el PC del trabajo (`claude mcp add --scope user --transport http hostinger https://mcp.hostinger.com`, luego `/mcp` → *Authenticate*). Se repite una vez por máquina. Solo ve lo que ve la cuenta de Jesús (los dominios) |

**Por qué el dato de la base manda sobre todo lo demás.** El producto vive en
Postgres: 22 migraciones (9.100 líneas), 79 políticas RLS en 25 tablas, 97
funciones y 29 triggers, 131 usos de `jsonb`. Ver `docs/PORTABILIDAD.md`.
Cambiar a MySQL significa reescribirlo; quedarse en Postgres significa un VPS (que
hoy no hay) o dejar la base en un servicio de terceros (Supabase), que es B-1.

### Lo que depende de Vercel y no se nota

Al salir de Vercel hay que atender estas cuatro cosas; están repetidas en los
pasos donde corresponde:

1. **`BOLD_MODO_PRUEBAS` deja de estar protegida.** `src/lib/payments.ts` la
   ignora solo si `VERCEL_ENV === "production"`. Fuera de Vercel esa variable no
   existe, así que **si queda en `1`, el webhook de pagos se verifica sin llave y
   cualquiera puede firmar un aviso de pago falso.** Regla: en producción,
   `BOLD_MODO_PRUEBAS` **vacía**. Mejor aún, hacer un cambio de código antes del
   corte (usar una variable propia, como `APP_ENV=production`, en vez de
   `VERCEL_ENV`) — ver Fase 0, paso 7.
2. **El país de la visita** (`src/app/api/medicion/route.ts`) lo da la cabecera
   `x-vercel-ip-country`. Fuera de Vercel llega vacío y la medición pierde el país.
   No rompe nada.
3. **La página de privacidad** (`src/app/privacidad/page.tsx`) nombra a Vercel y a
   Supabase como encargados del tratamiento. **Hay que actualizarla** al cambiar
   de proveedor (skill `seo-y-legal`): es una obligación legal, no un detalle.
4. Los mensajes «faltan las `SMTP_*` en Vercel» son solo texto; conviene
   corregirlos.

---

## 1. Fase 0 — preparación común a las dos vías

No depende de la vía. Se hace **una vez**, antes de tocar nada en producción.

### Paso 1. Congelar una versión conocida

En el PC donde esté el repositorio, con `main` al día:

```bash
git fetch origin
git switch main && git pull origin main
npm ci
npm run build && npx tsc --noEmit && npx eslint . && npm test
```

Los cuatro en limpio. Después, **etiquetar la versión que se va a subir**
(esto es lo que Jesús pidió para desplegar «por tag»; la regla del repo es que el
tag se crea **solo cuando se pide expresamente**, y aquí se pide):

```bash
git tag -a v0.11.0 -m "primera versión desplegada en Hostinger"
git push origin v0.11.0
```

El último tag existente es `v0.10.1`. Si pasa tiempo antes del corte, se crea uno
nuevo en vez de mover este.

### Paso 2. Guardar lo que solo vive en paneles ajenos

Esto se pierde si se apaga el proyecto de Supabase o el de Vercel sin copiarlo.
Se anota **sin valores** en el gestor de contraseñas, o se copia a un archivo
fuera del repo:

- [ ] **Vercel → Settings → Environment Variables**, entorno *Production*: copiar
      cada variable (nombre **y** valor) al gestor de contraseñas. Los nombres
      están en el [Anexo A](#anexo-a--variables-de-entorno).
- [ ] **Supabase → Authentication → URL Configuration**: *Site URL* y la lista de
      *Redirect URLs*.
- [ ] **Supabase → Authentication → Sign In / Providers → Email**: confirmar
      correo (sí/no), longitud y vigencia del código, largo mínimo de contraseña.
- [ ] **Supabase → Authentication → Emails → Templates**: las plantillas ya están
      copiadas en `plantillas-correo/`. Comprobar que **lo del panel coincide con
      lo del repo**; si el panel tiene algo más nuevo, el panel gana y se actualiza
      el repo.
- [ ] **Supabase → Authentication → SMTP Settings**: servidor, puerto, usuario,
      remitente (la contraseña ya está en el gestor).
- [ ] **BOLD (panel.bold.co) → Integraciones**: anotar la URL del webhook actual.
      Habrá que cambiarla al dominio nuevo.
- [ ] **Supabase → Settings → API**: URL del proyecto y **JWT Secret** (hará falta
      solo si se quiere conservar la sesión de los usuarios — normalmente no vale
      la pena: se les pide volver a entrar una vez).

### Paso 3. Hacer una copia completa de la base actual

Sirve de red de seguridad en cualquier vía. Necesita la **contraseña de la base**
(Supabase → Settings → Database → *Reset database password* si no se tiene) y la
cadena de conexión (*Connect* → pestaña *Session pooler*).

```bash
# Pide la contraseña sin dejarla escrita en el historial del terminal
read -s -p "Contraseña de la base de Supabase: " PGPASSWORD; export PGPASSWORD; echo

# Una versión de pg_dump igual a la del servidor (17), sin instalar nada:
docker run --rm -e PGPASSWORD postgres:17 \
  pg_dump "postgresql://postgres.<REF>@<HOST-DEL-POOLER>:5432/postgres" \
  --no-owner --no-privileges -Fc > respaldo-supabase-$(date +%F).dump
```

`<REF>` y `<HOST-DEL-POOLER>` salen de la cadena que muestra el botón *Connect*.
En Windows sin Docker: instalar PostgreSQL 17 y usar su `pg_dump.exe`. **El archivo
`.dump` contiene datos personales: no va al repositorio ni a un correo.** Se guarda
en una carpeta privada o en Drive con acceso restringido.

- [ ] Comprobar que el archivo pesa más que cero y que `pg_restore --list
      respaldo-supabase-AAAA-MM-DD.dump | head` lista tablas.

### Paso 4. Copiar las imágenes subidas

Las fotos viven en Supabase Storage (buckets `avatares` y `logos`). El `pg_dump`
**no** las incluye. Opciones: bajarlas con el script del paso A9 (Vía A) o, para
solo respaldar, desde Supabase → Storage → descargar la carpeta. Anotar cuántos
archivos hay, para comparar al final.

### Paso 5. Decidir el correo de la aplicación (SMTP)

Hoy el SMTP sale de Google (Workspace o Gmail con contraseña de aplicación). Se
puede dejar igual en cualquier vía. Alternativa: el correo de Hostinger del
dominio (`no-responder@seregenera.com`). Si se cambia, hay que configurar SPF y
DKIM en el DNS para que no caiga en spam, y `SMTP_REMITENTE` tiene que ser la
cuenta que autentica o un alias verificado (ver `docs/VARIABLES.md`).

### Paso 6. Bajar el TTL del DNS

**Un día antes del corte**, en hPanel → Dominios → `seregenera.com` → DNS / Zona
DNS: bajar el TTL de los registros `A` y `CNAME` de `@` y `www` a **300 s**. Así,
si algo falla, la vuelta atrás tarda minutos y no horas.

### Paso 7. (Recomendado) un cambio de código antes del corte

Un commit pequeño, por el flujo normal (`entrega-directa`):

1. En `src/lib/payments.ts`, reemplazar `process.env.VERCEL_ENV !== "production"`
   por una variable propia (`process.env.APP_ENV !== "production"`), documentarla
   en `docs/VARIABLES.md` y ponerla en `production` en el servidor. Ajustar
   `src/lib/payments.test.ts`, que hoy usa `vi.stubEnv("VERCEL_ENV", …)`.
2. Actualizar `src/app/privacidad/page.tsx` con los nuevos encargados.
3. Corregir los textos que dicen «en Vercel» (`admin/contactar/*`, `correo/*`).

Hasta que eso esté hecho: **`BOLD_MODO_PRUEBAS` vacía en el servidor de
producción**, sin excepción.

---

## 2. Vía A — VPS con Supabase autoalojado *(futura: no se ejecuta hasta que haya VPS)*

**Resultado:** `https://seregenera.com` sirve la app desde tu VPS;
`https://api.seregenera.com` es el Supabase autoalojado; las cuentas, los pedidos
y las fotos se copiaron de Supabase Cloud. **El código de la aplicación no
cambia.**

**Lo que se necesita:** que Ivan compre el VPS (o te dé acceso), `docs/VARIABLES.md` con
sus valores, y la Fase 0 hecha. Tiempo: 1–2 días la primera vez.

**Arquitectura final:**

```
Navegador ──► Caddy (80/443, HTTPS automático)
               ├─ seregenera.com ───────► Next.js  (127.0.0.1:3000, pm2)
               └─ api.seregenera.com ───► Kong de Supabase (127.0.0.1:8000, Docker)
                                            ├─ /rest/v1     (PostgREST)
                                            ├─ /auth/v1     (GoTrue)
                                            └─ /storage/v1  (imágenes)
```

Solo Caddy escucha hacia internet. Postgres, Studio y todo lo demás quedan
cerrados.

### A1. Elegir y comprar el VPS

1. hPanel (cuenta de Ivan) → **VPS** → **Obtener VPS**.
2. Plan **KVM 2** (2 vCPU, 8 GB de RAM, 100 GB NVMe). Con 4 GB (KVM 1) Supabase
   apenas cabe y Next.js se queda sin aire al compilar.
3. **Plazo:** 12 meses hasta comprobar que el montaje funciona; 24 meses es más
   barato pero amarra el pago. Confirmar el precio final **en el carrito**
   (los precios de renovación varían según la fuente).
4. **Ubicación del servidor:** la más cercana a Colombia que ofrezca el
   asistente. Cambiarla después es rehacer el servidor.
5. **Sistema operativo:** *Ubuntu 24.04*. Si el asistente ofrece la plantilla
   **Ubuntu 24.04 con Docker**, usarla (te ahorras el paso A4).
6. **Acceso:** elegir *clave SSH* si deja pegarla en el asistente (siguiente paso);
   si no, poner una contraseña de root larga **temporal**, que se desactiva en A3.

### A2. Crear tu llave SSH y entrar

En **tu PC** (PowerShell o Git Bash):

```bash
ssh-keygen -t ed25519 -C "jesus@seregenera" -f ~/.ssh/seregenera_vps
```

Pide una frase de paso: ponla y guárdala en el gestor. Se crean dos archivos:
`seregenera_vps` (**privada, no se comparte jamás**) y `seregenera_vps.pub`
(pública).

1. Mostrar la pública: `cat ~/.ssh/seregenera_vps.pub`.
2. En hPanel → VPS → tu servidor → **Settings → SSH keys** (o en el asistente de
   compra) → pegar la pública. *(El nombre exacto del menú puede variar.)*
3. Anotar la **IP del servidor** (hPanel → VPS → Overview) en el gestor de
   contraseñas, **no en el repo**.
4. Entrar:

```bash
ssh -i ~/.ssh/seregenera_vps root@IP_DEL_VPS
```

La primera vez pregunta si confiar en el servidor: `yes`.

> **Cada persona tiene su propia llave.** Cuando Ivan también deba entrar, genera
> la suya y se agrega a `~/.ssh/authorized_keys` del usuario `deploy`. No se
> comparte una llave entre dos personas.

### A3. Endurecer el servidor (no saltarse esto)

Todavía como `root`:

```bash
# 1. Hora de Colombia y sistema al día
timedatectl set-timezone America/Bogota
apt update && apt -y upgrade

# 2. Un usuario normal para trabajar, con sudo
adduser deploy                 # pide una contraseña (la de sudo); el resto, Enter
usermod -aG sudo deploy

# 3. Pasarle tu llave pública
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys
```

**Antes de seguir, abrir una segunda terminal** y comprobar que entra el usuario
nuevo:

```bash
ssh -i ~/.ssh/seregenera_vps deploy@IP_DEL_VPS
sudo whoami        # debe responder: root
```

Solo si eso funcionó, volver a la sesión de root y cerrar la puerta:

```bash
# 4. Sin contraseña y sin root por SSH
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sshd -t && systemctl restart ssh      # `sshd -t` debe callar; si grita, no reiniciar

# 5. Cortafuegos: solo SSH, HTTP y HTTPS
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status

# 6. Bloquear a quien insista con contraseñas, y parches de seguridad automáticos
apt -y install fail2ban unattended-upgrades
systemctl enable --now fail2ban
dpkg-reconfigure -plow unattended-upgrades   # responder «Yes»

# 7. Memoria de respaldo (swap) para que `next build` no mate al servidor
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

Desde aquí se trabaja **siempre como `deploy`**. Si la segunda terminal se quedó
fuera, el VPS tiene una consola de emergencia en hPanel → VPS → *Browser terminal*.

### A4. Instalar Docker

Como `deploy` (omitir si la plantilla ya traía Docker; comprobar con `docker --version`):

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker deploy
exit        # cerrar la sesión y volver a entrar para que el grupo surta efecto
```

```bash
ssh -i ~/.ssh/seregenera_vps deploy@IP_DEL_VPS
docker run --rm hello-world && docker compose version
```

> ⚠️ **Trampa conocida:** Docker abre sus puertos **saltándose el cortafuegos
> `ufw`**. Un puerto publicado como `5432:5432` queda abierto al mundo aunque
> `ufw` diga que no. Por eso en A5 se ponen todos los puertos en `127.0.0.1`.

### A5. Instalar Supabase (autoalojado)

La guía oficial: <https://supabase.com/docs/guides/self-hosting/docker>.

```bash
cd ~
# Versión fija (no `main`): así se actualiza cuando uno decide, no por sorpresa.
# Antes de copiar: mirar la última etiqueta `self-hosted/v*` en GitHub y usarla.
git clone --depth 1 --branch self-hosted/v0.8.3 https://github.com/supabase/supabase
mkdir supabase-project
cp -rf supabase/docker/. supabase-project
cd supabase-project
cp .env.example .env
printf 'ref=self-hosted/v0.8.3\n' > .supabase-version
docker compose pull
```

**Generar los secretos** (en este orden, y revisar el `.env` después):

```bash
sh utils/generate-keys.sh
sh utils/add-new-auth-keys.sh
```

Eso rellena `SECRET_KEY_BASE`, `VAULT_ENC_KEY`, `PG_META_CRYPTO_KEY`, las llaves
de la API y las de JWT. **El `.env` de este directorio es el archivo más
sensible del servidor: `chmod 600 .env`, y se copia al gestor de contraseñas.**
Si se pierde, la base no se puede abrir.

**Editar `.env`** (`nano .env`). Los nombres exactos están en el archivo; esto
es lo que hay que cambiar a mano:

| Variable | Valor |
|---|---|
| `POSTGRES_PASSWORD` | Una contraseña larga, **solo letras y números** (los símbolos rompen las cadenas de conexión). Se cambia **antes** del primer arranque |
| `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD` | Para entrar a Studio. La contraseña debe llevar al menos una letra (no solo números) y no usar caracteres especiales |
| `SUPABASE_PUBLIC_URL` | `https://api.seregenera.com` |
| `API_EXTERNAL_URL` | `https://api.seregenera.com/auth/v1` |
| `SITE_URL` | `https://pruebas.seregenera.com` durante las pruebas; **`https://seregenera.com`** en el corte |
| `ADDITIONAL_REDIRECT_URLS` | Las mismas URLs del paso 2 de la Fase 0, si el archivo trae la variable |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SENDER_NAME`, `SMTP_ADMIN_EMAIL` | Los datos del correo de la Fase 0, paso 5 |
| Ajustes de acceso | Que la confirmación de correo, el largo del código (6) y la vigencia coincidan con lo anotado de Supabase Cloud. Los nombres salen en la sección `auth` → `environment` de `docker-compose.yml` (empiezan por `GOTRUE_`) |

**Cerrar los puertos.** Abrir `docker-compose.yml` y buscar `ports:`. Cada línea
que publique un puerto debe quedar así (o borrarse):

```yaml
    ports:
      - "127.0.0.1:${KONG_HTTP_PORT}:8000/tcp"   # Kong: solo local; Caddy lo publica
```

- `kong` → solo el de `8000`, con `127.0.0.1:` delante; **quitar** el de `8443`.
- `supavisor` (el *pooler*) → **quitar** las dos líneas (`5432` y `6543`). Las
  migraciones y copias de seguridad entran por dentro de Docker, no por ahí.

```bash
sh run.sh start            # = docker compose up -d --wait
docker compose ps          # todo en «Up (healthy)»; la columna PORTS solo con 127.0.0.1
```

Comprobar **desde tu PC** que nada quedó abierto (debe responder `False` / timeout):

```powershell
Test-NetConnection IP_DEL_VPS -Port 5432
Test-NetConnection IP_DEL_VPS -Port 8000
```

Si algo no está «healthy»: `sh run.sh logs <servicio>`.

> Si el clon trae un `.env.example` o `.env` de Supabase, **es el de Supabase**,
> no el de Seregenera. Son archivos distintos que viven en carpetas distintas.

### A6. DNS y Caddy (HTTPS)

**Primero el DNS** (hPanel → Dominios → `seregenera.com` → DNS / Zona DNS).
Agregar, **sin tocar ningún otro registro** (en particular no tocar `MX`, que es
el correo):

| Tipo | Nombre | Apunta a | TTL |
|---|---|---|---|
| `A` | `api` | IP del VPS | 300 |
| `A` | `pruebas` | IP del VPS | 300 |

Esperar unos minutos y comprobar: `nslookup api.seregenera.com`.

**Instalar Caddy** (como `deploy`; método oficial de Debian/Ubuntu en
<https://caddyserver.com/docs/install#debian-ubuntu-raspbian>):

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

`sudo nano /etc/caddy/Caddyfile` y dejar:

```caddy
# La API de Supabase. Solo se exponen las rutas que la app usa; Studio y lo demás
# no salen a internet (se entra por túnel SSH, ver abajo).
api.seregenera.com {
	encode zstd gzip

	# Las plantillas de los correos de acceso (paso A10)
	handle_path /plantillas/* {
		root * /srv/plantillas
		file_server
	}

	@supabase path /rest/v1/* /auth/v1/* /storage/v1/* /realtime/v1/*
	handle @supabase {
		reverse_proxy 127.0.0.1:8000
	}

	handle {
		respond "No encontrado" 404
	}
}

# La app, mientras se prueba
pruebas.seregenera.com {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3000
}
```

```bash
sudo mkdir -p /srv/plantillas
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
curl -I https://api.seregenera.com/auth/v1/health      # 200 (o 401) = Kong respondió
```

Caddy pide y renueva los certificados de Let's Encrypt solo, siempre que el DNS
ya apunte al servidor.

**Entrar a Studio (el panel de Supabase)** — nunca está en internet; se usa un
túnel desde tu PC:

```bash
ssh -i ~/.ssh/seregenera_vps -L 8000:127.0.0.1:8000 deploy@IP_DEL_VPS
```

y abrir <http://localhost:8000> en tu navegador, con el `DASHBOARD_USERNAME` /
`DASHBOARD_PASSWORD`.

### A7. Aplicar el esquema (las 22 migraciones)

Las migraciones del repositorio son la fuente de verdad: se aplican en orden,
como lo hace `npm run test:base`. En el VPS, con el repo clonado (paso A11) o
copiando solo `supabase/migrations/`:

```bash
cd ~/supabase-project
for f in ~/regenera-market/supabase/migrations/*.sql; do
  echo ">> $f"
  docker compose exec -T db psql -U supabase_admin -d postgres \
    -v ON_ERROR_STOP=1 < "$f" || { echo "FALLÓ $f"; break; }
done
```

Debe terminar **sin un solo error**. Si una falla: **no se parchea a mano en
Studio**; se corrige en el archivo (si el defecto es del archivo) o se resuelve
la diferencia del entorno, se vacía la base (`sh reset.sh` — **borra todo; solo
en este paso, con la base todavía vacía**) y se reaplica entera. Es la regla de
`docs/BETA.md` (Bloque 0).

Comprobar: en Studio (túnel) → Table Editor → deben salir las tablas (`profiles`,
`providers`, `orders`…), y en Storage los buckets `avatares` y `logos`.

> Antes de mover nada real, **correr las pruebas del repo contra este Postgres**.
> Desde tu PC, abriendo un túnel al puerto de Postgres (que es el único caso en
> que se necesita): ver `docs/PORTABILIDAD.md`, sección «Probar contra el
> Postgres de destino» (`PRUEBAS_PG_URL=… npm run test:base`).

### A8. Copiar los datos (cuentas, pedidos, todo)

Con la base ya creada por las migraciones, se copian **solo los datos**: las
cuentas (`auth.users`, `auth.identities`) y todo `public`. Las contraseñas
cifradas viajan con las cuentas, así que **nadie tiene que registrarse de nuevo**
(las sesiones abiertas sí caen: tendrán que volver a entrar una vez).

Desde el VPS (necesita acceso de red a Supabase Cloud; usar de nuevo la cadena y
la contraseña del paso 3 de la Fase 0):

```bash
cd ~
read -s -p "Contraseña de la base de Supabase Cloud: " PGPASSWORD; export PGPASSWORD; echo
URL="postgresql://postgres.<REF>@<HOST-DEL-POOLER>:5432/postgres"

# 1) Las cuentas
docker run --rm -e PGPASSWORD postgres:17 pg_dump "$URL" \
  --data-only --disable-triggers -t auth.users -t auth.identities > cuentas.sql

# 2) Todo lo de la aplicación
docker run --rm -e PGPASSWORD postgres:17 pg_dump "$URL" \
  --data-only --disable-triggers --schema=public > datos.sql
```

`--disable-triggers` evita que, al cargar `auth.users`, el trigger de alta cree
perfiles duplicados. Cargar **en este orden** (las tablas de `public` apuntan a
`auth.users`):

```bash
cd ~/supabase-project
docker compose exec -T db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < ~/cuentas.sql
docker compose exec -T db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < ~/datos.sql
```

**Comprobar que no se perdió nada** (mismas cifras en Cloud y en el VPS):

```sql
select (select count(*) from auth.users)  as cuentas,
       (select count(*) from profiles)    as perfiles,
       (select count(*) from providers)   as empresas,
       (select count(*) from orders)      as ordenes;
```

Luego **borrar los volcados** (`shred -u cuentas.sql datos.sql`): llevan datos
personales.

### A9. Copiar las imágenes y reescribir sus URLs

La base guarda la **URL completa** de cada imagen (`src/lib/almacenamiento.ts`),
y esas URLs hoy apuntan al proyecto de Supabase Cloud. Dos pasos.

**1. Pasar los archivos.** Un script desechable (se guarda **fuera** del repo, por
ejemplo `~/copiar-imagenes.mjs`) que lista cada bucket en Cloud, baja cada
archivo y lo sube al Supabase del VPS, **con la misma ruta**:

```js
// node --env-file=copiar.env copiar-imagenes.mjs
import { createClient } from "@supabase/supabase-js";

const origen  = createClient(process.env.ORIGEN_URL,  process.env.ORIGEN_SERVICE_KEY);
const destino = createClient(process.env.DESTINO_URL, process.env.DESTINO_SERVICE_KEY);

for (const bucket of ["avatares", "logos"]) {
  // Recorre carpetas (una por dueño) y luego sus archivos
  const { data: carpetas } = await origen.storage.from(bucket).list("", { limit: 10000 });
  for (const c of carpetas ?? []) {
    const { data: archivos } = await origen.storage.from(bucket).list(c.name, { limit: 1000 });
    for (const f of archivos ?? []) {
      const ruta = `${c.name}/${f.name}`;
      const { data: blob, error } = await origen.storage.from(bucket).download(ruta);
      if (error) { console.error("NO BAJÓ", bucket, ruta, error.message); continue; }
      const { error: e2 } = await destino.storage.from(bucket)
        .upload(ruta, blob, { upsert: true, contentType: f.metadata?.mimetype });
      console.log(e2 ? `FALLÓ ${ruta}: ${e2.message}` : `ok ${bucket}/${ruta}`);
    }
  }
}
```

`copiar.env` (también fuera del repo) lleva `ORIGEN_URL`, `ORIGEN_SERVICE_KEY`,
`DESTINO_URL` (`https://api.seregenera.com`) y `DESTINO_SERVICE_KEY`. Se corre
desde tu PC con `npm i @supabase/supabase-js` en una carpeta temporal. Al final,
contar los archivos en los dos lados.

**2. Reescribir las URLs guardadas.** Primero, **buscar todas las columnas** que
puedan guardar una (no solo `avatar_url` y `logo_url`):

```sql
select table_name, column_name
  from information_schema.columns
 where table_schema = 'public'
   and (column_name ~* '(url|foto|image|imagen|portada|logo|avatar|media)');
```

Para cada una, comprobar si hay filas con el dominio viejo y reemplazarlo:

```sql
select count(*) from profiles where avatar_url like '%.supabase.co%';

update profiles  set avatar_url = replace(avatar_url, 'https://<REF>.supabase.co', 'https://api.seregenera.com')
 where avatar_url like 'https://<REF>.supabase.co%';
update providers set logo_url   = replace(logo_url,   'https://<REF>.supabase.co', 'https://api.seregenera.com')
 where logo_url like 'https://<REF>.supabase.co%';
-- …y lo mismo con cada columna que apareció arriba
```

La ruta `/storage/v1/object/public/…` es idéntica en el Supabase autoalojado, así
que `next.config.ts` (que deriva el dominio de `NEXT_PUBLIC_SUPABASE_URL`) sirve
las imágenes sin cambios.

### A10. Los correos de acceso (plantillas)

En Supabase Cloud el HTML de las plantillas vive en el panel; en el autoalojado se
sirve **por URL**. Las plantillas están en `plantillas-correo/` (archivos `01`
a `05` y `07`, los de Supabase; el `00-base.md` explica el esqueleto).

1. Extraer el HTML de cada `.md` a un archivo en `/srv/plantillas/` del VPS
   (por ejemplo `confirmar-registro.html`, `codigo-de-acceso.html`…). Es un
   copiar y pegar del bloque HTML de cada archivo.
2. En el `.env` de Supabase, apuntar cada plantilla a su URL y cada asunto a su
   texto. Los nombres exactos están en `docker-compose.yml`, sección `auth`
   (variables `GOTRUE_MAILER_TEMPLATES_*` y `GOTRUE_MAILER_SUBJECTS_*`), p. ej.:
   `https://api.seregenera.com/plantillas/codigo-de-acceso.html`.
3. `sh run.sh recreate auth` (o reiniciar el servicio `auth`).

Las reglas de `plantillas-correo/README.md` **siguen valiendo igual** (el código
`{{ .Token }}` va en *dos* plantillas, el enlace nunca es `{{ .ConfirmationURL }}`,
etc.): es el mismo GoTrue.

### A11. Instalar la aplicación Next.js

Como `deploy`:

```bash
# Node 22 (el mismo del CI: `node-version: 22` en .github/workflows/ci.yml)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs git
sudo npm install -g pm2

cd ~
git clone https://github.com/UniqueColombia/regenera-market.git
cd regenera-market
git checkout v0.11.0          # el tag de la Fase 0 (o el que toque)
```

El repositorio es público: se clona por HTTPS **sin llaves**.

**Crear el `.env` de producción** (no existe en el repo; los nombres están en el
[`docs/VARIABLES.md`](docs/VARIABLES.md)):

```bash
nano .env       # pegar los valores
chmod 600 .env
```

Los valores que cambian respecto a Vercel: `NEXT_PUBLIC_SUPABASE_URL=https://api.seregenera.com`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` (las del Supabase
**del VPS**, salen de su `.env` — buscar `ANON_KEY` / `SERVICE_ROLE_KEY`, o las
llaves *publishable* / *secret* que trae la versión nueva), y
`NEXT_PUBLIC_SITE_URL` (`https://pruebas.seregenera.com` mientras se prueba).
**`BOLD_MODO_PRUEBAS` vacía** (ver «Lo que depende de Vercel»).

> **Las variables `NEXT_PUBLIC_*` se graban en el momento de compilar.** Si se
> cambia una, hay que volver a hacer `npm run build`; reiniciar no basta.

```bash
npm ci
npm run build
pm2 start npm --name seregenera -- start -- -H 127.0.0.1 -p 3000
pm2 save
pm2 startup        # imprime un comando `sudo env PATH=… pm2 startup …`; copiarlo y ejecutarlo
curl -I http://127.0.0.1:3000
```

Con `pm2 startup` + `pm2 save`, la app vuelve sola si el servidor se reinicia.

**Un script para desplegar cada versión** (`~/desplegar.sh`, `chmod +x`). Es lo
que se corre cada vez que sale un tag nuevo:

```bash
#!/usr/bin/env bash
# Uso: ./desplegar.sh v0.11.1      (un tag)   |   ./desplegar.sh main
set -euo pipefail
cd ~/regenera-market
git fetch --tags --force origin
git checkout "$1"
[ "$1" = "main" ] && git pull origin main
npm ci
npm run build
pm2 reload seregenera
echo "Desplegado: $(git describe --tags --always)"
```

**Volver a una versión anterior** es el mismo script con el tag anterior:
`./desplegar.sh v0.10.1`.

### A12. Probar todo en `pruebas.seregenera.com`

En esta etapa el sitio real sigue en Vercel y **nadie lo nota**. Recorrer la
[lista del Anexo B](#anexo-b--lista-de-pruebas-de-punta-a-punta) completa. Lo que
más suele fallar la primera vez:

| Síntoma | Causa probable |
|---|---|
| «Invalid API key» / 401 en todo | Se copió mal `ANON_KEY` o se compiló antes de ponerla (hay que rehacer `npm run build`) |
| El código de acceso nunca llega | SMTP de Supabase mal puesto (A5) o plantillas sin cargar (A10). Ver `sh run.sh logs auth` |
| Las fotos no salen | URLs sin reescribir (A9) o `NEXT_PUBLIC_SUPABASE_URL` distinta del dominio de las fotos |
| Cualquier subida de foto falla | Falta el *bucket*; revisar que la migración `0008` corrió |
| El enlace del correo lleva a otro dominio | `SITE_URL` de Supabase no coincide con el dominio que se prueba |
| 502 en Caddy | `pm2 status`: la app no está arriba, o `-H 127.0.0.1 -p 3000` no coincide con el Caddyfile |

### A13. Corte a producción

Ver [4. Corte de dominio y vuelta atrás](#4-corte-de-dominio-y-vuelta-atrás).

### A14. Respaldos (obligatorio: no es opcional)

Los respaldos semanales de Hostinger **no bastan** para una tienda con pagos:
perder hasta seis días de pedidos no es aceptable. Se agrega, además:

**1. Un volcado diario de la base** — `~/respaldar.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
DEST=/home/deploy/respaldos
mkdir -p "$DEST"
FECHA=$(date +%F)

# La base (formato comprimido de pg_dump)
cd /home/deploy/supabase-project
docker compose exec -T db pg_dump -U supabase_admin -d postgres -Fc > "$DEST/db-$FECHA.dump"

# Las imágenes y el .env (que lleva los secretos)
tar -czf "$DEST/archivos-$FECHA.tgz" volumes/storage .env

# Conservar 14 días en el servidor
find "$DEST" -type f -mtime +14 -delete
```

```bash
chmod +x ~/respaldar.sh
crontab -e         # agregar la línea siguiente (todos los días a las 3:00)
0 3 * * * /home/deploy/respaldar.sh >> /home/deploy/respaldos/log.txt 2>&1
```

**2. Una copia FUERA del servidor** (si el VPS muere, los respaldos que están en
él mueren también). Con `rclone` hacia Google Drive:

```bash
sudo apt install -y rclone
rclone config          # n) nuevo → nombre «drive» → tipo «drive» → seguir el asistente
```

El asistente pide autorizar en un navegador; como el VPS no tiene, elegir
«*No*» en «use auto config» y seguir las instrucciones (se ejecuta `rclone
authorize "drive"` en tu PC y se pega el resultado). Después, agregar al final de
`respaldar.sh`:

```bash
rclone copy "$DEST" drive:respaldos-seregenera --max-age 2d
```

**3. Probar que se puede restaurar** — un respaldo que nunca se restauró no es un
respaldo. Una vez al mes, en una base desechable:

```bash
docker run --rm -d --name prueba-restaurar -e POSTGRES_PASSWORD=x postgres:17
sleep 5
docker cp ~/respaldos/db-AAAA-MM-DD.dump prueba-restaurar:/tmp/r.dump
docker exec prueba-restaurar pg_restore -U postgres -d postgres --no-owner /tmp/r.dump 2>&1 | tail
docker rm -f prueba-restaurar
```

(Puede dar avisos de roles que no existen en el Postgres pelado; lo que importa es
que las tablas de `public` y sus filas lleguen.)

**4.** En hPanel → VPS → *Backups*: activar los respaldos semanales y hacer un
*snapshot* manual **antes de cada actualización grande**.

### A15. Mantenimiento mensual (30 minutos)

- [ ] `sudo apt update && sudo apt -y upgrade` y reiniciar si lo pide
      (`/var/run/reboot-required`).
- [ ] `df -h` — el disco no debe pasar del 70 %. `docker system prune` limpia
      imágenes viejas (con cuidado: nunca `--volumes`).
- [ ] Revisar `~/respaldos/log.txt` y que la última copia esté en Drive.
- [ ] Probar un respaldo (A14.3).
- [ ] Actualizar Supabase **si hay una versión nueva con arreglos de seguridad**:
      leer las notas, hacer un *snapshot*, `sh update.sh`, y volver a verificar
      `docker-compose.yml` (que los `ports:` sigan en `127.0.0.1`).
- [ ] `pm2 status` y `pm2 logs seregenera --lines 50`: sin errores repetidos.
- [ ] Renovaciones: dominio (vence 2027-07-23), VPS y certificados (Caddy los
      renueva solo, pero comprobar que `https://seregenera.com` no avise).

### A16. Cuando todo esté estable (≥ 2 semanas)

- [ ] Apagar el proyecto de Vercel (o dejarlo desconectado del dominio).
- [ ] **Pausar** (no borrar todavía) el proyecto de Supabase Cloud; borrar a los
      30 días si no hizo falta volver.
- [ ] Actualizar los documentos: `docs/DEPLOY.md` (el stack), `docs/PORTABILIDAD.md`
      («ya no es hipotético»), `docs/ESTADO.md`, y escribir el hito (skill
      `registrar-hito`).
- [ ] Cambiar `.github/workflows/latido.yml` si sigue apuntando al dominio viejo;
      en la Vía A el Supabase propio **no se pausa**, así que el latido ya no hace
      falta (queda solo si se quiere un monitor de disponibilidad).

---

## 3. Vía B — Hostinger Cloud

**Cuándo:** no se puede pagar un VPS. Se usa el plan que ya existe (Cloud) para
**servir la aplicación**, y se decide dónde vive la base de datos. Hay dos
sub-vías con consecuencias muy distintas.

### Por qué el plan Cloud no alcanza para quedarse en Postgres

El plan web de Hostinger trae **solo MySQL**; PostgreSQL existe únicamente en VPS.
Así que en Cloud la base o se queda fuera (B-1) o se reescribe a MySQL (B-2).

### B-1. La app en Hostinger Cloud, la base en Supabase (puente) — **la ruta activa**

**Resultado:** `https://seregenera.com` lo sirve Hostinger (adiós Vercel Hobby, que
no permite uso comercial); la base y el acceso siguen en Supabase. **Cero cambios
de código** (salvo los de la Fase 0, paso 7).

**Lo que sigue dependiendo de un tercero:** Supabase. Y el plan **gratuito** de
Supabase pausa el proyecto tras 7 días sin actividad; el repo ya lo mitiga con un
latido diario (`src/app/api/latido/route.ts` + `.github/workflows/latido.yml`). Es
un parche, no una garantía: para operar con pagos reales, **Supabase Pro**
(≈ US$25/mes) es lo sensato. Es el costo de no tener VPS.

#### B1.1. Confirmar que el plan sirve

En la cuenta de Ivan: hPanel → **Sitios web** → debe existir la opción **Web
Apps** / **Crear sitio web → Web App**. Si el plan es *Premium* o *Single*, no
hay Node.js: hay que subir a **Business o Cloud**. Hostinger soporta Node.js
**18, 20, 22 y 24**; se usa **22** (el del CI).

**Si el plan no trae Node.js** (por ejemplo, si lo que hay es solo el dominio con
un hosting básico): la Vía B no es posible tal cual. Las salidas, de menor a
mayor cambio, son (1) **seguir en Vercel + Supabase** mientras no haya
presupuesto, y pagar lo que haga falta de esos dos (Vercel Pro y Supabase Pro,
≈ US$45/mes: Hobby no permite uso comercial); (2) **subir el plan de Ivan a
Business o Cloud** (se ve el precio en hPanel → *Upgrade*); (3) un VPS (Vía A).
Ninguna cambia el código. Decidirlo con Ivan **antes** de empezar B1.2.

#### B1.2. Conectar GitHub

Un plan de Hostinger se conecta **a una sola cuenta de GitHub**, y esa cuenta
tiene que **ver el repositorio** (`UniqueColombia/regenera-market`, de Ivan). El
repo es público, así que cualquier cuenta lo ve; pero para que Hostinger instale
su *GitHub App* y reciba los avisos de cada push, **lo hace Ivan** (admin del
repo) desde su sesión.

1. hPanel → **Sitios web** → **Crear sitio web** → **Web App**.
2. **Importar repositorio Git** → **Authorize** en GitHub → elegir
   `regenera-market`.
3. Hostinger detecta Next.js y propone la configuración de compilación; dejarla.
   **Verificar** que use Node **22** (hay una guía «seleccionar versión de
   Node.js» en la ayuda de Hostinger) y que compile con `npm run build`.
4. **Rama:** elegir `main`. *(Confirmar en pantalla; la documentación de
   Hostinger no detalla el selector. Si no deja elegir, usa la rama
   predeterminada del repositorio, que es `main`.)*

#### B1.3. Variables de entorno — **antes** del primer despliegue

En el panel de la aplicación → **Environment Variables**: cargar **todas** las de
producción de [`docs/VARIABLES.md`](docs/VARIABLES.md). Recordar que `NEXT_PUBLIC_*` se graban al compilar, así
que tienen que estar **antes** de pulsar *Deploy*. Con `NEXT_PUBLIC_SITE_URL`
puesto al dominio provisional que asigne Hostinger mientras se prueba.
**`BOLD_MODO_PRUEBAS` vacía.**

#### B1.4. Desplegar y probar con el dominio provisional

1. **Deploy.** El resultado aparece en **Deployments** (fecha y estado) con enlace
   al registro completo de la compilación.
2. Recorrer el [Anexo B](#anexo-b--lista-de-pruebas-de-punta-a-punta) en esa URL
   provisional. **Antes**, en Supabase → Authentication → URL Configuration,
   **agregar** esa URL a *Redirect URLs* (sin quitar las de producción).
3. Si falla la compilación: leer el registro. Lo más probable es falta de memoria
   (`next build` es pesado; los planes tienen límite de RAM) o una variable
   faltante. Un despliegue fallido **no tumba** la versión vigente: Hostinger
   conserva las dos últimas compilaciones buenas.
4. **Turbopack no compila en Hostinger** (visto el 2026-10-16): revienta en
   `src/app/globals.css` con «node process exited before we could connect to it».
   Turbopack procesa el CSS en un proceso de Node aparte y el entorno de
   compilación de Hostinger no lo deja conectarse. Por eso `npm run build` es
   `next build --webpack`: webpack hace lo mismo dentro de su propio proceso. Si
   alguien quita el `--webpack`, el siguiente despliegue en Hostinger falla.

#### B1.5. Conectar el dominio `seregenera.com`

Hoy el dominio está asociado a un sitio vacío de Hostinger («Página por
defecto»). Hostinger indica que, si el dominio ya está en el plan, hay que **quitar
primero el sitio existente y volver a agregarlo como Web App**. Pasos:

1. En hPanel, **antes** de quitar nada: descargar la copia de seguridad del sitio
   actual (es una página por defecto, no se pierde nada, pero es el
   procedimiento) y **anotar los registros DNS** (sobre todo los `MX`, que son el
   correo).
2. Quitar el sitio vacío y agregar `seregenera.com` a la Web App (en el panel de
   la app → *Dominios* / *Connect domain*; seguir el asistente y la guía «Conectar
   un dominio personalizado a una app Node.js»).
3. Comprobar en la Zona DNS que **los `MX` siguieron intactos**. Si el asistente
   cambió algo del correo, restaurarlo con lo anotado.
4. Esperar el SSL (Hostinger lo emite solo; puede tardar). Probar
   `https://seregenera.com` y `https://www.seregenera.com`.

#### B1.6. Ajustes finales

- [ ] Supabase → Authentication → **Site URL** = `https://seregenera.com`; en
      *Redirect URLs*, `https://seregenera.com/**`.
- [ ] `NEXT_PUBLIC_SITE_URL=https://seregenera.com` en el panel de Hostinger y
      **volver a desplegar** (se graba al compilar).
- [ ] Webhook de BOLD → `https://seregenera.com/api/webhooks/bold`.
- [ ] `.github/workflows/latido.yml` apuntando al dominio nuevo (ver el archivo).
- [ ] Apagar el proyecto de Vercel tras ≥ 2 semanas estables.
- [ ] Documentación: `docs/DEPLOY.md`, `docs/ESTADO.md`, la página de privacidad
      (ya no es Vercel) y un hito.

#### B1.7. Cómo se actualiza y cómo se vuelve atrás

- **Actualizar:** un `git push` a la rama conectada dispara una compilación
  automática. *(Sin PR ni tags: el flujo del repo, `entrega-directa`, ya empuja a
  `main`.)* Si no se quiere desplegar **cada** push a `main`, Hostinger no
  ofrece un interruptor documentado; la alternativa es conectar una rama
  distinta (por ejemplo una `produccion` que solo se actualiza al etiquetar) —
  decidirlo antes de conectar.
- **Reiniciar sin compilar:** botón *Running → Restart* en el panel de la app.
- **Volver atrás:** Hostinger conserva las dos últimas compilaciones buenas bajo
  `hbuilds/versions/` y apunta con un enlace `current`; la forma segura es
  **revertir en Git y dejar que se redespliegue**. No se editan archivos a mano en
  el servidor: se sobrescriben en cada despliegue.

#### B1.8. Los límites que hay que conocer

- No hay acceso por SSH para ejecutar comandos de la app: `npm` corre solo durante
  el despliegue.
- No hay botón de «detener»; para apagar la app hay que eliminar el sitio entero
  (irreversible). **Nadie lo pulsa sin avisar.**
- **Las imágenes subidas no van en el servidor** (en B-1 siguen en Supabase
  Storage), porque cada despliegue reemplaza los archivos de la app.
- Un límite de CPU/RAM del plan puede cortar la compilación o la app bajo carga;
  mirar las gráficas del panel las primeras semanas.

### B-2. Todo en MySQL (reescribir el backend) — solo si no hay otra salida

**Esto no es un traslado: es rehacer la capa de datos.** Es la única forma de
depender **solo** de lo que trae el plan (Hostinger Cloud + MySQL + GitHub). Antes
de empezar, leer esta tabla y confirmar que de verdad se quiere:

| Lo que hoy da Postgres/Supabase | Qué hay que hacer en MySQL | Peso |
|---|---|---|
| 79 políticas RLS en 25 tablas (quién ve/edita qué) | **MySQL no tiene RLS.** Cada consulta pasa a comprobar permisos **en el código**. Un `where` olvidado = fuga de datos | Muy alto, y es el riesgo de seguridad |
| 97 funciones y 29 triggers (precios, stock, comisiones, estados, reseñas, puntos) | Reescribir cada una como transacción en TypeScript o como procedimiento MySQL | Muy alto |
| 131 usos de `jsonb`, 27 arreglos, 6 enums, búsqueda con `pg_trgm`/`unaccent` | `JSON`, tablas auxiliares, `ENUM`, `FULLTEXT` (distinto comportamiento) | Alto |
| `auth.users`, sesiones, código de 6 dígitos por correo | Auth propio (tabla de usuarios, sesiones, códigos, límites de intentos) | Alto |
| Supabase Storage (imágenes) | Guardar archivos en disco **fuera de la carpeta de la app** (cada despliegue la sobrescribe) y servirlos | Medio |
| 155 llamadas `.from()` en 34 archivos y 20 `.rpc()` | Todas contra otro cliente | Alto |
| 12 archivos de pruebas de la base (1.700 líneas) | Rehacerlas para MySQL | Alto |

Una estimación gruesa, **no medida**: entre 4 y 8 semanas de trabajo repartidas
entre los dos, con el riesgo concentrado en dinero y permisos (las invariantes de
`dominio-regenera`). Mientras dure, el sitio sigue funcionando con B-1.

**Plan por etapas** (cada una termina con pruebas en verde y no rompe la anterior):

1. **Decidir y documentar.** Elegir cliente (por ejemplo Drizzle o Kysely sobre
   `mysql2`) y escribir el hito de la decisión (`registrar-hito`). Crear la base
   en hPanel → **Bases de datos → Administración → MySQL**. Para conectarse desde
   un PC de casa hace falta habilitar el acceso remoto a esa base (y registrar la
   IP del PC) o usar un túnel; anotar el host, el usuario y el puerto **en el
   gestor, no en el repo**.
2. **Esquema.** Traducir las 22 migraciones a MySQL 8 en una carpeta nueva
   (`mysql/migrations/`), en el mismo orden, **sin borrar** las de Postgres.
   Equivalencias: `uuid` → `CHAR(36)` (o `BINARY(16)`); `timestamptz` → `DATETIME(3)`
   en UTC; `jsonb` → `JSON`; arreglos → tabla hija; enums → `ENUM`.
3. **Capa de permisos.** Por cada política RLS, una función de autorización en
   `src/lib/` que reciba al usuario y valide **antes** de leer o escribir. Portar
   `supabase/pruebas/permisos.test.ts` primero: las pruebas de «entrar como el rol
   equivocado» son la red de seguridad.
4. **Lógica de negocio.** Portar los gemelos SQL/TS (`docs/NIVELES.md`, precios,
   estados de una orden, comisiones) y la compra atómica y los cupos con
   transacciones y `SELECT … FOR UPDATE` (las pruebas de `concurrencia.test.ts` y
   `compras.test.ts` son la referencia).
5. **Acceso.** Auth propio: tabla de usuarios, sesiones por cookie firmada, código
   de seis dígitos por correo (ya hay `nodemailer`), límite de intentos. **Las
   contraseñas se pueden conservar:** GoTrue las guarda con bcrypt, y
   `auth.users.encrypted_password` se puede importar tal cual y verificar con bcrypt.
6. **Imágenes.** Una implementación nueva de `AlmacenDeImagenes`
   (`src/lib/almacenamiento.ts` ya está pensada para eso), escribiendo a una
   carpeta fuera del directorio de despliegue.
7. **Datos.** Exportar Postgres a MySQL (por tablas, con un script que transforme
   tipos), verificar conteos y sumas (totales de órdenes, comisiones) contra el
   original.
8. **Corte.** Igual que en la sección 4, pero con una **ventana de mantenimiento**:
   pedidos nuevos congelados, exportar, importar, apuntar la app a MySQL, probar.

**Mi recomendación honesta:** B-2 solo se justifica si el VPS es imposible *y*
Supabase Pro es inaceptable. Antes de eso, la combinación **B-1 + (cuando se
pueda) Vía A** da el mismo resultado con una fracción del riesgo.

---

## 4. Corte de dominio y vuelta atrás

**Cuándo:** pruebas completas en verde (Anexo B), respaldo fresco (Fase 0, paso 3),
un horario de poco tráfico, y **las dos personas disponibles**.

### Vía A — pasar `seregenera.com` al VPS

1. **Caddy:** agregar el sitio real y la redirección de `www`:

   ```caddy
   seregenera.com {
   	encode zstd gzip
   	reverse_proxy 127.0.0.1:3000
   }

   www.seregenera.com {
   	redir https://seregenera.com{uri} permanent
   }
   ```

   `sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy`
   (el certificado se emite cuando el DNS ya apunte aquí).
2. **Variables:** en `~/regenera-market/.env`, `NEXT_PUBLIC_SITE_URL=https://seregenera.com`;
   en `~/supabase-project/.env`, `SITE_URL=https://seregenera.com`. Después:
   `cd ~/supabase-project && sh run.sh recreate auth` y `~/desplegar.sh <tag>`
   (hay que **recompilar**).
3. **DNS** (hPanel → Zona DNS de `seregenera.com`):
   - `@` (`A`): cambiar las dos IP actuales por la **IP del VPS** (dejar un solo `A`).
   - `www`: reemplazar el `CNAME` al CDN de Hostinger por un `CNAME` a
     `seregenera.com` (o un `A` a la IP del VPS).
   - **No tocar `MX`, `TXT`, `SPF`, `DKIM`.**
4. Esperar la propagación (con TTL 300, minutos). Comprobar
   `curl -I https://seregenera.com` y `nslookup seregenera.com`.
5. **BOLD:** webhook → `https://seregenera.com/api/webhooks/bold`.
6. Repetir las pruebas críticas del Anexo B (entrar, comprar, pagar) en el dominio real.

**Vuelta atrás (Vía A):** volver a poner en `@` y `www` los registros anotados
antes del corte (por eso se bajó el TTL y se anotaron). El sitio vuelve a Vercel
en minutos, porque Vercel y Supabase Cloud **no se tocaron**. Por eso no se apagan
hasta pasadas dos semanas.

### Vía B-1

El corte es el paso B1.5 (conectar el dominio a la Web App). Vuelta atrás: quitar
el dominio de la app y restaurar los registros `@`/`www` anotados hacia Vercel.

---

## 5. Qué hacer al llegar al computador de la casa

Este archivo está pensado para que **no haga falta recordar nada**. En orden:

1. **Traer lo último**
   ```bash
   cd regenera-market        # la carpeta del repositorio
   git fetch origin && git switch staging && git pull origin staging
   npm ci
   ```
2. **Recrear el `.env`** de esa máquina (no viaja con Git). La lista de nombres, con
   para qué sirve cada una, está en [`docs/VARIABLES.md`](docs/VARIABLES.md); los
   **valores** vienen del gestor de contraseñas o de los paneles (Supabase, BOLD,
   Google). La sección «Recrear el `.env` en un PC nuevo» de ese archivo lo explica
   paso a paso. (No hay `.env.example`: se quitó del repo.)
3. **Conectar Claude Code con Hostinger** (una sola vez por máquina; en el PC del
   trabajo ya está hecho y autenticado):
   ```bash
   claude mcp add --scope user --transport http hostinger https://mcp.hostinger.com
   ```
   y dentro de Claude Code: `/mcp` → **hostinger** → *Authenticate* → iniciar sesión
   en el navegador. Hostinger pide el **código de 6 dígitos de la app de
   autenticación de la cuenta** (hoy, el teléfono de quien la activó).
4. **Ver en qué punto quedó esto.** Abrir este archivo y revisar el
   [progreso](#progreso) de abajo; seguir por el primer paso sin marcar.
5. **Antes de tocar producción:** confirmar con Ivan que el plan incluye Node.js
   (B1.1). No se compra, no se cambia de plan ni se corta el DNS por iniciativa
   propia; y **la Vía A no se ejecuta** mientras no haya VPS.

### Progreso

Marcar con `[x]` al terminar cada bloque (y hacer commit, para que el otro PC lo vea):

- [x] Decisión (2026-10-16): **sin VPS por ahora → ruta activa: Vía B-1.** Vía A queda escrita para más adelante
- [x] Confirmado que el plan de Ivan incluye Node.js (hPanel → Sitios web → *Web App*): **Business** (2026-10-16)
- [ ] Ivan activó la renovación automática de `seregenera.com`
- [ ] Borrado el token de API de prueba en hPanel
- [ ] Fase 0: tag creado (`v0.11.0` y `v0.11.1`, hecho; desde ahora se despliega por tag, skill `desplegar-hostinger`) · paneles copiados · respaldo de la base · imágenes copiadas
- [ ] Fase 0, paso 7: cambio de `VERCEL_ENV` y de la página de privacidad
- [ ] *(Futura, solo con VPS)* Vía A: A1–A5 (servidor y Supabase) · A6 (DNS y Caddy) · A7–A10 (esquema, datos, imágenes, correos) · A11–A12 (app y pruebas) · A13 (corte) · A14 (respaldos)
- [x] Fase 0, paso 5: el correo de la aplicación es `info@seregenera.com` en Hostinger, también en Supabase (2026-10-16, `docs/CORREOS.md`)
- [ ] Vía B-1: B1.1–B1.5 hechos el 2026-10-16 (`seregenera.com` sirve la app desde Hostinger, por tag: hoy `v0.11.1`; Vercel sigue de respaldo) · B1.6: hechos *Site URL* y *Redirect URLs* de Supabase; faltan el webhook de BOLD, `latido.yml`, la página de privacidad y apagar Vercel tras ≥ 2 semanas estables
- [ ] Documentación y hito escritos (`docs/DEPLOY.md`, `docs/ESTADO.md`, `registrar-hito`)
- [ ] *(Pruebas, sin decisión)* Vía B-2 por etapas, con Supabase como fuente de verdad: etapa 0 (sondeo del MariaDB 11.8 de Hostinger) y etapa 1 (catálogo en espejo, solo lectura) hechas el 2026-10-17 en la rama `feat/js-espejo-mysql` · etapa 2 (escribir una oferta con los permisos de Postgres, en triggers) y etapa 3 (fotos en el disco del servidor) hechas el mismo día, probadas en local **y dentro de Hostinger** · etapa 4a (motor de cuentas propio, sin Supabase Auth) hecha; **4b–4e hechas el mismo día**: la app entera corre sobre MariaDB detrás de `BASE_DE_DATOS=mysql` (`docs/MODO-MYSQL.md`), con las 79 páginas públicas iguales y 73 pruebas en verde · 4f (el corte en producción) escrita y **sin ejecutar**: espera la prueba de Jesús como usuario. Ver los hitos `2026-10-17-experimento-mysql-*` y `2026-10-17-modo-mysql-completo.md`

---

## Anexo A — Variables de entorno

La lista completa, con para qué sirve cada variable y de dónde sale, vive en
[`docs/VARIABLES.md`](docs/VARIABLES.md) (es la única fuente: el `.env.example`
se quitó del repo). Lo que importa para esta migración:

- `NEXT_PUBLIC_*` **se graban al compilar**: cambiar una exige volver a desplegar.
- **`BOLD_MODO_PRUEBAS` vacía en producción**: fuera de Vercel no se ignora sola.
- Credenciales de Hostinger: solo en el gestor de contraseñas, nunca en un `.env`.

---

## Anexo B — Lista de pruebas de punta a punta

Se corre completa en el dominio de pruebas **y** otra vez, resumida, tras el corte.

**Acceso**
- [ ] `/registro` con un correo nuevo → llega el código de 6 dígitos → entra.
- [ ] `/entrar` con una cuenta **migrada** (la de Jesús o Ivan) → entra **con su
      contraseña de siempre** → ve sus datos.
- [ ] Cerrar sesión y volver a entrar.
- [ ] Cambiar el correo de una cuenta de prueba → llega el correo → confirma.

**Catálogo y compra**
- [ ] `/catalogo` carga con ofertas y **con fotos**.
- [ ] Una ficha de oferta y de proveedor abren y muestran sus imágenes.
- [ ] Armar un carrito, ir a pagar: **el total lo calcula el servidor** (invariante
      #1 de `dominio-regenera`) y coincide con el esperado.
- [ ] La orden aparece en `/admin/ordenes`.

**Pagos**
- [ ] El pedido muestra el botón de BOLD (si hay llaves) o los datos de Bre-B /
      transferencia.
- [ ] Un pago de prueba de BOLD llega por el webhook y cambia el estado de la
      orden. *(Solo si se puede probar sin cobrar de verdad.)*
- [ ] **`BOLD_MODO_PRUEBAS` está vacía** en el servidor.

**Empresas y administración**
- [ ] Subir un logo y una portada a una empresa → se ven → se reemplazan.
- [ ] Subir una foto de perfil.
- [ ] Un administrador entra a `/admin/*`; una cuenta normal **no** (probar la URL
      a mano).
- [ ] Una oferta nueva de una empresa pasa a revisión → llega el aviso.

**Correos de la aplicación**
- [ ] Enviar el formulario de `/vender` → llega el respaldo.
- [ ] Cambiar el estado de una orden → llega el aviso al comprador.

**Infraestructura**
- [ ] `https://seregenera.com` y `https://www.seregenera.com` con candado y
      redirección de `www`.
- [ ] Cabeceras de seguridad presentes (`curl -I`): `Content-Security-Policy`,
      `Strict-Transport-Security`, `X-Frame-Options`.
- [ ] La consola del navegador **sin errores de CSP** (si algo se bloquea, falta
      el dominio nuevo en `connect-src` o `img-src` de `next.config.ts`).
- [ ] `https://seregenera.com/api/latido` responde.
- [ ] Reiniciar el servidor (Vía A: `sudo reboot`) y comprobar que todo vuelve solo.

---

## Anexo C — Fuentes

Consultadas el 2026-10-16. Si alguna contradice lo de arriba, gana la fuente y se
corrige este archivo.

- Hostinger — [¿Se admite PostgreSQL?](https://support.hostinger.com/en/articles/1583659-is-postgresql-supported-at-hostinger) (solo en VPS)
- Hostinger — [Bases de datos admitidas por plan](https://www.hostinger.com/support/which-databases-and-data-tools-are-supported-at-hostinger/)
- Hostinger — [Cómo agregar una Web App Node.js](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger)
- Hostinger — [Hosting para Next.js](https://www.hostinger.com/uk/web-apps-hosting/nextjs-hosting)
- Hostinger — [Planes de VPS](https://www.hostinger.com/vps-hosting) y [análisis de precios y renovaciones](https://hostadvice.com/hosting-company/hostinger-reviews/vps-pricing/)
- Supabase — [Autoalojar con Docker](https://supabase.com/docs/guides/self-hosting/docker)
- Caddy — [Instalación en Debian/Ubuntu](https://caddyserver.com/docs/install#debian-ubuntu-raspbian)
- Dentro del repo: `docs/PORTABILIDAD.md` (qué depende de Supabase), `docs/DEPLOY.md`
  (por qué este stack), `docs/BETA.md` (Bloque 0: cómo se montó Supabase),
  `plantillas-correo/README.md` (correos de acceso), `supabase/pruebas/supabase-minimo.sql`
  (el contrato de lo que necesita un Postgres propio).

**Lo que no se pudo verificar y se marcó con «verificar» o «confirmar»:** el menú
exacto de llaves SSH del VPS, el selector de rama de la Web App, los precios finales
en pesos, los nombres exactos de algunas variables `GOTRUE_*` de la versión de
Supabase que se instale, y el plan real de Ivan. Cada uno se confirma en pantalla
al llegar a ese paso.
