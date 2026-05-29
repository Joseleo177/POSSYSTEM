import { useState } from "react";

export default function ReceiveLotModal({ purchase, onConfirm, onCancel, loading }) {
    const items = purchase?.items || [];

    const [lots, setLots] = useState(() =>
        Object.fromEntries(items.map(i => [i.id, { lot_number: i.lot_number || "", expiration_date: i.expiration_date || "" }]))
    );

    const setField = (id, field, val) =>
        setLots(prev => ({ ...prev, [id]: { ...prev[id], [field]: val } }));

    const handleConfirm = () => {
        const itemsPayload = items.map(i => ({
            id: i.id,
            lot_number:      lots[i.id]?.lot_number      || null,
            expiration_date: lots[i.id]?.expiration_date || null,
        }));
        onConfirm(itemsPayload);
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-lg bg-white dark:bg-surface-dark-2 border border-border/30 dark:border-white/[0.07] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="shrink-0 px-5 py-4 border-b border-border/10 dark:border-white/5 flex items-center gap-3 bg-success/5">
                    <div className="w-9 h-9 rounded-xl bg-success/10 text-success border border-success/20 flex items-center justify-center shrink-0">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                    </div>
                    <div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30">Recibir Mercancía</div>
                        <div className="text-sm font-black text-content dark:text-white">Orden #{purchase?.id}</div>
                    </div>
                </div>

                {/* Instrucción */}
                <div className="shrink-0 px-5 py-3 border-b border-border/10 dark:border-white/5 bg-brand-500/5">
                    <p className="text-[11px] text-content-subtle dark:text-white/40 font-bold">
                        Ingresa el lote y fecha de vencimiento para cada producto. Puedes dejarlo en blanco si no aplica.
                    </p>
                </div>

                {/* Items */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                    {items.map(item => (
                        <div key={item.id} className="rounded-xl border border-border/20 dark:border-white/5 p-4 space-y-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-[12px] font-black text-content dark:text-white">{item.product_name}</p>
                                    <p className="text-[10px] text-content-subtle dark:text-white/30">{item.package_qty} {item.package_unit} × {item.package_size} uds = <span className="text-warning font-black">{item.total_units} uds</span></p>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30 mb-1 block">N° de Lote</label>
                                    <input
                                        type="text"
                                        value={lots[item.id]?.lot_number || ""}
                                        onChange={e => setField(item.id, "lot_number", e.target.value)}
                                        placeholder="Ej. LOT-2026-001"
                                        className="w-full h-9 bg-surface-2/50 dark:bg-white/[0.03] border border-border/20 dark:border-white/5 rounded-xl px-3 text-[12px] font-bold text-content dark:text-white outline-none focus:border-brand-500/60 transition-all placeholder:text-content-subtle/40"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30 mb-1 block">Fecha Vencimiento</label>
                                    <input
                                        type="date"
                                        value={lots[item.id]?.expiration_date || ""}
                                        onChange={e => setField(item.id, "expiration_date", e.target.value)}
                                        className="w-full h-9 bg-surface-2/50 dark:bg-white/[0.03] border border-border/20 dark:border-white/5 rounded-xl px-3 text-[12px] font-bold text-content dark:text-white outline-none focus:border-brand-500/60 transition-all"
                                    />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div className="shrink-0 px-5 py-4 border-t border-border/10 dark:border-white/5 flex gap-2 justify-end">
                    <button onClick={onCancel} disabled={loading}
                        className="h-9 px-4 rounded-xl border border-border/30 dark:border-white/10 text-[11px] font-black uppercase tracking-wide text-content-subtle hover:text-content dark:hover:text-white transition-all disabled:opacity-50">
                        Cancelar
                    </button>
                    <button onClick={handleConfirm} disabled={loading}
                        className="h-9 px-5 rounded-xl bg-success text-black text-[11px] font-black uppercase tracking-wide hover:brightness-110 transition-all shadow-lg shadow-success/20 disabled:opacity-50 flex items-center gap-2">
                        {loading
                            ? <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Procesando...</>
                            : <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/></svg>Confirmar Recepción</>
                        }
                    </button>
                </div>
            </div>
        </div>
    );
}
