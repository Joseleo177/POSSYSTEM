import React, { useState } from "react";
import { useQuotations } from "../../hooks/contabilidad/useQuotations";
import ConfirmModal from "../ui/ConfirmModal";
import DateRangePicker from "../ui/DateRangePicker";
import Pagination from "../ui/Pagination";
import { Button } from "../ui/Button";
import { fmtDateShort, printQuotationDoc } from "../../helpers";
import { useApp } from "../../context/AppContext";
import { api } from "../../services/api";

const STATUS_BADGE = {
    pendiente:  "badge-warning",
    convertida: "badge-success",
    anulada:    "badge-neutral",
};


export default function CotizacionesTab({ notify, can, fmtPrice, allSeries }) {
    const q = useQuotations({ notify });
    const { companyInfo, baseCurrency, activeCurrencies } = useApp();
    const [showFilterDrop, setShowFilterDrop] = useState(false);

    // Convert modal local state
    const [selectedSerieId, setSelectedSerieId] = useState("");

    const activeSeries = (allSeries || []).filter(s => s.active);

    const openConvert = (quotation) => {
        setSelectedSerieId(activeSeries[0]?.id || "");
        q.setConvertModal(quotation);
    };

    const handlePrint = async (quot) => {
        try {
            const res = await api.quotations.getOne(quot.id);
            printQuotationDoc(res.data, companyInfo, baseCurrency, activeCurrencies);
        } catch (e) {
            notify(e.message, "err");
        }
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
                                {["#", "Estado", "Cliente", "Fecha", "Total", "Acciones"].map(h => (
                                    <th key={h} className={h === "Acciones" || h === "Total" ? "text-right pr-6" : "text-left"}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {q.loading ? (
                                <tr><td colSpan={6} className="py-20 text-center text-brand-500 animate-pulse text-xs font-black uppercase tracking-widest">Cargando cotizaciones...</td></tr>
                            ) : q.quotations.length === 0 ? (
                                <tr><td colSpan={6} className="py-20 text-center text-content-subtle text-xs font-black uppercase tracking-wide italic opacity-40">Sin cotizaciones registradas</td></tr>
                            ) : q.quotations.map(quot => (
                                <React.Fragment key={quot.id}>
                                    <tr className="group">
                                        <td>
                                            <span className="text-[11px] font-black text-brand-500 tracking-tight">#{quot.id}</span>
                                        </td>
                                        <td>
                                            <span className={`badge shadow-none ${STATUS_BADGE[quot.status] || "badge-neutral"}`}>
                                                {quot.status}
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
                                        <td className="text-right pr-6">
                                            <span className="text-[11px] font-black text-content dark:text-white tabular-nums">{fmtPrice(quot.total)}</span>
                                        </td>
                                        <td className="text-right pr-6">
                                            <div className="flex items-center justify-end gap-1.5">
                                                <button
                                                    onClick={() => q.setExpandedId(q.expandedId === quot.id ? null : quot.id)}
                                                    className={`h-7 px-3 rounded-lg text-[10px] font-black uppercase tracking-wide border transition-all ${q.expandedId === quot.id ? "bg-brand-500 text-black border-brand-500" : "bg-brand-500/10 text-brand-500 border-brand-500/20 hover:bg-brand-500 hover:text-black"}`}
                                                >
                                                    {q.expandedId === quot.id ? "Cerrar" : "Detalles"}
                                                </button>
                                                <button
                                                    onClick={() => handlePrint(quot)}
                                                    className="p-2 rounded-xl transition-all text-content-subtle hover:text-brand-500 hover:bg-brand-500/10 active:scale-90"
                                                    title="Imprimir cotización"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                                    </svg>
                                                </button>
                                                {quot.status === "pendiente" && (
                                                    <button
                                                        onClick={() => openConvert(quot)}
                                                        className="h-7 px-3 rounded-lg text-[10px] font-black uppercase tracking-wide border transition-all bg-success/10 text-success border-success/20 hover:bg-success hover:text-black"
                                                    >
                                                        Convertir
                                                    </button>
                                                )}
                                                {quot.status === "pendiente" && can("admin") && (
                                                    <button
                                                        onClick={() => q.setCancelConfirm(quot)}
                                                        className="p-2 rounded-xl transition-all text-content-subtle hover:text-danger hover:bg-danger/10 active:scale-90"
                                                        title="Anular"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                        </svg>
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                    {q.expandedId === quot.id && (
                                        <tr key={`detail-${quot.id}`}>
                                            <td colSpan={6} className="px-4 pb-4 bg-surface-2/50 dark:bg-white/[0.02]">
                                                <div className="rounded-lg border border-border/30 dark:border-white/5 overflow-hidden">
                                                    <table className="w-full text-left border-collapse">
                                                        <thead>
                                                            <tr className="bg-surface-2 dark:bg-surface-dark-2 border-b border-border/20 dark:border-white/5 font-black uppercase text-[9px] text-content-subtle">
                                                                <th className="px-4 py-2">Producto</th>
                                                                <th className="px-4 py-2 text-center w-20">Cant.</th>
                                                                <th className="px-4 py-2 text-right w-32">P. Unit.</th>
                                                                <th className="px-4 py-2 text-right w-32">Subtotal</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-border/10 dark:divide-white/5">
                                                            {(quot.items || []).map((item, idx) => (
                                                                <tr key={idx} className="hover:bg-brand-500/[0.02]">
                                                                    <td className="px-4 py-2 text-[10px] font-bold text-content dark:text-content-dark uppercase truncate max-w-[200px]">{item.product_name}</td>
                                                                    <td className="px-4 py-2 text-center text-[10px] font-black text-content-subtle">{item.quantity}</td>
                                                                    <td className="px-4 py-2 text-right text-[10px] font-bold text-content-subtle tabular-nums">{fmtPrice(item.price)}</td>
                                                                    <td className="px-4 py-2 text-right text-[10px] font-black text-brand-500 tabular-nums">{fmtPrice(item.subtotal)}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                    {quot.discount_amount > 0 && (
                                                        <div className="px-4 py-2 flex justify-end border-t border-border/10 dark:border-white/5 text-[10px] font-bold text-danger">
                                                            Descuento: -{fmtPrice(quot.discount_amount)}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>

                <Pagination page={q.page} totalPages={q.totalPages} total={q.total} limit={q.LIMIT} onPageChange={q.setPage} />
            </div>

            {/* Anular confirm */}
            <ConfirmModal
                isOpen={!!q.cancelConfirm}
                title="¿Anular cotización?"
                message={`¿Deseas anular la cotización #${q.cancelConfirm?.id}? Esta acción no se puede deshacer.`}
                onConfirm={() => { q.cancelQuotation(q.cancelConfirm.id); q.setCancelConfirm(null); }}
                onCancel={() => q.setCancelConfirm(null)}
                type="danger"
                confirmText="Sí, anular"
            />

            {/* Convertir a factura modal */}
            {q.convertModal && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => q.setConvertModal(null)} />
                    <div className="relative bg-surface-1 dark:bg-surface-dark-1 border border-border/30 dark:border-white/10 rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4 animate-in fade-in zoom-in-95 duration-150">
                        <div className="mb-5">
                            <div className="text-[10px] font-black text-brand-500 uppercase tracking-widest mb-1">Convertir a Factura</div>
                            <h2 className="text-sm font-black uppercase tracking-tight">Cotización #{q.convertModal.id}</h2>
                            <p className="text-[11px] text-content-subtle mt-1">
                                {q.convertModal.customer_name || "Consumidor Final"} · {fmtPrice(q.convertModal.total)}
                            </p>
                        </div>

                        <div className="mb-5">
                            <p className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30 mb-2">Serie de facturación *</p>
                            {activeSeries.length === 0 ? (
                                <p className="text-[11px] text-danger font-bold">No hay series activas disponibles.</p>
                            ) : (
                                <div className="flex flex-wrap gap-1.5">
                                    {activeSeries.map(s => {
                                        const active = parseInt(selectedSerieId) === s.id;
                                        return (
                                            <button key={s.id} type="button"
                                                onClick={() => setSelectedSerieId(s.id)}
                                                className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wide border-2 transition-all ${active ? "border-brand-500 bg-brand-500 text-black" : "border-border/40 dark:border-white/10 text-content-subtle hover:border-brand-500/50"}`}>
                                                {s.name || s.prefix}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="flex gap-2">
                            <button onClick={() => q.setConvertModal(null)}
                                className="flex-1 h-10 rounded-xl border border-border/40 dark:border-white/10 text-[11px] font-black uppercase tracking-wide text-content-subtle hover:text-content transition-all">
                                Cancelar
                            </button>
                            <button
                                disabled={!selectedSerieId || activeSeries.length === 0}
                                onClick={() => q.convertQuotation(q.convertModal.id, selectedSerieId)}
                                className="flex-[2] h-10 rounded-xl bg-brand-500 text-black text-[11px] font-black uppercase tracking-wide hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                            >
                                Confirmar conversión
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
