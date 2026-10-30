import { useEffect, useRef, useState } from "react";

// Un monto que, al cambiar, CUENTA hasta su nuevo valor en vez de saltar: al marcar el
// delivery el total sube de $13.50 a $15.50 y se ve subir. El ojo nota que cambió y en qué
// dirección sin tener que comparar dos cifras.
//
// `format` recibe el número y devuelve el texto (normalmente fmt de la tienda). Con
// `render` se le puede dar otra forma (por ejemplo, envolverlo en <Money>).
export default function CountUp({ value, format, render = null, ms = 450, className = "" }) {
    const [shown, setShown] = useState(value);
    const desde = useRef(value);
    const raf = useRef(0);

    useEffect(() => {
        const reducido = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        const a = desde.current;
        const b = Number(value) || 0;
        if (reducido || a === b) { setShown(b); desde.current = b; return; }
        const t0 = performance.now();
        const paso = (t) => {
            const k = Math.min(1, (t - t0) / ms);
            const e = 1 - Math.pow(1 - k, 3);
            const v = a + (b - a) * e;
            desde.current = v;
            setShown(k === 1 ? b : v);
            if (k < 1) raf.current = requestAnimationFrame(paso);
        };
        cancelAnimationFrame(raf.current);
        raf.current = requestAnimationFrame(paso);
        return () => cancelAnimationFrame(raf.current);
    }, [value, ms]);

    const texto = format(shown);
    return render ? render(texto) : <span className={`tabular-nums ${className}`}>{texto}</span>;
}

// Papelera con tapa: al pasar el cursor (o al tocarla) la tapa se levanta. La usan el carrito
// y sus líneas; es el aviso de "esto se va" antes de que se vaya.
export function IconoPapelera({ className = "w-4 h-4" }) {
    return (
        <svg className={`${className} overflow-visible`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <g className="transition-transform duration-300 ease-[cubic-bezier(0.34,1.6,0.5,1)] group-hover/trash:-translate-y-[2px] group-hover/trash:-rotate-[14deg]" style={{ transformOrigin: "5px 7px" }}>
                <path d="M4 7h16" />
                <path d="M9.5 7V5.2A1.2 1.2 0 0110.7 4h2.6a1.2 1.2 0 011.2 1.2V7" />
            </g>
            <path d="M6 7l.85 11.6A2 2 0 008.84 20.5h6.32a2 2 0 001.99-1.9L18 7" />
            <path d="M10 11v5.5M14 11v5.5" />
        </svg>
    );
}
