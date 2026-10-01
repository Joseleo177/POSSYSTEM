import OrderCard from "./OrderCard";
import { toNameCase } from "../../helpers";

// Lista de pedidos que este navegador envió. Los rechazados no vienen del servidor —se borran
// al rechazarlos— así que llegan aparte en rejectedIds y se muestran igual, para que el cliente
// no se quede esperando algo que ya no va a llegar.
//
// En el teléfono sube como hoja desde abajo; en escritorio es un diálogo centrado. Los pedidos
// van como filas de una sola lista, no como tarjetas sueltas: con ocho pedidos, ocho cajas grises
// con borde se leían como ruido antes que como un historial.
export default function MyOrdersModal({
    open, onClose, orders, loading, error, rejectedIds,
    onSelectOrder, onReload, fmt, baseCur, identity,
}) {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center sm:justify-center sm:p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={() => onClose()} />
            <div className="relative w-full sm:max-w-md bg-surface dark:bg-surface-dark-2 rounded-t-3xl sm:rounded-2xl border-t sm:border border-border/60 dark:border-white/10 max-h-[90vh] flex flex-col shadow-2xl">
                {/* Asa de la hoja: en el teléfono dice que el panel se puede bajar. */}
                <div className="sm:hidden pt-2.5 flex justify-center" aria-hidden="true">
                    <span className="w-10 h-1 rounded-full bg-border dark:bg-white/20" />
                </div>

                <div className="px-5 pt-3 sm:pt-5 pb-3 flex items-start justify-between gap-3 border-b border-border/60 dark:border-white/[0.06]">
                    <div className="min-w-0">
                        <h2 className="text-[17px] font-semibold tracking-tight text-content dark:text-white">Mis pedidos</h2>
                        <p className="text-[12px] text-content-subtle truncate tabular-nums">
                            {[toNameCase(identity?.name), identity?.document].filter(Boolean).join(" · ")}
                        </p>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0 -mr-2">
                        <button onClick={onReload} title="Actualizar" aria-label="Actualizar"
                            className="w-9 h-9 rounded-lg flex items-center justify-center text-content-subtle hover:text-content dark:hover:text-white hover:bg-surface-2 dark:hover:bg-white/[0.06] transition-colors">
                            <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                        </button>
                        <button onClick={() => onClose()} title="Cerrar" aria-label="Cerrar"
                            className="w-9 h-9 rounded-lg flex items-center justify-center text-content-subtle hover:text-content dark:hover:text-white hover:bg-surface-2 dark:hover:bg-white/[0.06] transition-colors">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {loading && !orders ? (
                        <div className="py-16 flex items-center justify-center gap-2.5 text-[13px] text-content-subtle">
                            <span className="w-4 h-4 border-2 border-content-subtle/40 border-t-transparent rounded-full animate-spin" />
                            Cargando tus pedidos…
                        </div>
                    ) : error ? (
                        <p className="py-16 px-6 text-center text-[13px] font-medium text-red-600 dark:text-red-400">{error}</p>
                    ) : (orders?.length === 0 && rejectedIds.length === 0) ? (
                        <div className="py-14 px-6 text-center">
                            <div className="w-12 h-12 mx-auto rounded-full bg-surface-2 dark:bg-white/[0.06] flex items-center justify-center text-content-subtle">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                            </div>
                            <p className="mt-3 text-[14px] font-semibold text-content dark:text-white">Todavía no has pedido nada</p>
                            <p className="mt-1 text-[13px] text-content-subtle">Cuando envíes tu primer pedido lo verás aquí.</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-border/60 dark:divide-white/[0.06]">
                            {(orders || []).map(o => (
                                <OrderCard key={o.id} order={o} fmt={fmt} baseCur={baseCur} onSelect={onSelectOrder} />
                            ))}
                            {rejectedIds.map(id => (
                                <OrderCard
                                    key={`rej-${id}`}
                                    order={{
                                        id,
                                        stage: "rechazado",
                                        stage_label: "No procesado",
                                        stage_detail: "La tienda no procesó este pedido. Consúltalo con ellos.",
                                        items: [],
                                    }}
                                    fmt={fmt}
                                    baseCur={baseCur}
                                    onSelect={onSelectOrder}
                                />
                            ))}
                        </div>
                    )}
                </div>

                <div className="px-5 py-3 border-t border-border/60 dark:border-white/[0.06]">
                    <button onClick={() => onClose()}
                        className="w-full h-11 rounded-xl border border-border dark:border-white/15 text-[14px] font-medium text-content dark:text-white hover:bg-surface-2 dark:hover:bg-white/[0.05] transition-colors">
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}
