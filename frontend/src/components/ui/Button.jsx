import { useState, useRef, useEffect } from "react";
import { Spinner } from "./Spinner";

// Si `onClick` devuelve una promesa (un handler async que guarda, crea o elimina), el botón
// se bloquea y muestra el spinner hasta que termina: el usuario ve que algo pasa y un
// segundo clic no manda la misma petición otra vez. Sin esto la gente volvía a pulsar
// "Guardar" mientras el servidor respondía, y al crear quedaban registros duplicados.
// `loading` fuerza el mismo estado desde afuera, para cuando la espera no depende del clic.
export const Button = ({ children, variant = "primary", className = "", onClick, loading = false, disabled, ...props }) => {
    const [running, setRunning] = useState(false);
    const runningRef = useRef(false);
    const mounted = useRef(true);
    useEffect(() => () => { mounted.current = false; }, []);

    const handleClick = (e) => {
        if (runningRef.current || !onClick) return;
        const result = onClick(e);
        if (!result || typeof result.then !== "function") return;
        runningRef.current = true;
        setRunning(true);
        Promise.resolve(result)
            .catch(err => console.error(err))
            .finally(() => {
                runningRef.current = false;
                if (mounted.current) setRunning(false);
            });
    };

    const busy = loading || running;

    const baseStyles = "h-9 px-4 rounded-lg text-[13px] font-semibold transition-colors active:scale-[0.98] shrink-0 flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1";

    // Tinta para la acción principal, borde neutro para la secundaria. El color de marca no
    // va en botones: lo elige cada empresa y no siempre contrasta; queda para selección y foco.
    // btn-accent y btn-outline viven en index.css (degradado y filo de luz del botón de tinta).
    const variants = {
        primary: "btn-accent",
        danger:  "bg-red-600 text-white hover:bg-red-700 border border-red-700/50",
        warning: "bg-amber-500 text-black hover:bg-amber-400",
        ghost:   "btn-outline",
    };

    // Las pantallas le pasaban su propio tamaño de letra, peso, mayúsculas y sombra (text-[11px]
    // font-bold shadow-xl…), y cada botón salía distinto. Esos los decide el botón; el que lo
    // usa conserva ancho, márgenes y relleno. Los altos chicos (h-7, h-8) también se van: un
    // "+ Nuevo" de 32px al lado de un buscador de 36px se veía desalineado.
    const own = className
        .split(/\s+/)
        .filter(c => !/^(?:[a-z]+:)?(?:text-\[\d+px\]|text-(?:xs|sm)|font-(?:bold|black|semibold|medium)|uppercase|tracking-\S+|shadow(?:-\S+)?|h-[78])$/.test(c))
        .join(" ");

    // "+ Nuevo egreso": el más escrito a mano se cambia por un icono, que alinea con el texto.
    let content = children;
    const first = Array.isArray(children) ? children[0] : children;
    if (typeof first === "string" && /^\s*\+\s/.test(first)) {
        content = (
            <>
                <svg className="w-4 h-4 -ml-1 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M12 5v14M5 12h14" />
                </svg>
                {first.replace(/^\s*\+\s*/, "")}
                {Array.isArray(children) && children.slice(1)}
            </>
        );
    }

    // Si la pantalla trae su propio fondo (bg-success/10…), la variante no se suma: las dos
    // clases de color chocaban y salía texto blanco de la tinta sobre un velo verde claro.
    const ownColor = /(^|\s)bg-(?!opacity|gradient|clip|fixed|cover|center|none)/.test(own);

    return (
        <button
            className={`${baseStyles} ${ownColor ? "" : variants[variant]} ${own}`}
            onClick={handleClick}
            disabled={disabled || busy}
            aria-busy={busy || undefined}
            {...props}
        >
            {busy && <Spinner />}
            {content}
        </button>
    );
};
