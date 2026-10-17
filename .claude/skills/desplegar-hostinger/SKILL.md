---
name: desplegar-hostinger
description: Cómo se publica una versión de Seregenera en producción (seregenera.com, en Hostinger) - cuándo merece tag, cómo se arma el zip, cómo se sube y se compila con el MCP de Hostinger, cómo se comprueba y qué se limpia después. Úsala siempre que vayas a desplegar, a etiquetar una versión, a tocar las variables de entorno de producción, o cuando falle un build de Hostinger.
---

# Desplegar en Hostinger

Producción es **`https://seregenera.com`**: una *Node.js Web App* en el plan
Business de Ivan en Hostinger, desde el 2026-10-16. Las operaciones del MCP
piden el `username` de hosting de esa cuenta: sale en `hosting_websites_list`
(campo `username` de `seregenera.com`). No se escribe aquí: es también el usuario
de SFTP, y el repositorio es público. Vercel (`regenera-market.vercel.app`) sigue encendido como respaldo,
pero ya no es producción. El porqué y lo que falta están en
`ROADMAP-MIGRACION.md` (vía B-1) y en el hito
`2026-10-16-produccion-en-hostinger.md`.

## Qué se despliega: siempre un tag

Regla de Jesús (2026-10-16): **lo que llega a producción lleva tag. Un cambio
que no merece tag no se despliega solo: sale con el siguiente.**

| El cambio es… | ¿Tag y despliegue? |
|---|---|
| Funcionalidad nueva o algo que el usuario nota, una corrección de seguridad (también una dependencia con aviso de vulnerabilidad), un cambio de infraestructura, un bloque o una fase cerrados | **Sí** |
| Un texto menor, documentación, skills, hitos, un refactor sin efecto visible | **No**: va a `main` por `entrega-directa` y sale en el próximo tag |

Versión `v0.MINOR.PATCH` (de `flujo-git`): sube `MINOR` cuando entra un bloque o
una fase y `PATCH` para correcciones y seguridad. Ante la duda, decide Jesús.

## Con un comando (desde el 2026-10-17)

Con el tag ya empujado (pasos 1 y 2 de abajo), los pasos 3 a 7 los hace
`scripts/desplegar.mts`: arma el zip, lo sube por SFTP, compila con la API,
sigue el registro, comprueba producción (incluido que `/auth/callback` no mande
a `0.0.0.0`) y borra los zips viejos del PC.

```bash
node --env-file=.env scripts/desplegar.mts vX.Y.Z
node --env-file=.env scripts/desplegar.mts vX.Y.Z --sin-subir   # si el zip se subió a mano
```

### Subir sin hPanel: la llave SSH, una sola vez por PC

La API compila pero no deja subir con el acceso compartido (paso 4), así que el
script sube por SFTP con una llave propia, sin contraseña guardada en ningún
lado. **Se descartó automatizar hPanel con Selenium**: captcha y segundo factor
en el login, la contraseña de una cuenta que entra a todo el hosting de Ivan
guardada en un script, y una pantalla que cambia sin avisar.

1. La crea la persona (no el agente: es una credencial nueva en su PC):
   `ssh-keygen -t ed25519 -f ~/.ssh/seregenera_hostinger -N "" -C "despliegue seregenera.com"`
2. hPanel → `seregenera.com` → Avanzado → **Acceso SSH**: activarlo si está
   apagado, anotar IP y puerto, y en «Claves SSH» agregar el contenido de
   `~/.ssh/seregenera_hostinger.pub`. Si el acceso compartido no deja ver esa
   pantalla, lo hace Ivan una vez desde su cuenta.
3. En el `.env`: `HOSTINGER_SSH_HOST` y `HOSTINGER_SSH_PORT` (`docs/VARIABLES.md`).

La llave privada no tiene frase de paso para que el script corra solo: quien
tenga ese archivo puede escribir en el sitio. Si el PC se pierde o se comparte,
se borra la clave en esa misma pantalla de hPanel.

## Los pasos, a mano

**1. `main` en verde.** Sobre `main` al día: `npm run build`, `npx tsc --noEmit`,
`npx eslint .` y `npm test`, los cuatro limpios.

**2. El tag**, anotado y sobre `origin/main`:

```bash
git fetch origin --tags
git tag -a vX.Y.Z origin/main -m "vX.Y.Z: <qué trae, en una línea>"
git push origin vX.Y.Z
```

**3. El zip**, plano: con `package.json` en la raíz. El zip que da GitHub mete
todo dentro de una carpeta `regenera-market-X.Y.Z/` y obliga a cambiar el
directorio raíz en Hostinger.

```bash
mkdir -p outputs/despliegue
git archive --format=zip -o outputs/despliegue/seregenera-vX.Y.Z.zip vX.Y.Z
```

`git archive` empaqueta solo lo versionado: ni el `.env`, ni `node_modules`, ni
`outputs/` entran. `outputs/` está en el `.gitignore`.

**4. Subirlo: lo hace la persona, no el agente.** hPanel → selector de cuenta
(acceso de administrador a la cuenta de Ivan) → Sitios web → `seregenera.com` →
Administrador de archivos → `public_html` → subir el zip. **Por API no se puede:**
con el acceso compartido, `hosting_files_generate-upload-url` responde 404 en
todos los sitios del plan.

**5. Compilar con el MCP.** Antes, comprobar que el zip está
(`hosting_files_list-website-and-directories`) y que no hay un build en marcha
(`hosting_nodejs_list-builds`).

