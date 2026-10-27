// Paso del pedido por la pantalla de cocina, visto desde la caja. Solo hay marca mientras la
// cocina lo tiene; "Lista" es el aviso de que hay que llevarlo a la mesa, y lleva el check
// porque es el único caso en que el verde dice algo (ver guía del frontend).
export default function KitchenMark({ status }) {
    if (status === "lista") {
        return (
            <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 shrink-0 whitespace-nowrap">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                Lista
            </span>
        );
    }
    if (status === "nueva" || status === "preparando") {
        return (
            <span className="text-[11px] font-medium text-content-subtle shrink-0 whitespace-nowrap">
                En cocina
            </span>
        );
    }
    return null;
}
