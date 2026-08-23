---
name: registro-de-hitos
description: Cómo decidir si algo es un hito de Regenera Market y cómo escribirlo en .claude/hitos/. Úsala al terminar una funcionalidad completa, al tomar una decisión de arquitectura o de negocio, cuando el usuario diga "registra esto" o "guarda esto", y antes de cerrar una sesión de trabajo larga.
---

# Registro de hitos

La bitácora vive en `.claude/hitos/`. Su razón de existir: git guarda **qué**
cambió, y nada más. Por qué se eligió Wompi, qué alternativa se descartó, cuál
decisión la tomó el usuario y cuál la asumió Claude sin preguntar — eso se pierde
entre sesiones si no se escribe.

## Primero: ¿es un hito?

Sí, si el cambio altera **lo que el proyecto es o cómo se decide**:

- Una funcionalidad de punta a punta que un usuario puede usar
- Una decisión con alternativas descartadas
- Un servicio externo que entra o sale (Supabase, Wompi, dominio, analítica)
- Un cambio de reglas de negocio (comisión, niveles, taxonomía)
- Cualquier cosa que el usuario pida registrar explícitamente

No, si es: arreglo de estilo, renombre, formato, dependencia sin efecto visible,
corrección de texto, o aplicar una decisión que ya está registrada.

**Ante la duda, no escribas un hito.** Una bitácora con veinte entradas triviales
no se lee, y entonces tampoco se leen las cinco que importan.

## Procedimiento

1. **Buscar el número.** `ls .claude/hitos/` → el siguiente correlativo libre.
   Los números no se reutilizan nunca, ni aunque el hito se revierta.
2. **Copiar `PLANTILLA.md`** a `NNNN-slug-en-kebab-case.md`.
3. **Rellenar.** Reglas de escritura abajo.
4. **Actualizar el índice** de `.claude/hitos/README.md`, la fila nueva arriba
   de todo.
5. **Reconciliar pendientes.** Si el hito cierra algo listado en `README.md` del
   proyecto o en un hito anterior, táchalo ahí también. Un pendiente que aparece
   resuelto en un sitio y abierto en otro es peor que no tenerlo escrito.
6. **Si cambió cómo se trabaja** —no solo qué se construyó— actualiza también
   `CLAUDE.md` o la habilidad correspondiente.

## Cómo se escribe

- **En español**, voz activa, presente o pretérito. Sin adjetivos de venta:
  "potente", "robusto", "moderno" no dicen nada.
- **El "Por qué" es la sección que importa.** Si solo vas a escribir bien una,
  que sea esa. Incluye la alternativa descartada y la razón.
- **Marca el origen de cada decisión.** `*(usuario)*` o `*(Claude)*`, y para las
  que Claude asumió sin preguntar, `*(Claude, sin confirmar explícitamente)*`.
  El usuario prefiere avanzar rápido antes que responder cuestionarios, así que
  hay decisiones tomadas por defecto que **hay que confirmar antes de que se
  vuelvan caras de revertir**. Marcarlas es la única forma de encontrarlas
  después.
- **"Queda abierto" en casillas** `- [ ]`, cada una con el archivo o la
  condición que la desbloquea. Un pendiente sin ancla no se retoma.
- **Estado real, sin adornos.** Si algo quedó a medias, se dice. El `README.md`
  del proyecto ya sostiene ese tono; los hitos también.

## Al revertir

No se borra el archivo. Se cambia su estado a
`Revertido por [NNNN](NNNN-slug.md)` y se escribe el hito nuevo explicando por
qué no funcionó. El fracaso documentado es lo que evita repetirlo en seis meses.
