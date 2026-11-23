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
 *   align    – "right" para el último grupo de la barra: abierto hacia la derecha se salía
 *              de la pantalla del teléfono
 *
 * Además, al abrirse se mide: si igual se sale por un costado (en el teléfono la barra se
 * parte en dos renglones y cualquier grupo puede quedar pegado al borde —pasó con "Pagos"),
 * se corre lo justo para quedar a 8 px del borde.
 */
import { useLayoutEffect, useRef, useState } from "react";

export default function NavDropdownMenu({ items, active, onSelect, getLabel = (k) => k, align = "left" }) {
  const ref = useRef(null);
  const [shift, setShift] = useState(0);
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const vw = document.documentElement.clientWidth;
    if (r.right > vw - 8) setShift(vw - 8 - r.right);
    else if (r.left < 8) setShift(8 - r.left);
  }, []);
  return (
    <div ref={ref} style={shift ? { transform: `translateX(${shift}px)` } : undefined}
      className={`absolute top-full ${align === "right" ? "right-0" : "left-0"} mt-1.5 min-w-[200px] p-1.5 bg-white dark:bg-surface-dark-3 border border-border/40 dark:border-white/10 rounded-xl shadow-xl shadow-black/10 dark:shadow-black/40 z-50`}>
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
