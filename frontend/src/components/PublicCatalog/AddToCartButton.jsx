import { useEffect, useRef, useState } from "react";

// Botón "Agregar al carrito" de la vitrina, con su pequeña coreografía: al tocarlo, el texto
// sale hacia arriba, una barra lo llena de izquierda a derecha con un aro girando ("agregando"),
// y al completarse el aro se vuelve un visto que se dibuja y suelta unas chispas ("agregado").
// Luego vuelve a su texto, que ya dice "Agregar otro".
//
// El producto entra al carrito en el MISMO toque, no al final de la barra: la carga es
// confirmación visual, no espera real. Así ningún toque se pierde —tres toques seguidos son
// tres unidades— y la foto que vuela al carrito flotante (useFlyingAdd) sale a la vez.
//
// `instant`: lo que abre un selector (tallas, adicionales) todavía no entró al carrito, así
// que no se celebra; el botón solo abre el selector.
//
// Las tres capas (texto, cargando, listo) giran como un carrusel vertical: la actual en su
// sitio, la siguiente esperando abajo y la anterior saliendo por arriba. Las que no son la
// actual van con opacidad 0, así que el salto de "arriba" a "abajo" no se ve.
const FASES = ["idle", "loading", "done"];
const CARGA_MS = 520;
const LISTO_MS = 950;
const CHISPAS = [0, 60, 120, 180, 240, 300];

// Selector de cantidad: lo que el botón pasa a ser cuando el producto ya está en el carrito.
// "Agregar otro" solo sabía sumar; con − y + el cliente corrige ahí mismo, sin abrir el carrito.
// El número rueda hacia arriba al sumar y hacia abajo al restar.
const MAS = "M12 5v14M5 12h14";
const MENOS = "M5 12h14";

function Selector({ qty, label, onMinus, onPlus, className }) {
    const previo = useRef(qty);
    const sube = qty >= previo.current;
    useEffect(() => { previo.current = qty; }, [qty]);
    return (
        <div className={`stepper-in relative flex items-center justify-between gap-1 p-1 rounded-full bg-brand-500/10 dark:bg-brand-500/15 ring-1 ring-inset ring-brand-500/25 font-semibold ${className}`}>
            <button type="button" onClick={onMinus} aria-label="Quitar uno"
                className="h-full aspect-square rounded-full flex items-center justify-center text-brand-600 dark:text-brand-400 hover:bg-brand-500/15 active:scale-90 transition-[transform,background-color]">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.6}><path strokeLinecap="round" d={MENOS} /></svg>
            </button>
            <span className="relative overflow-hidden flex-1 min-w-0 h-full flex items-center justify-center">
                <span key={qty} aria-live="polite" className={`${sube ? "qty-up" : "qty-down"} truncate tabular-nums text-content dark:text-white`}>
                    {label}
                </span>
            </span>
            <button type="button" onClick={onPlus} aria-label="Agregar uno"
                className="h-full aspect-square rounded-full flex items-center justify-center bg-brand-500 text-white shadow-[0_4px_12px_-4px_rgb(var(--c-brand-500)/.7)] hover:brightness-110 active:scale-90 transition-[transform,filter]">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.6}><path strokeLinecap="round" d={MAS} /></svg>
            </button>
        </div>
    );
}

// `qty` (con `qtyLabel` y `onMinus`): si el producto ya está en el carrito, al terminar la
// secuencia el botón se convierte en el selector − n +. El + agrega con la misma función (y la
// foto vuela igual), sin repetir la carga: la carga es para el primer "sí", no para cada unidad.
export default function AddToCartButton({
    onAdd, disabled = false, instant = false, soft = false,
    qty = null, qtyLabel = null, onMinus = null,
    className = "", children,
}) {
    const [fase, setFase] = useState("idle");
    const [vuelta, setVuelta] = useState(0);
    const timers = useRef([]);

    useEffect(() => () => timers.current.forEach(clearTimeout), []);

    if (qty != null && onMinus && !instant && !disabled && fase === "idle") {
        return <Selector qty={qty} label={qtyLabel ?? qty} onMinus={onMinus} onPlus={onAdd} className={className} />;
    }

    const tocar = () => {
        if (disabled) return;
        onAdd();
        if (instant) return;
        timers.current.forEach(clearTimeout);
        setVuelta((v) => v + 1);
        setFase("loading");
        timers.current = [
            setTimeout(() => setFase("done"), CARGA_MS),
            setTimeout(() => setFase("idle"), CARGA_MS + LISTO_MS),
        ];
    };

    const ocupado = fase !== "idle";
    const actual = FASES.indexOf(fase);
    const capa = (nombre) => {
        const d = (FASES.indexOf(nombre) - actual + 3) % 3;
        return d === 0 ? "translate-y-0 opacity-100"
            : d === 1 ? "translate-y-full opacity-0"
                : "-translate-y-full opacity-0";
    };
    const CAPA = "absolute inset-0 flex items-center justify-center gap-1.5 px-3 transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none";

    const tono = disabled
        ? "border border-border/70 dark:border-white/10 text-content-subtle cursor-not-allowed"
        // Mientras corre la secuencia se queda sólido aunque el producto ya esté en el
        // carrito: cambiar a la versión clara a media carga se veía como un parpadeo.
        : soft && !ocupado
            ? "bg-brand-500/10 text-brand-600 dark:text-brand-400 border border-brand-500/30 hover:bg-brand-500/15"
            : "bg-brand-500 text-white border border-transparent hover:brightness-110";

    return (
        <button
            type="button"
            onClick={tocar}
            disabled={disabled}
            aria-live="polite"
            className={`relative overflow-hidden rounded-full font-semibold transition-[background-color,color,border-color,transform,filter] duration-300 enabled:active:scale-[0.97] ${tono} ${className}`}
        >
            {/* Da el ancho al botón: las capas van encima, en absoluto. */}
            <span className="invisible flex items-center justify-center gap-1.5 px-3 whitespace-nowrap">{children}</span>

            {ocupado && <span key={`f${vuelta}`} aria-hidden="true" className="add-fill absolute inset-0 origin-left bg-black/[0.16]" />}

            <span className={`${CAPA} ${capa("idle")} whitespace-nowrap`}>{children}</span>

            <span aria-hidden={fase !== "loading"} className={`${CAPA} ${capa("loading")}`}>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".3" strokeWidth="3" />
                    <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
                Agregando
            </span>

            <span aria-hidden={fase !== "done"} className={`${CAPA} ${capa("done")}`}>
                <span className="relative w-4 h-4 flex items-center justify-center">
                    {fase === "done" && (
                        <>
                            <svg key={`c${vuelta}`} className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path className="add-check" strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.2} d="M5 13l4 4L19 7" />
                            </svg>
                            {CHISPAS.map((a) => (
                                <span key={`${vuelta}-${a}`} style={{ "--a": `${a}deg` }}
                                    className="add-spark absolute left-1/2 top-1/2 -ml-[2px] -mt-[2px] w-1 h-1 rounded-full bg-current" />
                            ))}
                        </>
                    )}
                </span>
                Agregado
            </span>
        </button>
    );
}
