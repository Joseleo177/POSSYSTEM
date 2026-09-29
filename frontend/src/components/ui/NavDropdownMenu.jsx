/**
 * Menú desplegable de un grupo de la barra de navegación de un módulo (Contabilidad →
 * Movimientos, Reportes → …). Va dentro de un contenedor `relative`, debajo del botón del grupo.
 *
 * El contenedor lleva margen interno para que el resaltado de cada opción no llegue al borde
 * —antes pegaba contra él y las esquinas redondeadas no coincidían—, y la opción activa se
 * marca con un check además del color, para no depender solo del tono.
 *
 * Props:
 *   items    – claves de las opciones
 *   active   – clave de la opción activa
 *   onSelect – fn(clave)
 *   getLabel – fn(clave) → texto; por defecto la clave misma
 */
export default function NavDropdownMenu({ items, active, onSelect, getLabel = (k) => k }) {
  return (
    <div className="absolute top-full left-0 mt-1.5 min-w-[200px] p-1.5 bg-white dark:bg-surface-dark-3 border border-border/40 dark:border-white/10 rounded-xl shadow-xl shadow-black/10 dark:shadow-black/40 z-50">
      {items.map(key => {
        const isActive = key === active;
        return (
          <button
            key={key}
            onClick={() => onSelect(key)}
            className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-left text-[12px] font-semibold transition-colors ${
              isActive
                ? "bg-brand-500/10 text-brand-600 dark:text-brand-400"
                : "text-content dark:text-white/75 hover:bg-surface-2 dark:hover:bg-white/5"
            }`}
          >
            <span className="whitespace-nowrap">{getLabel(key)}</span>
            {isActive && (
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
        );
      })}
    </div>
  );
}
