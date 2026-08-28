## Qué cambia

<!-- Una o dos frases. Qué existe ahora que antes no existía. -->

## Por qué

<!-- El problema que resuelve. Si descartaste una alternativa, dila. -->

## Cómo se probó

<!-- Comandos corridos, rutas visitadas, datos usados. "Funciona" no es una prueba. -->

## Checklist

- [ ] Rama nombrada `<tipo>/<iniciales>-<slug>` y PR contra `staging` (o `hotfix/*` → `main`)
- [ ] `npm run build` en limpio (va primero: genera los tipos de rutas)
- [ ] `npx tsc --noEmit` en limpio
- [ ] `npx eslint .` en limpio
- [ ] Ningún secreto en el diff (`.env.local`, llaves de Supabase o Wompi)
- [ ] Variables de entorno nuevas documentadas en `.env.example`, sin valores
- [ ] Si toca precios, comisiones, órdenes, roles o puntajes: revisado contra la skill `dominio-regenera`
- [ ] Si toca `supabase/migrations/`: migración aditiva, RLS activa, rollback comentado
- [ ] Hito registrado en `.claude/hitos/` si el cambio es estructural

## Requiere autorización explícita

<!-- Marca solo si aplica. Si marcas alguna, no mergees sin el OK escrito de Ivan. -->

- [ ] Migración destructiva (`drop`, `alter column type`, `not null` sobre datos)
- [ ] Cambio en la estrategia de ramas o en el CI
- [ ] Servicio externo nuevo con costo
- [ ] Cambio en la tasa de comisión o en el tope de certificaciones
