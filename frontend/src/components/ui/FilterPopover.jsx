import { useState, useLayoutEffect, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

const MARGIN = 12;   // aire mínimo contra el borde de la ventana
const WIDTH = 288;   // el ancho de siempre de estos paneles (w-72)

/**
 * Panel de filtros anclado a un botón. Se dibuja en un portal, no dentro del árbol donde
 * cuelga el botón.
 *
 * El motivo es concreto: las pestañas y los reportes viven dentro de contenedores con
 * `overflow-auto` / `overflow-hidden` para que la tabla tenga su propio scroll, y un panel
 * `absolute` dentro de uno de esos contenedores lo recorta el contenedor, no la ventana. Así
 * quedaban cortados a media palabra los nombres de usuario y el botón de limpiar. Con el
 * portal el panel sale del recorte, y al posicionarlo se lo mantiene siempre dentro de la
 * pantalla: pegado al borde derecho del botón cuando cabe, corrido lo justo cuando no.
 *
 * Es la misma técnica de CustomSelect, que ya resolvía esto para los desplegables.
 */
export default function FilterPopover({ open, onClose, anchorRef, children, width = WIDTH }) {
    const [pos, setPos] = useState(null);
    const panelRef = useRef(null);

    useLayoutEffect(() => {
        if (!open) return;
        const update = () => {
            const r = anchorRef.current?.getBoundingClientRect();
            if (!r) return;
            const w = Math.min(width, window.innerWidth - MARGIN * 2);
            // Alineado por la derecha del botón, que es como se abrían estos paneles. Si al
            // hacerlo se sale por cualquiera de los dos lados, se corre lo justo para entrar.
            let left = r.right - w;
            left = Math.min(left, window.innerWidth - w - MARGIN);
            left = Math.max(MARGIN, left);

            // Si abajo no queda sitio, se abre hacia arriba; y si tampoco, se pega al borde
            // con su propio scroll, para que nunca quede contenido fuera de la pantalla.
            const alto = panelRef.current?.offsetHeight || 0;
            const espacioAbajo = window.innerHeight - r.bottom - MARGIN;
            const abreArriba = alto > espacioAbajo && r.top - MARGIN > espacioAbajo;
            const top = abreArriba
                ? Math.max(MARGIN, r.top - alto - 4)
                : r.bottom + 4;

            setPos({
                left,
                top,
                width: w,
                maxHeight: (abreArriba ? r.top : window.innerHeight - r.bottom) - MARGIN * 2,
            });
        };
        update();
        // `true` en el scroll: los contenedores internos con scroll propio no burbujean.
        window.addEventListener("scroll", update, true);
        window.addEventListener("resize", update);
        return () => {
            window.removeEventListener("scroll", update, true);
            window.removeEventListener("resize", update);
        };
    }, [open, anchorRef, width, children]);

    // Escape cierra, igual que hacer clic fuera.
    useEffect(() => {
        if (!open) return;
        const onKey = e => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    if (!open) return null;

    return createPortal(
        <>
            <div className="fixed inset-0 z-[60]" onClick={onClose} />
            <div
                ref={panelRef}
                style={pos
                    ? { position: "fixed", top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }
                    // Primer render: se mide con el panel ya montado, así que hasta tener
                    // medidas se mantiene fuera de la vista en vez de parpadear en la esquina.
                    : { position: "fixed", top: -9999, left: -9999, width }
                }
                className="overflow-y-auto scrollbar-hide bg-white dark:bg-surface-dark-2 border border-border/40 dark:border-white/10 rounded-lg shadow-2xl z-[70] animate-in fade-in zoom-in-95 duration-150"
            >
                {children}
            </div>
        </>,
        document.body
    );
}