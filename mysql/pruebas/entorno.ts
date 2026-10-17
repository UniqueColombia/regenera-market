/**
 * Las pruebas de `mysql/pruebas/` hablan con la base de pruebas de Hostinger:
 * leen las `MYSQL_*` del `.env` de la máquina. Sin `.env` (el CI) no hace nada,
 * y las pruebas se saltan solas (`HAY_MYSQL`).
 */
try {
  process.loadEnvFile(".env");
} catch {
  /* sin .env: las pruebas se saltan */
}
