/**
 * Un pedido, sin traducir. El traductor de Google
 * (`src/components/selector-idioma.tsx`) manda a sus servidores el texto que
 * traduce, y aquí están el correo, el teléfono y la dirección de quien compra. `translate="no"` lo excluye; `contents` para
 * que el envoltorio no cambie la maqueta. Auditoría del 2026-10-22.
 */
export default function LayoutOrden({ children }: { children: React.ReactNode }) {
  return (
    <div translate="no" className="contents">
      {children}
    </div>
  );
}
