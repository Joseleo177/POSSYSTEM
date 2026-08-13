import OrderCard from "./OrderCard";

// Lista de pedidos que este navegador envió. Los rechazados no vienen del servidor —se borran
// al rechazarlos— así que llegan aparte en rejectedIds y se muestran igual, para que el cliente
// no se quede esperando algo que ya no va a llegar.
export default function MyOrdersModal({
    open, onClose, orders, loading, error, rejectedIds,
    onSelectOrder, onReload, fmt, baseCur, identity,
}) {
    if (!open) return null;

    return (
                <div className="fixed inset-0 z-40 flex items-end sm:items-center sm:justify-center">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => onClose()} />
                    <div className="relative w-full sm:max-w-md bg-surface dark:bg-surface-dark-2 rounded-t-3xl sm:rounded-3xl border-t sm:border border-border dark:border-white/10 max-h-[90vh] flex flex-col">
                        <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-3 border-b border-border dark:border-white/5">
                            <div className="min-w-0">
                                <h2 className="text-[13px] font-black uppercase tracking-tight text-content dark:text-white">
                                    Mis pedidos
                                </h2>
                                <p className="text-[10px] font-bold text-content-muted truncate">
                                    {identity?.name} · {identity?.document}
                                </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                                <button onClick={onReload} title="Actualizar"
                                    className="p-1.5 text-content-subtle hover:text-brand-500 transition-colors">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                </button>
                                <button onClick={() => onClose()}
                                    className="p-1.5 -mr-1.5 text-content-subtle hover:text-content dark:hover:text-white">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                            {loading && !orders ? (
                                <div className="py-16 text-center text-[11px] font-black uppercase tracking-widest text-content-subtle">
                                    Cargando...
                                </div>
                            ) : error ? (
                                <p className="py-16 text-center text-[11px] font-bold text-danger">{error}</p>
                            ) : (orders?.length === 0 && rejectedIds.length === 0) ? (
                                <div className="py-16 text-center space-y-1">
                                    <p className="text-[11px] font-black uppercase tracking-widest text-content-subtle">
                                        Todavía no has pedido nada
                                    </p>
                                    <p className="text-[11px] font-bold text-content-muted">
                                        Cuando envíes tu primer pedido lo verás aquí.
                                    </p>
                                </div>
                            ) : (
                                <>
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
                                </>
                            )}
                        </div>

                        <div className="px-4 py-3 border-t border-border dark:border-white/5 text-center">
                            <button onClick={() => onClose()} className="text-[11px] font-black uppercase tracking-widest text-content-subtle hover:text-content dark:hover:text-white">
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
    );
}
