/**
 * Solo para el contenido: el layout del panel —título y pestañas— ya está
 * pintado y no se toca, así que al cambiar de pestaña lo único que parpadea es
 * lo que de verdad está cargando. Por eso no usa `EsqueletoTexto`, que trae su
 * propio `container-page` y duplicaría el margen dentro del panel.
 */
export default function Cargando() {
  return (
    <div className="mt-8 space-y-3" aria-busy="true">
      <span className="sr-only" role="status">
        Cargando
      </span>
      {Array.from({ length: 5 }, (_, i) => (
        <div
          key={i}
          aria-hidden
          className="h-16 animate-brillo rounded-xl bg-white ring-1 ring-hairline motion-reduce:animate-none"
          style={{ animationDelay: `${i * 90}ms` }}
        />
      ))}
    </div>
  );
}
