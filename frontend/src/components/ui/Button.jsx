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

    const baseStyles = "px-4 py-2 rounded-lg text-[11px] font-black uppercase tracking-wide transition-all active:scale-95 shrink-0 flex items-center justify-center gap-2 disabled:opacity-50 whitespace-nowrap";

    const variants = {
        primary: "bg-brand-500 text-black hover:bg-brand-400 shadow-lg shadow-brand-500/20",
        danger: "bg-danger/10 text-danger border border-danger/20 hover:bg-danger hover:text-white",
        warning: "bg-warning/10 text-warning border border-warning/20 hover:bg-warning hover:text-black",
        ghost: "text-content-subtle dark:text-white/30 hover:bg-surface-2 dark:hover:bg-white/5"
    };

    return (
        <button
            className={`${baseStyles} ${variants[variant]} ${className}`}
            onClick={handleClick}
            disabled={disabled || busy}
            aria-busy={busy || undefined}
            {...props}
        >
            {busy && <Spinner />}
            {children}
        </button>
    );
};
