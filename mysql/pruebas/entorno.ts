/**
 * Las pruebas de `mysql/pruebas/` hablan con un MariaDB: el del job `mysql` del
 * CI (las `MYSQL_*` vienen del entorno) o uno propio en el PC (del `.env`). La
 * base de pruebas de Hostinger se borró el 2026-10-17. Sin `MYSQL_*`, las
 * pruebas se saltan solas (`HAY_MYSQL`).
 *
 * **El SMTP se apaga aquí**: las pruebas de cuentas mandan códigos, y con el
 * buzón de `info@seregenera.com` configurado saldrían correos de verdad a
 * direcciones inventadas. Sin SMTP, `enviarCorreo()` los escribe en la consola.
 */
try {
  process.loadEnvFile(".env");
} catch {
  /* sin .env: las pruebas se saltan */
}
for (const v of ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"]) delete process.env[v];
process.env.BASE_DE_DATOS = "mysql";
