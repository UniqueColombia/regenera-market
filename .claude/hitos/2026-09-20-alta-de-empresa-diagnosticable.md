# El alta de una empresa deja rastro cuando falla, y trae sus dos imágenes

- **Fecha:** 2026-09-20
- **Autor:** Jesús Seiler (`seiler18`)
- **Rama / PR:** `fix/js-alta-empresa-y-portada` → #53
- **Fase del roadmap:** 1 y 2 — corrección y perfil de empresa

## Qué se hizo

Salió de un reporte de uso: «cuando intento crear la empresa da error, ¿quizás
no puedo usar el mismo correo del usuario? Después del error me lleva a la
ventana de error, le doy a reintentar y me lleva a la ventana anterior pero no
crea la empresa».

**No se pudo reproducir leyendo el código.** Se recorrió el camino entero
—validación, RPC, correo de respaldo, plantilla— y ninguna rama explica una
excepción. Así que lo que se arregló es lo que hacía imposible averiguarlo, más
las tres trampas que sí se encontraron por el camino:

1. **Cualquier fallo del alta deja ahora un código en pantalla y en el
   registro.** Seis caracteres que la persona puede dictar y que localizan la
   línea exacta en los registros del servidor.
2. **El correo de respaldo salió del camino crítico.** Si falla después de que
   la empresa ya existe, se apunta y se sigue.
3. **El límite de tres postulaciones por correo al día deja de aplicar a quien
   tiene sesión** (migración `0009`).
4. **Todos los topes de longitud dicen su mensaje en español**, se anuncian
   antes de pasarse y el navegador impide superarlos.

Y lo que se pidió además:

- **La empresa tiene dos imágenes**, no una: el logo y la portada de su ficha.
  Las dos se suben desde `/cuenta/empresa` y **también desde la pantalla que
  sigue al alta**, que es cuando apetece hacerlo.
- **El rol deja de decir «Proveedor»** y pasa a decir qué puede hacer la
  persona: «Comprar», o «Comprar y vender» si gestiona una empresa.

## Por qué así

### Un fallo que no deja rastro es un fallo que no se arregla

Este es el aprendizaje de la tanda, y es lo que justifica `src/lib/incidencias.ts`.

Una Server Action que lanza manda a la persona a `error.tsx` y **no deja nada
que relacione lo que vio con lo que pasó**. El registro del servidor tiene el
error; la persona tiene una pantalla. Entre los dos no hay hilo, así que «me dio
error al registrar mi empresa» es todo lo que se puede reportar — y con eso no
se arregla nada. Peor todavía es el caso contrario: una acción que **captura**
su fallo y devuelve un mensaje amable no genera ni el `digest` de Next, así que
el fallo no existe para nadie más que para quien lo sufrió.

El código se dicta por teléfono, así que no lleva vocales (para que no salga
ninguna palabra por accidente) ni los caracteres que se confunden al leer.

**Lo que no se registra es tan importante como lo que sí.** En los datos que
acompañan al fallo van el tipo de organización, el país y cuántos caracteres
tenía la descripción — lo que hace falta para reproducirlo. No van el nombre, el
correo ni el teléfono: son de una persona identificable, y los registros de
Vercel los lee más gente y viven más tiempo que la postulación.

### El correo de respaldo no puede tumbar un alta que ya ocurrió

Cuando el RPC devuelve, la transacción está confirmada: la empresa existe. Si el
correo falla después, devolver un error hace que la persona lo intente otra vez
creyendo que no se guardó nada — y **esa segunda vez chocaba contra el límite de
postulaciones**. Un fallo de cortesía se convertía en un bloqueo de 24 horas.

Es la regla de `nueva-integracion` llevada hasta el final: el fallo de un
servicio externo no es un error de nuestra aplicación.

### El límite por correo castigaba justo a quien insiste porque algo le falló

`postular_proveedor()` rechazaba la cuarta postulación del mismo correo en 24
horas. Existe para frenar a un robot que encuentre el formulario, que es público
a propósito. Pero contaba por correo sin mirar si había sesión, y el resultado
era la trampa exacta que describió el reporte: alguien con cuenta intenta dar de
alta su empresa, algo falla, reintenta —que es lo que hace cualquiera— y al
cuarto intento se queda sin poder registrarla hasta el día siguiente.

Con sesión el tope no aporta nada: la función **ya** impide que una persona cree
dos empresas —si ya es dueña de una, le enlaza la postulación a la que tiene—,
así que insistir no ensucia el catálogo. Y una sesión es una señal mucho más
fuerte que un correo: para tenerla hubo que recibir un código en un buzón real.

Sin sesión el tope sigue igual de estricto.

**Sobre la duda del reporte:** usar el mismo correo de la cuenta para la empresa
siempre estuvo permitido y es lo esperable —el correo de la empresa suele ser el
de quien la dirige—. No hay ninguna restricción de unicidad sobre
`providers.email`. Lo que había era este tope, que lo parecía.

