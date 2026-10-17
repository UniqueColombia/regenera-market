# Desplegar es un comando, y `v0.11.2` está en producción

- **Fecha:** 2026-10-17
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `chore/js-despliegue-con-un-comando` (entrega directa); tag `v0.11.2`
- **Fase del roadmap:** — (infraestructura de despliegue)

## Qué se hizo

1. **`scripts/desplegar.mts`** hace los pasos 3 a 7 de `desplegar-hostinger`
   con el tag ya empujado: comprueba que el tag está en `origin/main`, arma el
   zip con `git archive`, lo sube a `public_html` por SFTP, compila con la API de
   Hostinger mostrando el registro, comprueba producción desde fuera y borra los
   zips viejos del PC.
2. **Una llave SSH solo para desplegar**, `~/.ssh/seregenera_hostinger`, creada
   por Jesús y agregada en hPanel → Acceso SSH. El host y el puerto van en el
   `.env` (`HOSTINGER_SSH_HOST`, `HOSTINGER_SSH_PORT`); el usuario se le pide a
   la API.
3. **`v0.11.2` desplegada con el script**, la primera vez. Trae lo del hito
   [del mismo día](2026-10-17-legales-correos-y-modelo-de-pago.md): el botón del
   correo arreglado, los legales del 2026-10-17, la aceptación de términos y el
   plazo de entrega en los correos. Cierra su pendiente «Desplegar».

## Por qué así

**SFTP, porque la API no deja subir.** Con la llave de Jesús la API de Hostinger
compila, lista archivos y lee builds, pero `files/upload-urls` responde 404 con
el acceso compartido a la cuenta de Ivan (el mismo 404 del 2026-10-16). El plan
Business trae SSH, y con una llave no hay contraseña guardada.

**No Selenium sobre hPanel**, que fue lo primero que pidió Jesús. El login tiene
captcha y segundo factor, el script tendría la contraseña de una cuenta que entra
a todo el hosting de Ivan, y la pantalla puede cambiar sin aviso y romperlo en
silencio.

**El script no crea el tag.** Qué versión sale y con qué número lo decide la
persona (paso 2 de la skill); el script solo comprueba que el tag está en `main`
y en GitHub.

**La llave la creó la persona, no el agente**: es una credencial nueva en su PC,
y el clasificador de permisos frenó al agente al intentarlo. Es lo correcto.

## Qué quedó pendiente

- [ ] Ivan, si va a desplegar desde su PC: su propia llave, agregada en la misma
      pantalla de hPanel.
- [ ] La llave no tiene frase de paso: si el PC se pierde o se comparte, se borra
      en hPanel → Acceso SSH.

## Qué se rompe si tocas esto

- **Cambiar `AJUSTES_BUILD`** del script cambia cómo compila producción; son los
  mismos valores que se usaron a mano desde `v0.11.0`.
- **Quitar las comprobaciones del paso 6**: son las que dicen si el despliegue
  sirve. La de `/auth/callback` caza la regresión a `0.0.0.0:3000`.
- **Borrar el zip anterior antes de comprobar**: es la vuelta atrás. El script
  solo borra cuando todas las comprobaciones pasaron.

## Verificación

- `ssh -p 65002 -i ~/.ssh/seregenera_hostinger` con `ls` de `public_html`: entra
  con la llave, solo `.htaccess`.
- `node --env-file=.env scripts/desplegar.mts v0.11.2`: subida, build «Deployment
  completed in 1m 1s», las 10 rutas en 200, 20 ofertas en el catálogo,
  `/auth/callback → https://seregenera.com/entrar?error=sin-codigo` (antes
  `0.0.0.0:3000`), CSP, HSTS y `X-Frame-Options` presentes, `public_html` sin
  zips, y borrado el zip de `v0.11.1` del PC.
- `curl` a producción: los términos traen «Envío y entrega», el NIT y el plazo
  para reclamar; la privacidad, Hostinger e `info@seregenera.com`; `/vender`, la
  casilla de los términos; `/bimi.svg` sale como `image/svg+xml`.
- `hosting_nodejs_list-vulnerabilities`: vacío.