```
hosting_nodejs_start-build
  username: <el de hosting_websites_list>   domain: seregenera.com
  node_version: 22            app_type: next
  root_directory: "."         output_directory: ".next"
  build_script: "build"       package_manager: npm
  source_type: archive        source_options: { archive_path: "seregenera-vX.Y.Z.zip" }
```

Se sigue con `hosting_nodejs_build` (estado) y `hosting_nodejs_build-logs`
(pasando `from_line` para traer solo lo nuevo). Tarda alrededor de un minuto. Un
build fallido **no tumba** la versión que está corriendo; si falla,
`hosting_nodejs_analyse-failed-build` da una pista, pero el registro manda.

**6. Comprobar desde fuera:**

```bash
B=https://seregenera.com
for p in / /catalogo /proveedores /entrar /registro /api/latido /robots.txt; do
  curl -s -o /dev/null -w "%{http_code}  $p\n" "$B$p"; done
curl -s $B/catalogo | grep -o 'href="/oferta/[a-z0-9-]*"' | sort -u | wc -l   # ofertas: que no sea 0
curl -sI $B | grep -iE "content-security-policy|strict-transport|x-frame"
```

Y `hosting_nodejs_list-vulnerabilities`: vacío quiere decir que el último
escaneo no encontró nada (el escaneo es periódico, puede ir atrasado). Lo visual
lo revisa Jesús en el navegador.

**7. Limpiar: queda solo la versión vigente.**

- **`public_html`:** al publicar con éxito, Hostinger sincroniza la carpeta y
  **borra el zip solo**. Comprobar con el listado que queda únicamente
  `.htaccess`. Si quedó un zip, se borra.
- **En el PC:** en `outputs/despliegue/` queda **solo** el zip recién
  desplegado. Los anteriores se borran **después** de comprobar el paso 6, no
  antes: si la versión nueva falla, la anterior es la vuelta atrás.

```bash
find outputs/despliegue -name 'seregenera-*.zip' ! -name 'seregenera-vX.Y.Z.zip' -delete
```

**8.** Si el tag cierra algo estructural: hito (`registrar-hito`) y
`docs/ESTADO.md`.

## Volver a una versión anterior

El mismo procedimiento con el tag anterior: `git archive` de ese tag, subirlo,
compilar. Ningún archivo se edita a mano en el servidor: cada despliegue lo
sobrescribe.

## Las variables de producción

Viven en el panel de la Web App (hPanel → `seregenera.com` → Variables de
entorno). Los nombres y para qué sirve cada una, en `docs/VARIABLES.md`.

> ⚠️ **Desde el 2026-10-17 producción corre con `BASE_DE_DATOS=mysql`** (y las
> `MYSQL_*` y `ALMACEN_CARPETA`). Si se pierde en un cambio de variables, la app
> vuelve **sin avisar** a Supabase con los datos de ese día y empieza a escribir
> allí: los datos quedan partidos en dos. Después de tocar variables, comprobar
> que siguen las siete del modo MySQL. Ver `docs/MODO-MYSQL.md`.

- **`hosting_nodejs_replace-environment-variables` reemplaza el juego entero**:
  lo que no se manda, se borra. El agente no conoce `SMTP_PASSWORD` (la puso
  Jesús en el panel, y una contraseña no pasa por el chat), así que **un cambio
  de variables lo hace la persona en el panel**. Si el agente tiene que usar esa
  operación, avisa antes de que hay que volver a poner `SMTP_PASSWORD`.
- `hosting_nodejs_list-environment-variables` devuelve los valores enmascarados:
  sirve para ver qué claves hay, nunca para copiar valores.
- Las `NEXT_PUBLIC_*` se graban al compilar: cambiar una exige un build nuevo.
  Las demás (SMTP, BOLD, PAGO) se leen al arrancar y basta el reinicio que hace
  el propio cambio.
- Cambiar una variable desde el panel **recompila sola** la última versión
  subida (visto el 2026-10-16).
- **Nunca se pega el `.env` entero:** trae llaves que la app no usa
  (`SUPABASE_ACCESS_TOKEN`, las de Hostinger) y quedarían en el servidor.

## Trampas conocidas

| Síntoma | Causa | Qué hacer |
|---|---|---|
| `FATAL: An unexpected Turbopack error` en `src/app/globals.css`, «node process exited before we could connect to it» | Turbopack procesa el CSS en un proceso de Node aparte y el entorno de compilación de Hostinger no lo deja conectarse | Por eso `build` es `next build --webpack`. No quitar el `--webpack` |
| `hosting_files_generate-upload-url` → 404 | El acceso compartido no deja subir archivos por API | `scripts/desplegar.mts` (SFTP con llave) o el Administrador de archivos (paso 4) |
| `dns_records_list` → 403 | El dominio es de la cuenta de Ivan | Mirar el DNS público con `nslookup` |
| No se puede compilar con `source_type: git` | No hay GitHub conectado en la cuenta de Ivan (`hosting_git_list-installations` vacío) | Seguir con zip. Si Ivan conecta GitHub, se podrá compilar por rama |
| `mail_orders_list` vacío | La API de correo tampoco ve la cuenta de Ivan | Los buzones se administran en hPanel → Correos electrónicos |
| SMTP en el PC de Jesús: «unable to verify the first certificate» | Avast Web/Mail Shield intercepta el SMTP con un certificado propio | Probar por el 587 con `node --use-system-ca`. Producción no pasa por Avast |
| Se borra el sitio en hPanel | El dominio queda «aparcado» (IP de parking de Hostinger) | Se recrea: Agregar sitio web → Node.js Web App → Subir archivos, con Next.js, Node 22.x, raíz `./`, `npm run build`, npm y `.next`. Nadie lo borra sin avisar |
