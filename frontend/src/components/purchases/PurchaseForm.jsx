import { useState } from "react";
import ReceiptInfo from "./ReceiptInfo";
import ProductSelectorModal from "./ProductSelectorModal";

const fmt2 = (n) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PurchaseForm({ state }) {
    const { items, removeItem, updateItem, grandTotal, savePurchase, loading, editingDraftId } = state;
    const [modalOpen, setModalOpen] = useState(false);

    const handleAdd = (item) => {
        state.addItemFromModal(item);
    };

    return (
        <div className="space-y-4">
            <ReceiptInfo state={state} />

            {/* Items de la orden */}
            <div className="card-premium !p-0 overflow-hidden">
                <div className="px-4 py-3 bg-surface-2/50 dark:bg-white/[0.03] border-b border-border/10 dark:border-white/5 flex items-center justify-between gap-3">
                    <div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30">Productos</div>
                        {items.length > 0 && (
                            <div className="text-[10px] font-bold text-content-subtle dark:text-white/40 mt-0.5">{items.length} {items.length === 1 ? "producto" : "productos"} en la orden</div>
                        )}
                    </div>
                    <button
                        onClick={() => setModalOpen(true)}
                        className="h-8 px-4 rounded-xl bg-brand-500/10 text-brand-500 border border-brand-500/20 text-[11px] font-black uppercase tracking-wide flex items-center gap-2 hover:bg-brand-500/20 transition-all active:scale-95"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                        </svg>
                        Agregar Producto
                    </button>
                </div>

                {items.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="table-pos min-w-[720px]">
                            <thead>
                                <tr>
                                    <th className="text-left">Producto</th>
                                    <th className="text-left">Embalaje</th>
                                    <th className="text-center">Cant.</th>
                                    <th className="text-center">Costo×Emb.</th>
                                    <th className="text-right">P.Venta</th>
                                    <th className="text-right">Subtotal</th>
                                    <th className="w-12"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/20 dark:divide-white/5">
                                {items.map(item => (
                                    <tr key={item.key} className="group hover:bg-surface-2/30 dark:hover:bg-white/[0.02] transition-colors">
                                        <td>
                                            <div className="font-medium text-xs text-content dark:text-white uppercase tracking-tight">{item.product?.name}</div>
                                            {item.lot_number && (
                                                <div className="text-[9px] font-bold text-warning/70 uppercase mt-0.5">L: {item.lot_number}</div>
                                            )}
                                        </td>
                                        <td className="text-[10px] text-content-subtle dark:text-white/40 font-medium uppercase whitespace-nowrap">
                                            {item.package_unit} × {item.package_unit?.toLowerCase() === "unidad" ? "1" : item.package_size}
                                        </td>
                                        <td className="text-center">
                                            <div className="flex justify-center">
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    value={item.package_qty}
                                                    onChange={e => updateItem(item.key, { package_qty: e.target.value })}
                                                    className="w-14 text-center text-xs font-bold tabular-nums bg-transparent border-b border-border/30 dark:border-white/10 focus:border-brand-500 dark:focus:border-brand-500 focus:outline-none text-content dark:text-white"
                                                />
                                            </div>
                                        </td>
                                        <td className="text-center">
                                            <div className="flex flex-col items-center gap-0.5">
                                                <input
                                                    type="text"
                                                    inputMode="decimal"
                                                    value={item.package_price}
                                                    onChange={e => updateItem(item.key, { package_price: e.target.value })}
                                                    className="w-28 p-0 text-center text-xs font-bold tabular-nums bg-transparent border-b border-border/30 dark:border-white/10 focus:border-brand-500 dark:focus:border-brand-500 focus:outline-none text-info"
                                                />
                                                {item.unit_cost > 0 && (
                                                    <span className="text-[9px] tabular-nums text-content-subtle/40 dark:text-white/20">
                                                        unit: Ref. {fmt2(item.unit_cost)}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="text-right text-[10px] font-bold tabular-nums text-success">
                                            {item.sale_price > 0 ? `Ref. ${fmt2(item.sale_price)}` : "—"}
                                        </td>
                                        <td className="text-right text-xs font-black tabular-nums text-warning">
                                            {item.subtotal > 0 ? `Ref. ${fmt2(item.subtotal)}` : "—"}
                                        </td>
                                        <td className="text-center">
                                            <button
                                                onClick={() => removeItem(item.key)}
                                                className="p-1.5 rounded-lg text-danger opacity-0 group-hover:opacity-100 hover:bg-danger/10 transition-all active:scale-95"
                                            >
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-10 gap-3 text-content-subtle dark:text-white/20">
                        <svg className="w-10 h-10 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                        <div className="text-[11px] font-black uppercase tracking-widest text-center opacity-40">
                            Sin productos.<br />Usa el botón para agregar.
                        </div>
                    </div>
                )}

                {/* Footer con total y guardar */}
                {items.length > 0 && (
                    <div className="px-5 py-4 border-t border-border/20 dark:border-white/5 bg-surface-2/30 dark:bg-white/[0.02] flex items-center justify-between gap-4">
                        <div>
                            <div className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30 mb-0.5">Total Estimado</div>
                            <div className="text-xl font-black text-brand-500 tabular-nums">Ref. {fmt2(grandTotal)}</div>
                        </div>
                        <button
                            onClick={savePurchase}
                            disabled={loading}
                            className={[
                                "h-9 px-6 rounded-xl text-[11px] font-black uppercase tracking-wide flex items-center gap-2 transition-all active:scale-[0.99]",
                                loading
                                    ? "bg-surface-2 dark:bg-white/5 text-content-subtle cursor-not-allowed"
                                    : "bg-brand-500 text-white hover:brightness-105 shadow-lg shadow-brand-500/20"
                            ].join(" ")}
                        >
                            {loading ? (
                                <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                            ) : (
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                                </svg>
                            )}
                            {loading ? "Guardando…" : editingDraftId ? "Actualizar Borrador" : "Guardar Borrador"}
                        </button>
                    </div>
                )}
            </div>

            <ProductSelectorModal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                onAdd={handleAdd}
                existingItems={items}
            />
        </div>
    );
}
