/**
 * Lo que se ve mientras llega una página que consulta la base.
 *
 * Los usan los `loading.tsx` de las rutas con datos. Antes, al navegar al
 * catálogo la pantalla se quedaba con la página anterior hasta que respondía
 * Postgres, sin ninguna señal de que algo estaba pasando; con una conexión
 * lenta eso se lee como «no funcionó el clic» y la gente vuelve a pulsar.
 *
 * Imitan la forma de lo que va a llegar —cabecera, rejilla de tarjetas— para
 * que el cambio no mueva la página. Son de servidor: no tienen estado, solo un
 * brillo en CSS (`animate-brillo`, en `globals.css`).
 */

function Barra({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`animate-brillo rounded-full bg-sand motion-reduce:animate-none ${className}`}
    />
  );
}

export function EsqueletoRejilla({
  titulo,
  tarjetas = 6,
}: {
  /** Lo que lee un lector de pantalla mientras espera. */
  titulo: string;
  tarjetas?: number;
}) {
  return (
    <div className="container-page py-10" aria-busy="true">
      <span className="sr-only" role="status">
        {titulo}
      </span>
      <Barra className="h-9 w-72 max-w-full" />
      <Barra className="mt-4 h-4 w-96 max-w-full" />
      <div className="mt-8 grid gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-20 animate-brillo rounded-xl bg-white ring-1 ring-hairline motion-reduce:animate-none" />
        ))}
      </div>
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: tarjetas }, (_, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-xl bg-white ring-1 ring-hairline"
            // Escalonado: si todas brillaran a la vez, la rejilla entera
            // parpadearía como un bloque.
            style={{ animationDelay: `${i * 90}ms` }}
          >
            <div
              className="aspect-[4/3] animate-brillo bg-sand motion-reduce:animate-none"
              style={{ animationDelay: `${i * 90}ms` }}
            />
            <div className="space-y-2 p-5">
              <Barra className="h-3 w-24" />
              <Barra className="h-5 w-4/5" />
              <Barra className="h-3 w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function EsqueletoFicha({ titulo }: { titulo: string }) {
  return (
    <div className="container-page py-10" aria-busy="true">
      <span className="sr-only" role="status">
        {titulo}
      </span>
      <Barra className="h-4 w-40" />
      <div className="mt-6 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div className="aspect-[4/3] animate-brillo rounded-xl bg-sand motion-reduce:animate-none" />
        <div className="space-y-4">
          <Barra className="h-3 w-24" />
          <Barra className="h-9 w-full" />
          <Barra className="h-4 w-5/6" />
          <Barra className="h-4 w-2/3" />
          <Barra className="mt-6 h-12 w-48" />
        </div>
      </div>
    </div>
  );
}

export function EsqueletoTexto({ titulo }: { titulo: string }) {
  return (
    <div className="container-page max-w-2xl py-12" aria-busy="true">
      <span className="sr-only" role="status">
        {titulo}
      </span>
      <Barra className="h-3 w-28" />
      <Barra className="mt-4 h-9 w-80 max-w-full" />
      <div className="mt-8 space-y-3">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-16 animate-brillo rounded-xl bg-white ring-1 ring-hairline motion-reduce:animate-none" />
        ))}
      </div>
    </div>
  );
}