### Las imágenes se suben *después* del alta, y es por seguridad

La petición decía «en el último apartado de Registrar empresa permita colocar un
icono y una imagen de fondo». Se resolvió en la pantalla que sustituye al
formulario al terminar, y no como un paso más dentro de él, por un motivo que no
es de diseño:

**La carpeta de Storage donde van esas imágenes es el id de la empresa**, y la
política que autoriza la subida comprueba que quien escribe gestione esa empresa
(`manages_provider()`). Antes de que la empresa exista no hay carpeta ni hay nada
que comprobar, así que la subida tendría que ir a un sitio provisional y moverse
después: más piezas, y una de ellas escribible por alguien que todavía no es
proveedor.

Puesto al final es además el momento en que apetece: la ficha acaba de nacer y
está vacía.

### Dos imágenes, un bucket

La portada va a `logos/<provider_id>/portada.webp` y el logo a
`logos/<provider_id>/imagen.webp`. **No hizo falta bucket ni política nueva**:
lo que la política comprueba es la primera carpeta de la ruta, que sigue siendo
el id de la empresa.

Se recortan distinto y eso sí importa: el logo a cuadrado, la portada a 16:9 y
1600 px de ancho. Una portada recortada a cuadrado y luego estirada en un banner
apaisado se ve deformada, y el encuadre que la persona aprobó no es el que acaba
viendo un comprador.

La ficha pública elige portada en tres escalones —la subida, la foto de una de
sus ofertas, el retrato genérico— para que **no haya ficha sin imagen en ningún
momento**. Una ficha con un hueco gris arriba se lee como rota, no como
pendiente.

### «Proveedor» era una etiqueta falsa

Nadie deja de ser comprador por vender. Un hotel que además vende sus excedentes
sigue comprando, y llamarlo «Proveedor» a secas le sugería que esa parte del
sitio ya no era para él. Ahora dice qué puede hacer: «Comprar», o «Comprar y
vender».

Y se decide por la **empresa**, no por el rol: `user_roles` dice que alguien
vende, `provider_members` dice de qué empresa — y sin empresa no hay nada que
vender, aunque el rol esté puesto.

## Qué quedó pendiente

- **La causa original sigue sin identificarse.** Lo que hay ahora es la
  instrumentación para cazarla en el siguiente intento. Si vuelve a pasar, el
  código de la pantalla se busca en los registros de Vercel (`[postular]` o
  `[postular-rpc]`) y ahí está el motivo completo con su traza.
- **Aplicar la `0009`.** Es la primera migración de este repositorio que se
  puede aplicar antes o después de desplegar: solo reemplaza el cuerpo de una
  función y no toca ninguna tabla, dato ni política.
- El proveedor sigue sin poder editar el resto de su ficha (descripción,
  titular, contacto). Con logo y portada resueltos, es lo único que queda para
  que `perfil_completo` sea alcanzable por quien tenga una postulación corta.

## Qué se rompe si tocas esto

- **Una constante que comparten servidor y cliente no puede vivir en un archivo
  con `"use server"`.** Se vivió en esta misma tanda: `LIMITES` estuvo unos
  minutos exportado desde `actions.ts`, el build pasó sin una queja, y el HTML
  servido salió con `maxLength="t"` — o sea, sin ningún tope en ningún campo. Un
  módulo `"use server"` solo puede exportar funciones asíncronas; lo que un
  componente de cliente recibe al importar otra cosa de ahí es una referencia,
  no el valor. **No lo detecta el compilador**: se detectó leyendo el HTML.
  Por eso existe `src/app/vender/limites.ts`.
- **Nada después del RPC puede convertir el alta en un error.** Si se agrega un
  paso ahí (una notificación, una métrica), va dentro de su propio `try`.
- **La primera carpeta de la ruta en Storage es parte del control de acceso.**
  Las dos imágenes de una empresa comparten carpeta a propósito; si alguna se
  moviera a otra raíz, dejaría de estar protegida por la política de la 0008.
- **`providers.cover_url`** se llenaba con nada hasta ahora. Si algún proceso lo
  escribe desde otro sitio, la ficha cambia de portada sin que nadie lo pida.

## Verificación

```bash
npm run build        # limpio
npx tsc --noEmit     # limpio
npx eslint src --max-warnings 0   # limpio
```

Contra `next start` local: `/vender` y la ficha de un proveedor responden 200,
`/cuenta/empresa` redirige a `/entrar` sin sesión. En el HTML servido de
`/vender`, los ocho campos traen su `maxLength` con el número correcto —que es
justo lo que estaba roto y no se veía compilando.

**Lo que no se comprobó:** el alta de punta a punta contra la base. Hacerlo
crearía una empresa de prueba en producción, y este repositorio no tiene entorno
de pruebas con datos — los despliegues de vista previa de Vercel no tienen
variables de entorno (ver `docs/ESTADO.md`). Lo comprueba una persona, y ahora
si falla trae un código.
