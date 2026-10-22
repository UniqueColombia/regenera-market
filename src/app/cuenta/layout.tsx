/**
 * Tu cuenta y tu empresa, sin traducir. El traductor de Google
 * (`src/components/selector-idioma.tsx`) manda a sus servidores el texto que
 * traduce, y aquí están tu nombre, tu correo, tu teléfono y los datos de quienes te compran. `translate="no"` lo excluye; `contents` para
 * que el envoltorio no cambie la maqueta. Auditoría del 2026-10-22.
 */
export default function LayoutCuenta({ children }: { children: React.ReactNode }) {
  return (
    <div translate="no" className="contents">
      {children}
    </div>
  );
}
