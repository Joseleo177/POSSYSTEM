import { useLayoutEffect, useRef, useState } from "react";

// onBack: vuelta a la pantalla anterior. Va a la IZQUIERDA, pegada al título, y no entre las
// acciones de la derecha: volver no es una acción sobre lo que se está viendo sino salir de
// ello, y es donde se lo busca —el mismo sitio donde estaría el "atrás" del navegador—.
export default function Page({ module = "Módulo", title, subheader, actions, onBack, backLabel = "Volver", children }) {
    const barRef = useRef(null);
    const [desvanecer, setDesvanecer] = useState(false);

    // El efecto se recalcula en cada render a propósito: los botones de la barra aparecen
    // y desaparecen según el contexto (p. ej. al seleccionar productos), y eso cambia el
    // scrollWidth sin cambiar el tamaño del contenedor, que es lo único que ve el observer.
    useLayoutEffect(() => {
        const el = barRef.current;
        if (!el) return;
        const revisar = () => {
            const hayMas   = el.scrollWidth - el.clientWidth > 1;
            const alFinal  = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
            setDesvanecer(prev => (prev === (hayMas && !alFinal) ? prev : hayMas && !alFinal));
        };
        revisar();
        el.addEventListener("scroll", revisar, { passive: true });
        const ro = new ResizeObserver(revisar);
        ro.observe(el);
        return () => { el.removeEventListener("scroll", revisar); ro.disconnect(); };
    });

    return (
        <div className="h-full overflow-hidden flex flex-col">

            {/* Header */}
            <div className="shrink-0 px-3 sm:px-4 pt-3 pb-2 flex items-center justify-between gap-2 sm:gap-3 border-b border-border/30 dark:border-white/5 min-w-0">
                {onBack && (
                    <button
                        onClick={onBack}
                        title={backLabel}
                        aria-label={backLabel}
                        className="shrink-0 h-8 pl-1.5 pr-2 sm:pr-3 flex items-center gap-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide text-content-subtle dark:text-white/40 hover:text-content dark:hover:text-white hover:bg-surface-2 dark:hover:bg-white/5 transition-all"
                    >
                        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                        </svg>
                        {/* En móvil solo la flecha: el texto se comería el ancho del título. */}
                        <span className="hidden sm:inline">{backLabel}</span>
                    </button>
                )}

                <div className="min-w-0 shrink-0 max-w-[40%] xs:max-w-none">
                    <div className="text-[9px] sm:text-[10px] font-black text-brand-500 uppercase tracking-widest leading-none mb-0.5 sm:mb-1 truncate">
                        {module}
                    </div>
                    <h1 className="text-xs sm:text-sm font-black uppercase tracking-tight truncate">
                        {title}
                    </h1>
                </div>

                {/* La barra ya podía desplazarse, pero con la scrollbar oculta el último botón
                    aparecía cortado sin ninguna pista de que hubiera más: se leía como un fallo
                    de maquetación. El desvanecido del borde derecho lo delata. Se hace con
                    mask-image y no con un degradado de color para no tener que acertarle al
                    fondo del header en claro y en oscuro.

                    Solo se aplica cuando de verdad queda contenido a la derecha. Antes iba fijo,
                    así que el último botón se veía difuminado incluso sin nada que revelar. */}
                {actions && (
                    <div
                        ref={barRef}
                        className="flex items-center gap-1.5 sm:gap-2 shrink min-w-0 overflow-x-auto no-scrollbar py-0.5 ml-auto"
                        style={desvanecer ? {
                            WebkitMaskImage: "linear-gradient(to right, #000 calc(100% - 20px), transparent)",
                            maskImage: "linear-gradient(to right, #000 calc(100% - 20px), transparent)",
                        } : undefined}
                    >
                        {actions}
                    </div>
                )}
            </div>

            {/* Sub-header slot (ej. sub-tabs) */}
            {subheader}

            {/* Contenido */}
            <div className="flex-1 min-h-0 overflow-auto flex flex-col px-3 sm:px-4 py-2 bg-white/[0.02]">
                {children}
            </div>

        </div>
    );
}

