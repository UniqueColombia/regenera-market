/**
 * Las pruebas de `mysql/pruebas/` hablan con la base de pruebas de Hostinger:
 * leen las `MYSQL_*` del `.env` de la máquina. Sin `.env` (el CI) no hace nada,
 * y las pruebas se saltan solas (`HAY_MYSQL`).
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
