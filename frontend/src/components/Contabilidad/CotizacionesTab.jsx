import { useState } from "react";
import { useQuotations } from "../../hooks/contabilidad/useQuotations";
import ConfirmModal from "../ui/ConfirmModal";
import DateRangePicker from "../ui/DateRangePicker";
import Pagination from "../ui/Pagination";
import { fmtDateShort, fmtDate, printQuotationDoc } from "../../helpers";
import { useApp } from "../../context/AppContext";
import { useCart } from "../../context/CartContext";
import { api } from "../../services/api";

const STATUS_BADGE = {
    pendiente:  "bg-amber-500/10 text-amber-500 border-amber-500/20",
    convertida: "bg-success/10 text-success border-success/20",
    anulada:    "bg-surface-3 dark:bg-white/5 text-content-subtle dark:text-white/30 border-border/20 dark:border-white/10",
};
const STATUS_LABEL = {
    pendiente:  "Pendiente",
    convertida: "Convertida",
    anulada:    "Anulada",
};

function QuotDetailModal({ quot, onClose, onPrint, onLoadToCart, onCancel, onDelete, can, fmtPrice }) {

    if (!quot) return null;
    const items = quot.items || [];

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
            <div className="w-full max-w-lg bg-white dark:bg-surface-dark-2 border border-border/30 dark:border-white/[0.07] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="shrink-0 px-5 py-4 border-b border-border/10 dark:border-white/5 flex items-center justify-between gap-3 bg-brand-500/5">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-brand-500/10 text-brand-500 border border-brand-500/20 flex items-center justify-center shrink-0">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                        </div>
                        <div>
                            <div className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30">Cotización</div>
                            <div className="text-sm font-black text-content dark:text-white">#{quot.id}</div>
                        </div>
                        <span className={`text-[10px] font-black uppercase tracking-wide px-2.5 py-1 rounded-lg border ${STATUS_BADGE[quot.status] || STATUS_BADGE.anulada}`}>
                            {STATUS_LABEL[quot.status] || quot.status}
                        </span>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-content-subtle hover:bg-surface-2 dark:hover:bg-white/10 transition-all">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                </div>

                {/* Meta */}
                <div className="shrink-0 px-5 py-3 border-b border-border/10 dark:border-white/5 grid grid-cols-2 gap-x-6 gap-y-2">
                    {[
                        ["Fecha",    fmtDate(quot.created_at)],
                        ["Cliente",  quot.customer_name || "Consumidor Final"],
                        ["CI/RIF",   quot.customer_rif  || "—"],
                        ["Empleado", quot.employee_name || "—"],
                        ...(quot.notes ? [["Notas", quot.notes]] : []),
                    ].map(([label, val]) => (
                        <div key={label}>
                            <p className="text-[9px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30">{label}</p>
                            <p className="text-[11px] font-bold text-content dark:text-white truncate">{val}</p>
                        </div>
                    ))}
                </div>

                {/* Items */}
                <div className="flex-1 overflow-y-auto px-5 py-3">
                    <div className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30 mb-2">Productos</div>
                    <div className="rounded-xl border border-border/20 dark:border-white/5 overflow-hidden">
                        <div className="grid grid-cols-12 bg-surface-2 dark:bg-white/[0.03] px-3 py-2">
                            <span className="col-span-5 text-[10px] font-black uppercase text-content-subtle dark:text-white/30">Producto</span>
                            <span className="col-span-2 text-[10px] font-black uppercase text-content-subtle dark:text-white/30 text-center">Cant.</span>
                            <span className="col-span-2 text-[10px] font-black uppercase text-content-subtle dark:text-white/30 text-right">P.Unit</span>
                            <span className="col-span-3 text-[10px] font-black uppercase text-content-subtle dark:text-white/30 text-right">Subtotal</span>
                        </div>
                        {items.length === 0 ? (
                            <div className="px-3 py-4 text-center text-[11px] text-content-subtle dark:text-white/30">Sin líneas</div>
                        ) : items.map((item, idx) => (
                            <div key={idx} className="grid grid-cols-12 items-center px-3 py-2.5 border-t border-border/10 dark:border-white/5">
                                <div className="col-span-5 text-[11px] font-bold text-content dark:text-white truncate">{item.product_name}</div>
                                <div className="col-span-2 text-center text-[11px] font-bold text-content dark:text-white tabular-nums">{parseFloat(item.quantity)}</div>
                                <div className="col-span-2 text-right text-[11px] text-content-subtle dark:text-white/40 tabular-nums">{fmtPrice(item.price)}</div>
                                <div className="col-span-3 text-right text-[11px] font-black text-content dark:text-white tabular-nums">{fmtPrice(item.subtotal)}</div>
                            </div>
                        ))}
                    </div>
                    {parseFloat(quot.discount_amount) > 0 && (
                        <div className="mt-2 flex justify-end text-[11px] font-bold text-danger">
                            Descuento: -{fmtPrice(quot.discount_amount)}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="shrink-0 px-5 py-4 border-t border-border/10 dark:border-white/5">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30">Total</p>
                            <p className="text-2xl font-black text-brand-500 tabular-nums">{fmtPrice(quot.total)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                            {quot.status === "pendiente" && can("admin") && (
                                <button onClick={() => onCancel(quot)}
                                    className="h-9 px-3 rounded-xl border border-danger/20 text-danger text-[10px] font-black uppercase tracking-widest hover:bg-danger/10 transition-all">
                                    Anular
                                </button>
                            )}
                            {quot.status === "anulada" && can("admin") && (
                                <button onClick={() => onDelete(quot)}
                                    className="h-9 px-3 rounded-xl border border-danger text-danger text-[10px] font-black uppercase tracking-widest hover:bg-danger hover:text-white transition-all">
                                    Eliminar
                                </button>
                            )}
                            <button onClick={() => onPrint(quot)}
                                className="h-9 px-4 rounded-xl border border-border/30 dark:border-white/10 text-content-subtle text-[10px] font-black uppercase tracking-widest hover:text-brand-500 hover:border-brand-500/30 transition-all flex items-center gap-2">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                </svg>
                                Imprimir
                            </button>
                            {quot.status === "pendiente" && (
                                <button onClick={() => onLoadToCart(quot)}
                                    className="h-9 px-4 rounded-xl bg-success/10 text-success border border-success/20 text-[10px] font-black uppercase tracking-widest hover:bg-success hover:text-black transition-all flex items-center gap-1.5">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                                    </svg>
                                    Abrir en caja
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function CotizacionesTab({ notify, can, fmtPrice }) {
    const q = useQuotations({ notify });
    const { companyInfo, baseCurrency, activeCurrencies, navigateTo } = useApp();
    const { loadFromQuotation } = useCart();
    const [showFilterDrop, setShowFilterDrop] = useState(false);

    const handlePrint = async (quot) => {
        try {
            const res = await api.quotations.getOne(quot.id);
            printQuotationDoc(res.data, companyInfo, baseCurrency, activeCurrencies);
        } catch (e) {
            notify(e.message, "err");
        }
    };

    const handleLoadToCart = async (quot) => {
        q.setSelectedQuot(null);
        await loadFromQuotation(quot);
        navigateTo("Cobro");
    };

    const handleCancel = (quot) => {
        q.setSelectedQuot(null);
        q.setCancelConfirm(quot);
    };

    const handleDelete = (quot) => {
        q.setSelectedQuot(null);
        q.setDeleteConfirm(quot);
    };

    const subheader = (
        <div className="shrink-0 px-4 py-2 border-b border-border/20 dark:border-white/5 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-subtle opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                    type="text"
                    placeholder="Buscar por #, cliente o RIF..."
                    value={q.searchTerm}
                    onChange={e => q.setSearchTerm(e.target.value)}
                    className="input h-8 pl-8 text-[11px] w-full"
                />
            </div>

            <div className="relative">
                <button
                    onClick={() => setShowFilterDrop(p => !p)}
                    className={["h-8 px-3 rounded-lg text-[11px] font-black uppercase tracking-wide border flex items-center gap-2 transition-all",
                        q.hasFilters
                            ? "bg-brand-500/10 text-brand-500 border-brand-500/30"
                            : "bg-surface-2 dark:bg-white/5 border-border/30 dark:border-white/10 text-content-subtle hover:text-content dark:hover:text-white"
                    ].join(" ")}
                >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                    </svg>
                    Filtros
                    {q.hasFilters && (
                        <span className="bg-brand-500 text-black w-4 h-4 rounded flex items-center justify-center text-[9px]">
                            {(q.statusFilter ? 1 : 0) + (q.dateFrom || q.dateTo ? 1 : 0)}
                        </span>
                    )}
                </button>
                {showFilterDrop && (
                    <>
                        <div className="fixed inset-0 z-[60]" onClick={() => setShowFilterDrop(false)} />
                        <div className="absolute top-full right-0 mt-1 w-72 bg-white dark:bg-surface-dark-2 border border-border/40 dark:border-white/10 rounded-lg shadow-2xl z-[70] animate-in fade-in zoom-in-95 duration-150">
                            <div className="px-4 py-3 border-b border-border/20 dark:border-white/5">
                                <div className="text-[10px] font-black uppercase tracking-widest text-content-subtle mb-2">Estado</div>
                                <div className="grid grid-cols-3 gap-1.5">
                                    {[
                                        { id: "pendiente",  label: "Pendiente" },
                                        { id: "convertida", label: "Convertida" },
                                        { id: "anulada",    label: "Anulada" },
                                    ].map(f => {
                                        const active = q.statusFilter === f.id;
                                        return (
                                            <button key={f.id}
                                                onClick={() => { q.setStatusFilter(active ? "" : f.id); setShowFilterDrop(false); }}
                                                className={`px-2 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wide border transition-all ${active ? "bg-brand-500 text-black border-brand-500" : "border-border/30 dark:border-white/10 text-content-subtle hover:text-content dark:hover:text-white"}`}>
                                                {f.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className="px-4 py-3 border-b border-border/20 dark:border-white/5">
                                <div className="text-[10px] font-black uppercase tracking-widest text-content-subtle mb-2">Rango de Fecha</div>
                                <DateRangePicker from={q.dateFrom} to={q.dateTo} setFrom={q.setDateFrom} setTo={q.setDateTo} />
                            </div>
                            <div className="px-4 py-2">
                                <button onClick={() => { q.clearFilters(); setShowFilterDrop(false); }}
                                    className="w-full py-1.5 text-[10px] font-black uppercase tracking-wide text-danger hover:bg-danger/5 rounded-lg transition-colors">
                                    Limpiar todo
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );

    return (
        <div className="h-full flex flex-col overflow-hidden">
            {subheader}
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                <div className="card-premium overflow-auto flex-1 border-none shadow-none rounded-none bg-transparent">
                    <table className="table-pos min-w-[680px]">
                        <thead className="sticky top-0 z-10">
                            <tr>
                                {["#", "Estado", "Cliente", "Fecha", "Ítems", "Total", ""].map(h => (
                                    <th key={h} className={h === "" || h === "Total" ? "text-right pr-6" : "text-left"}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {q.loading ? (
                                <tr><td colSpan={7} className="py-20 text-center text-brand-500 animate-pulse text-xs font-black uppercase tracking-widest">Cargando cotizaciones...</td></tr>
                            ) : q.quotations.length === 0 ? (
                                <tr><td colSpan={7} className="py-20 text-center text-content-subtle text-xs font-black uppercase tracking-wide italic opacity-40">Sin cotizaciones registradas</td></tr>
                            ) : q.quotations.map(quot => (
                                <tr key={quot.id} className="group">
                                    <td>
                                        <span className="text-[11px] font-black text-brand-500 tracking-tight">#{quot.id}</span>
                                    </td>
                                    <td>
                                        <span className={`text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-lg border ${STATUS_BADGE[quot.status] || STATUS_BADGE.anulada}`}>
                                            {STATUS_LABEL[quot.status] || quot.status}
                                        </span>
                                    </td>
                                    <td className="truncate max-w-[200px]">
                                        <span className="text-[11px] font-black text-content dark:text-white uppercase tracking-tight truncate block">
                                            {quot.customer_name || "Consumidor Final"}
                                        </span>
                                        {quot.customer_rif && (
                                            <span className="text-[9px] font-bold text-content-subtle opacity-40 uppercase">{quot.customer_rif}</span>
                                        )}
                                    </td>
                                    <td>
                                        <span className="text-[11px] font-bold text-content-subtle uppercase">{fmtDateShort(quot.created_at)}</span>
                                    </td>
                                    <td>
                                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-surface-3 dark:bg-white/5 border border-border/20 dark:border-white/10 text-content-subtle dark:text-white/40">
                                            {(quot.items || []).length} línea{(quot.items || []).length !== 1 ? "s" : ""}
                                        </span>
                                    </td>
                                    <td className="text-right pr-6">
                                        <span className="text-[11px] font-black text-content dark:text-white tabular-nums">{fmtPrice(quot.total)}</span>
                                    </td>
                                    <td className="text-right pr-6">
                                        <div className="flex items-center justify-end gap-1.5">
                                            <button
                                                onClick={() => q.setSelectedQuot(quot)}
                                                className="h-7 px-3 rounded-lg text-[10px] font-black uppercase tracking-wide border transition-all bg-brand-500/10 text-brand-500 border-brand-500/20 hover:bg-brand-500 hover:text-black"
                                            >
                                                Detalles
                                            </button>
                                            <button
                                                onClick={() => handlePrint(quot)}
                                                className="p-2 rounded-xl transition-all text-content-subtle hover:text-brand-500 hover:bg-brand-500/10 active:scale-90"
                                                title="Imprimir cotización"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                </svg>
                                            </button>
                                            {quot.status === "pendiente" && can("admin") && (
                                                <button
                                                    onClick={() => handleCancel(quot)}
                                                    className="p-2 rounded-xl transition-all text-content-subtle hover:text-danger hover:bg-danger/10 active:scale-90"
                                                    title="Anular cotización"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                                    </svg>
                                                </button>
                                            )}
                                            {quot.status === "anulada" && can("admin") && (
                                                <button
                                                    onClick={() => handleDelete(quot)}
                                                    className="p-2 rounded-xl transition-all text-content-subtle hover:text-danger hover:bg-danger/10 active:scale-90"
                                                    title="Eliminar cotización"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <Pagination page={q.page} totalPages={q.totalPages} total={q.total} limit={q.LIMIT} onPageChange={q.setPage} />
            </div>

            <ConfirmModal
                isOpen={!!q.cancelConfirm}
                title="¿Anular cotización?"
                message={`¿Deseas anular la cotización #${q.cancelConfirm?.id}? Esta acción no se puede deshacer.`}
                onConfirm={() => { q.cancelQuotation(q.cancelConfirm.id); q.setCancelConfirm(null); }}
                onCancel={() => q.setCancelConfirm(null)}
                type="danger"
                confirmText="Sí, anular"
            />

            <ConfirmModal
                isOpen={!!q.deleteConfirm}
                title="¿Eliminar cotización?"
                message={`¿Deseas eliminar permanentemente la cotización #${q.deleteConfirm?.id}? Esta acción borrará el registro de la base de datos.`}
                onConfirm={() => { q.deleteQuotation(q.deleteConfirm.id); q.setDeleteConfirm(null); }}
                onCancel={() => q.setDeleteConfirm(null)}
                type="danger"
                confirmText="Sí, eliminar"
            />

            <QuotDetailModal
                quot={q.selectedQuot}
                onClose={() => q.setSelectedQuot(null)}
                onPrint={handlePrint}
                onLoadToCart={handleLoadToCart}
                onCancel={handleCancel}
                onDelete={handleDelete}
                can={can}
                fmtPrice={fmtPrice}
            />
        </div>
    );
}
