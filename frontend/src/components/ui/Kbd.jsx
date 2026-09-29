// Tecla de un atajo, para leyendas como "Enter siguiente venta". Tiene relieve abajo para que
// se lea como una tecla y no como un número suelto dentro de la frase.
export default function Kbd({ children }) {
    return (
        <kbd className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-[5px] bg-white dark:bg-white/[0.06] border border-border dark:border-white/10 shadow-[0_1px_0_rgb(0_0_0/0.08)] text-[11px] font-semibold font-sans text-content-muted dark:text-white/70 tabular-nums">
            {children}
        </kbd>
    );
}
