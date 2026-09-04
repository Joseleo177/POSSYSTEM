import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";

// icon: nodo opcional que se dibuja DENTRO de la caja, antes de la etiqueta. Antes había
// que superponerlo por fuera con position absolute y padding, y como `className` se aplica
// al contenedor —no a la caja visible— el icono terminaba fuera del recuadro.
// boxClassName: clases para la caja visible, no para el contenedor. `className` envuelve al
// componente entero, así que no alcanza para retocar la caja —por ejemplo igualar el radio y
// el tamaño de letra a los de un input hermano, como en el catálogo público—. Vacío por
// defecto: los usos existentes se ven igual que siempre.
// menuMinWidth: ancho mínimo del desplegable, en px. El menú copia el ancho de la caja, que
// es lo correcto casi siempre; pero con una caja deliberadamente angosta —el prefijo V-/J- de
// un documento— ese ancho deja las opciones sin sitio ni para su padding. 0 = como siempre.
export default function CustomSelect({ value, onChange, options, placeholder = "Seleccionar...", className = "", disabled = false, height = "h-10", icon = null, boxClassName = "", menuMinWidth = 0 }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0, openUp: false });
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (triggerRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      // Sin opciones el menú no dibuja filas de 36px: dibuja el aviso de "sin resultados",
      // que mide bastante más que eso. Sin este caso aparte, el cálculo de abajo (pensado
      // para filas) subestimaba la altura real y el menú terminaba posicionado como si
      // fuera casi del tamaño de una fila, flotando lejos de donde el contenido caía de
      // verdad.
      const menuH = options.length === 0 ? 76 : Math.min(256, options.length * 36 + 16);
      const spaceBelow = window.innerHeight - r.bottom;
      const openUp = spaceBelow < menuH + 16 && r.top > menuH + 16;
      let left = r.left;
      const menuWidth = Math.max(r.width, menuMinWidth);
      if (left + menuWidth > window.innerWidth - 12) {
        left = Math.max(12, window.innerWidth - menuWidth - 12);
      }
      setPos({
        top: openUp ? r.top - menuH - 6 : r.bottom + 6,
        left,
        width: menuWidth,
        openUp,
      });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, options.length, menuMinWidth]);

  const selectedOption = options.find(o => String(o.value) === String(value));

  return (
    <div className={`relative ${className} ${disabled ? "opacity-40 pointer-events-none" : ""}`}>
      <div
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        className={`${height} text-[11px] cursor-pointer flex items-center justify-between transition-all duration-200 border px-3 rounded-md ${boxClassName}
          ${open
            ? "border-brand-500 bg-brand-500/5 ring-[3px] ring-brand-500/15"
            : "bg-white dark:bg-[#12141a] border-border/80 dark:border-white/5 hover:border-brand-500/40"}
        `}
      >
        <span className="flex items-center gap-2 min-w-0 flex-1">
          {icon && (
            <span className="shrink-0 text-content-subtle opacity-60 flex items-center">{icon}</span>
          )}
          {/* opt.color: punto del color de la entidad (categorías, diarios). Sin esto, pasar
              una lista con color a un select obligaba a renunciar a esa señal visual. */}
          {selectedOption?.color && (
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: selectedOption.color }} />
          )}
          {/* truncate + min-w-0: con ancho fijo, una etiqueta larga debe recortarse en vez
              de desbordar la caja o empujar la flecha. */}
          <span className={`truncate ${selectedOption
            ? "text-content dark:text-content-dark font-bold uppercase tracking-tight"
            : "text-content-subtle/50 dark:text-content-dark-muted/30 font-medium"
          }`}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </span>

        <div className={`transition-transform duration-300 ${open ? "rotate-180" : ""}`}>
           <svg className="w-3.5 h-3.5 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
           </svg>
        </div>
      </div>

      {open && createPortal(
        <div
          ref={menuRef}
          // El menú se monta en un portal, fuera del árbol de quien use el select. Un panel
          // que cierre al hacer clic afuera —un popover de filtros— no tiene otra forma de
          // reconocer este menú como parte suya y no cerrarse cuando se elige una opción.
          data-custom-select-menu=""
          style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width }}
          className="bg-white dark:bg-[#1a1c23] border border-border/40 dark:border-white/10 rounded-lg shadow-2xl z-[9999] max-h-64 overflow-y-auto scrollbar-none animate-in fade-in slide-in-from-top-2 duration-200 backdrop-blur-3xl"
        >
          <div className="p-1.5 space-y-1">
            {options.map((opt) => {
              const isActive = String(value) === String(opt.value);
              return (
                <div
                  key={opt.value}
                  onClick={() => { onChange(opt.value); setOpen(false); }}
                  className={`px-4 py-2 rounded-md cursor-pointer flex items-center justify-between text-[11px] font-bold uppercase tracking-wide transition-all duration-200
                    ${isActive
                      ? "bg-brand-500 text-black shadow-md shadow-brand-500/20"
                      : "hover:bg-brand-500/10 dark:hover:bg-white/5 text-content dark:text-white/70 hover:text-brand-500 dark:hover:text-brand-500"}
                  `}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    {opt.color && (
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: opt.color }} />
                    )}
                    <span className="truncate">{opt.label}</span>
                  </span>
                  {isActive && (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              );
            })}

            {options.length === 0 && (
              <div className="px-5 py-6 text-center">
                <div className="text-[10px] font-bold text-content-subtle uppercase tracking-widest italic">No hay resultados</div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
