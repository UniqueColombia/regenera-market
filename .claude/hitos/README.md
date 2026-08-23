# Hitos de Regenera Market

Bitácora del proyecto. Un hito es **un cambio que altera lo que el proyecto es o
cómo se decide**: una funcionalidad completa, una decisión de arquitectura, un
proveedor externo que entra o sale, un cambio de alcance del negocio.

No es un changelog de commits. El historial de git ya cuenta qué líneas
cambiaron; los hitos cuentan **por qué** y **qué queda abierto** — que es lo que
git no guarda y lo que se pierde entre sesiones.

## Qué se registra y qué no

| Se registra | No se registra |
|---|---|
| Una funcionalidad de punta a punta (checkout, panel de proveedor) | Arreglos de estilo, renombres, formato |
| Una decisión con alternativas descartadas (Wompi vs. Stripe) | Aplicar una decisión ya registrada |
| Conectar Supabase, dominio, pasarela, analítica | Bumps de dependencias sin efecto visible |
| Un cambio de reglas de negocio (comisión, niveles de verificación) | Correcciones de texto o traducciones |
| Algo que el usuario dice explícitamente "registra esto" | Trabajo en curso sin cerrar |

## Convención

Un archivo por hito: `NNNN-slug-en-kebab-case.md`, numeración correlativa de
cuatro dígitos que **nunca se reutiliza**. Aunque un hito se revierta, su archivo
se queda y se marca como revertido: el registro es un diario, no un estado.

Se copia `PLANTILLA.md` y se rellena. Todo en español.

## Cómo se actualiza

Al cerrar un hito:

1. Crear el archivo con el siguiente número libre.
2. Agregarlo al índice de abajo, **arriba de todo** (más reciente primero).
3. Si el hito cierra pendientes que estaban en `README.md` del proyecto o en un
   hito anterior, actualizarlos también. Un pendiente resuelto en dos sitios
   contradictorios es peor que no tenerlo escrito.

La habilidad `registro-de-hitos` (`.claude/skills/registro-de-hitos/`) tiene el
procedimiento detallado que sigue Claude.

## Índice

| # | Fecha | Hito | Estado |
|---|---|---|---|
| [0002](0002-estructura-de-conocimiento.md) | 2026-08-19 | Estructura de conocimiento del proyecto (orquestador, hitos, habilidades) | Cerrado |
| [0001](0001-mvp-navegable.md) | 2026-08-17 | MVP navegable con catálogo, carrito y checkout en memoria | Cerrado |
