import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

// Fila de pestañas con UNA píldora que se desliza hasta la elegida, en vez de que el resaltado
// se apague en una y se encienda en otra: el ojo sigue el movimiento y entiende qué cambió.
// La usan la barra de categorías de la cabecera y "Nuestros productos".
//
// Desplazable en horizontal: en un teléfono no caben todas, y partirlas en dos filas descoloca
// la sección. Al elegir una que asoma a medias, la fila la trae al centro.
//
// items: [{ key, label, leading?, badge? }] — `leading` es lo que va antes del texto (la
// miniatura de la categoría). variant: "soft" (tinte de la marca, texto en color) o "solid"
// (píldora de la marca, texto blanco).
export default function GlidingTabs({ items, value, onChange, variant = "soft", className = "" }) {
    const carril = useRef(null);
    const botones = useRef(new Map());
    const [pildora, setPildora] = useState(null);
    // La primera medida se pinta sin transición: si no, la píldora entraría deslizándose
    // desde el borde izquierdo al cargar la página.
    const [lista, setLista] = useState(false);
    const activa = value ? String(value) : "";

    const medir = useCallback(() => {
        const b = botones.current.get(activa);
        if (!b) { setPildora(null); return; }
        setPildora({ x: b.offsetLeft, w: b.offsetWidth });
    }, [activa]);

    useLayoutEffect(() => { medir(); }, [medir, items.length]);
    useEffect(() => {
        if (pildora && !lista) requestAnimationFrame(() => setLista(true));
    }, [pildora, lista]);
    useEffect(() => {
        const el = carril.current;
        if (!el || typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver(medir);
        ro.observe(el);
        // Las fuentes web cambian el ancho del texto al terminar de cargar.
        document.fonts?.ready?.then(medir);
        return () => ro.disconnect();
    }, [medir]);

    useEffect(() => {
        const b = botones.current.get(activa);
        const el = carril.current;
        if (!b || !el || el.scrollWidth <= el.clientWidth) return;
        el.scrollTo({ left: b.offsetLeft - (el.clientWidth - b.offsetWidth) / 2, behavior: "smooth" });
    }, [activa]);

    const solida = variant === "solid";

    return (
        <div ref={carril} className={`relative flex items-center gap-1 overflow-x-auto scrollbar-hide ${className}`}>
            {pildora && (
                <span
                    aria-hidden="true"
                    className={[
                        "absolute top-1/2 -translate-y-1/2 h-9 rounded-full",
                        solida
                            ? "bg-brand-500 shadow-[0_6px_16px_-6px_rgb(var(--c-brand-500)/.8)]"
                            : "bg-brand-500/10 dark:bg-brand-500/20 ring-1 ring-inset ring-brand-500/25",
                        lista ? "transition-[left,width] duration-500 ease-[cubic-bezier(0.34,1.3,0.5,1)] motion-reduce:transition-none" : "",
                    ].join(" ")}
                    style={{ left: pildora.x, width: pildora.w }}
                />
            )}
            {items.map((it) => {
                const sel = String(it.key) === activa;
                return (
                    <button
                        key={it.key || "todo"}
                        ref={(n) => { if (n) botones.current.set(String(it.key), n); else botones.current.delete(String(it.key)); }}
                        type="button"
                        onClick={() => onChange(String(it.key))}
                        aria-current={sel ? "true" : undefined}
                        className={[
                            "relative shrink-0 h-9 rounded-full flex items-center gap-2 text-[13px] font-semibold whitespace-nowrap transition-colors duration-300",
                            it.leading ? "pl-1 pr-3.5" : "px-3.5",
                            sel
                                ? (solida ? "text-white" : "text-brand-600 dark:text-brand-400")
                                : "text-content-muted hover:text-content dark:hover:text-white",
                        ].join(" ")}
                    >
                        {it.leading}
                        {it.label}
                        {it.badge && (
                            <span className="px-1.5 py-px rounded-full bg-brand-500 text-white text-[9px] font-semibold">
                                {it.badge}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
