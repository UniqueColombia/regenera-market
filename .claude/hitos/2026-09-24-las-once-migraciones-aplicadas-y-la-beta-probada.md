# Las once migraciones están aplicadas, y la beta se probó con datos reales

- **Fecha:** 2026-09-24
- **Autor:** Jesús Seiler (`seiler18`) · con el visto bueno de Ivan Duarte (`UniqueColombia`) sobre la comisión
- **Rama / PR:** `feat/js-sesion-limites-y-puntos` → #59
- **Fase del roadmap:** 1 y 2 — cierre de lo que arrastraba `docs/ESTADO.md`

## Qué se hizo

Nada de código: **se ejecutó lo que ya estaba escrito, y se comprobó lo que ya
estaba desplegado.** Cuatro cosas que este repositorio arrastraba como pendientes
desde el 2026-09-17:

1. **Se aplicaron las migraciones `0009`, `0010` y `0011`** contra la base de
   producción. Con eso **no queda ninguna migración escrita sin correr**, que es
   la primera vez desde que existe `supabase/migrations/`.
2. **Se probó el alta de proveedor de punta a punta en producción.** Era el
   camino que se había revisado línea a línea sin ejecutarlo nunca.
3. **Se probó la Comunidad en producción**, incluida la reacción y su retirada.
4. **Ivan confirmó la comisión 12 / 10 / 8 %.**

## Por qué así

### Por qué esto merece un hito aunque no cambie una sola línea

Porque aplicar una migración **es** el cambio. El archivo SQL lleva en el
repositorio desde que se escribió, y leerlo no dice si corrió: un `git log` no
distingue «escrita» de «aplicada», y esa distinción es la que decide si el
código que se despliega encima funciona o responde 500. La skill `registrar-hito`
lo pone explícito: «se aplicó una migración contra una base real» es motivo de
hito.

Y porque `docs/ESTADO.md` **caduca** a propósito. Lo que ahí dice «resuelto» deja
de ser legible en cuanto alguien reescribe el archivo en la siguiente tanda; lo
que dice un hito se queda. Si dentro de seis meses alguien pregunta «¿cuándo
empezó a contar el tope de publicaciones?», la respuesta es esta fecha y no la
del commit que escribió el SQL.

### Las tres migraciones se aplicaron el mismo día porque ninguna obligaba a un orden

Es la diferencia con las seis primeras. La `0006` había que correrla **antes** de
desplegar —el código leía columnas que aún no existían, así que al revés el
catálogo entero respondía 500— y lo mismo la `0007` y la `0008`. Las tres de hoy
no:

- **`0009`** solo reemplaza el cuerpo de `postular_proveedor()`.
- **`0010`** solo agrega: `page_views` y dos funciones. Mientras faltaba, la
  medición fallaba en silencio y `/admin/analiticas` lo decía.
- **`0011`** son dos triggers nuevos y dos funciones reemplazadas.

Consecuencia práctica de haber aplicado la `0011` antes de desplegar su código:
**los límites de la Comunidad ya rigen, pero quien tope ve el error genérico** en
vez del mensaje en español. Se arregla solo al desplegar `v0.9.0`; no rompe nada
mientras tanto.

### El contador de reacciones dejó de ser una promesa

La prueba que importaba de la Comunidad era reaccionar y quitar la reacción,
porque es la que **falla en silencio**: el número sube un instante por el
optimismo del cliente y vuelve a su sitio al llegar la respuesta, sin error en
ninguna parte. Es el síntoma que se reportó en su día como «le da clic otro
usuario y no se suma». Probado en producción, sube y baja.

### La comisión ya no es una decisión unilateral

12 / 10 / 8 % salió a producción el 2026-09-17 sin el visto bueno de Ivan — una
decisión consciente de Jesús para no frenar el lanzamiento, anotada como
pendiente desde entonces porque **la comisión es negocio, no código**. Ivan la
confirmó. Queda cerrado.

## Qué quedó pendiente

- **Las cinco `SMTP_*` en Vercel.** Es lo único de la lista vieja que sigue
  abierto y lo único que bloquea algo: sin ellas nadie recibe el correo de
  respaldo de su postulación, y no hay ningún error que lo delate. Solo Ivan.
- **`SESION_SECRETO` en Vercel**, de la tanda de endurecimiento — ver
  [el hito de esa tanda](2026-09-24-sesion-que-caduca-limites-y-puntos-mas-caros.md).
- **Desplegar `v0.9.0`**, que es lo que traduce los topes de la `0011` a
  mensajes que una persona entienda.
- **Las tres variables de Supabase en el entorno *Preview*.** Siguen sin poner:
  los despliegues de vista previa de cada PR compilan y luego fallan en runtime.

## Qué se rompe si tocas esto

- **Las once migraciones son inmutables.** Ninguna de `supabase/migrations/` se
  edita ya: lo que haya que cambiar va en una `0012`. Editar un archivo aplicado
  deja el repositorio diciendo una cosa y la base teniendo otra, y nadie se
  entera hasta que alguien clona y siembra de cero.
- **Los puntos de experiencia que se otorguen a partir de hoy son los nuevos.**
  `experience_events` conserva los viejos tal cual; no se recalculó nada. Si
  alguien compara una fila de agosto con una de octubre y ve 30 contra 10, no es
  un bug.

## Verificación

Todo contra la base de producción, por el editor SQL del panel de Supabase:

```sql
-- 0009: devuelve también provider_id
select pg_get_function_result(oid) from pg_proc where proname = 'postular_proveedor';

-- 0010: la tabla existe
select to_regclass('public.page_views');

-- 0011: los dos triggers de ritmo existen — 2 = sí
select count(*) from pg_trigger
 where tgname in ('community_posts_ritmo', 'community_reactions_ritmo');
```

Y a mano, en producción: alta de proveedor de punta a punta desde `/vender`;
publicar en `/comunidad` a título personal y firmando con una empresa; reaccionar
y quitar la reacción.

**Lo que no se comprobó:** las ACL de `otorgar_experiencia()` después de la
`0011` (`select proname, proacl from pg_proc where proname in
('otorgar_experiencia', 'experiencia_topada');` — no debe aparecer `anon=X` ni
`authenticated=X`), y subir una foto de perfil desde un teléfono, que sigue sin
ejecutar nadie desde la `0008`.
