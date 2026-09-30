import { useState } from "react";
import { useQuotations } from "../../hooks/contabilidad/useQuotations";
import ConfirmModal from "../ui/ConfirmModal";
import DateRangePicker from "../ui/DateRangePicker";
import Pagination from "../ui/Pagination";
import { fmtDateShort, fmtDate, printQuotationDoc, printQuotationLetter, toNameCase } from "../../helpers";
import StatusMark from "../ui/StatusMark";
import Money from "../ui/Money";
import { ledgerRow, stopRow, LedgerSkeleton, LedgerEmpty, RowIcon } from "../ui/Ledger";
import { useApp } from "../../context/AppContext";
import { useCart } from "../../context/CartContext";
import { api } from "../../services/api";

// Para la tabla y el detalle. Una cotización pendiente no es una deuda: azul de "en curso", no rojo.
const QUOTE_STATUS = {
    pendiente:  { label: "Pendiente",  tone: "info" },
    convertida: { label: "Convertida", tone: "success", quiet: "check" },
    anulada:    { label: "Anulada",    tone: "neutral", quiet: "void" },
};

function QuotDetailModal({ quot, onClose, onPrint, onLoadToCart, onCancel, onDelete, can, fmtPrice }) {

    if (!quot) return null;
    const items    = quot.items || [];
    const anulada  = quot.status === "anulada";
    const discount = parseFloat(quot.discount_amount) || 0;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40 dark:bg-black/60 backdrop-blur-[2px] overlay-in" onClick={onClose}>
            <div className="w-full max-w-lg bg-white dark:bg-surface-dark-2 border border-black/[0.06] dark:border-white/[0.08] rounded-xl shadow-[0_24px_64px_-12px_rgb(0_0_0/0.25)] overflow-hidden flex flex-col max-h-[90vh] modal-in" onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="shrink-0 pl-5 pr-3 pt-4 pb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-surface-3 dark:bg-white/[0.06] text-content-muted dark:text-white/70 flex items-center justify-center shrink-0">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                        </div>
                        <div className="min-w-0">
                            <div className="text-[12px] text-content-subtle">Cotización</div>
                            <div className="text-[16px] font-bold tracking-[-0.01em] text-content dark:text-white tabular-nums">#{quot.id}</div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                        <StatusMark status={quot.status} map={QUOTE_STATUS} />
                        <button onClick={onClose} aria-label="Cerrar" className="w-8 h-8 rounded-lg flex items-center justify-center text-content-subtle hover:text-content hover:bg-surface-3 dark:hover:text-white dark:hover:bg-white/[0.06] transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>
                    </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5 pt-1 space-y-5">
                    {/* ── Cabecera: a quién y cuánto ── */}
                    <div className="rounded-xl bg-surface-2 dark:bg-white/[0.03] border border-border/60 dark:border-white/[0.06] px-4 py-3.5 flex items-start justify-between gap-4">
                        <div className="min-w-0">
                            <p className="text-[12px] text-content-subtle">Cliente</p>
                            <p className="text-[15px] font-semibold text-content dark:text-white truncate">{toNameCase(quot.customer_name) || "Consumidor final"}</p>
                            {quot.customer_rif && <p className="text-[12px] text-content-subtle tabular-nums">{quot.customer_rif}</p>}
                        </div>
                        <div className="text-right shrink-0">
                            <p className="text-[12px] text-content-subtle">Total</p>
                            <Money value={fmtPrice(quot.total)} strike={anulada} className={`block text-[24px] font-bold tracking-tight leading-tight ${anulada ? "text-content-subtle" : "text-content dark:text-white"}`} />
                            {discount > 0 && (
                                <p className="text-[12px] text-content-subtle tabular-nums">Descuento <Money value={`-${fmtPrice(discount)}`} /></p>
                            )}
                        </div>
                    </div>

                    {/* ── Datos del documento ── */}
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                        <div className="min-w-0">
                            <dt className="text-[12px] text-content-subtle">Fecha</dt>
                            <dd className="text-[13px] font-medium text-content dark:text-white tabular-nums truncate">{fmtDate(quot.created_at)}</dd>
                        </div>
                        <div className="min-w-0">
                            <dt className="text-[12px] text-content-subtle">Vendedor</dt>
                            <dd className="text-[13px] font-medium text-content dark:text-white truncate">{toNameCase(quot.employee_name) || "—"}</dd>
                        </div>
                        {quot.notes && (
                            <div className="col-span-2">
                                <dt className="text-[12px] text-content-subtle">Notas</dt>
                                <dd className="text-[13px] font-medium text-content dark:text-white">{quot.notes}</dd>
                            </div>
                        )}
                    </dl>

                    {/* ── Productos: dos renglones por línea ── */}
                    <div>
                        <p className="text-[13px] font-semibold text-content dark:text-white mb-2">
                            Productos <span className="font-normal text-content-subtle">· {items.length}</span>
                        </p>
                        <div className="rounded-xl border border-border/70 dark:border-white/[0.08] divide-y divide-border/60 dark:divide-white/[0.06]">
                            {items.length === 0 ? (
                                <p className="px-3.5 py-6 text-center text-[13px] text-content-subtle">Sin líneas</p>
                            ) : items.map((item, idx) => (
                                <div key={idx} className="px-3.5 py-2.5">
                                    <div className="flex items-baseline justify-between gap-3">
                                        <span className="text-[13px] font-medium text-content dark:text-white min-w-0 truncate">{item.product_name}</span>
                                        <Money value={fmtPrice(item.subtotal)} className="text-[13px] font-semibold text-content dark:text-white shrink-0" />
                                    </div>
                                    <div className="text-[12px] text-content-subtle tabular-nums mt-0.5">{parseFloat(item.quantity)} × {fmtPrice(item.price)}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Acciones. En el teléfono van apiladas: la principal a todo el ancho y las
                    que borran al final, lejos de ella. Antes, con cuatro en fila, las etiquetas
                    se partían letra a letra. */}
                <div className="shrink-0 px-5 py-4 border-t border-border/60 dark:border-white/[0.06] flex flex-col sm:flex-row sm:items-center gap-2">
                    {quot.status === "pendiente" && can("admin") && (
                        <button onClick={() => onCancel(quot)} className={`${BTN_BORRAR} order-last sm:order-none sm:mr-auto`}>
                            Anular
                        </button>
                    )}
                    {anulada && can("admin") && (
                        <button onClick={() => onDelete(quot)} className={`${BTN_BORRAR} order-last sm:order-none sm:mr-auto`}>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            Eliminar
                        </button>
                    )}
                    <div className={`flex gap-2 ${(quot.status === "pendiente" || anulada) && can("admin") ? "" : "sm:ml-auto"}`}>
                        <button onClick={() => onPrint(quot, true)} title="Cotización tamaño carta, para enviar al cliente" className={BTN_SECUNDARIO}>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            PDF
                        </button>
                        <button onClick={() => onPrint(quot)} title="Cotización en la impresora térmica" className={BTN_SECUNDARIO}>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                            </svg>
                            Imprimir
                        </button>
                    </div>
                    {quot.status === "pendiente" && (
                        <button onClick={() => onLoadToCart(quot)}
                            className="btn-accent h-11 px-5 rounded-lg text-[14px] font-semibold whitespace-nowrap inline-flex items-center justify-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                            Abrir en caja
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

const BTN_SECUNDARIO = "btn-outline flex-1 sm:flex-none h-11 px-4 rounded-lg text-[13px] font-medium whitespace-nowrap inline-flex items-center justify-center gap-1.5";
// Anular y eliminar: texto rojo, sin caja, para que no compitan con la acción principal.
const BTN_BORRAR = "h-11 px-3 rounded-lg text-[13px] font-medium whitespace-nowrap inline-flex items-center justify-center gap-1.5 text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors";

export default function CotizacionesTab({ notify, can, fmtPrice }) {
    const q = useQuotations({ notify });
    const { companyInfo, baseCurrency, activeCurrencies, navigateTo, printerWidth } = useApp();
    const { loadFromQuotation } = useCart();
    const [showFilterDrop, setShowFilterDrop] = useState(false);

    // Dos salidas del mismo documento: térmica para el mostrador y carta para enviárselo al
    // cliente. El rollo guardado como PDF sale como una tira angosta que no se puede leer.
    const handlePrint = async (quot, letter = false) => {
        try {
            const res = await api.quotations.getOne(quot.id);
            if (letter) printQuotationLetter(res.data, companyInfo, baseCurrency, activeCurrencies);
            else printQuotationDoc(res.data, companyInfo, baseCurrency, activeCurrencies, printerWidth);
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
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-subtle/70 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                    type="text"
                    placeholder="Buscar por #, cliente o RIF..."
                    value={q.searchTerm}
                    onChange={e => q.setSearchTerm(e.target.value)}
                    className="input h-9 pl-9 w-full"
                />
            </div>

            <div className="relative">
                <button
                    onClick={() => setShowFilterDrop(p => !p)}
                    className={["h-9 px-3 rounded-lg text-[13px] font-medium border flex items-center gap-2 transition-colors",
                        q.hasFilters
                            ? "bg-brand-500/10 text-brand-700 dark:text-brand-300 border-brand-500/40"
                            : "bg-white dark:bg-white/5 border-border dark:border-white/10 text-content-muted dark:text-white/70 hover:bg-surface-2 hover:text-content dark:hover:text-white"
                    ].join(" ")}
                >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                    </svg>
                    Filtros
                    {q.hasFilters && (
                        <span className="bg-content text-white dark:bg-white dark:text-black min-w-4 h-4 px-1 rounded-full flex items-center justify-center text-[10px]">
                            {(q.statusFilter ? 1 : 0) + (q.dateFrom || q.dateTo ? 1 : 0)}
                        </span>
                    )}
                </button>
                {showFilterDrop && (
                    <>
                        <div className="fixed inset-0 z-[60]" onClick={() => setShowFilterDrop(false)} />
                        <div className="absolute top-full right-0 mt-1 w-72 bg-white dark:bg-surface-dark-2 border border-black/[0.07] dark:border-white/10 rounded-xl shadow-[0_12px_40px_-8px_rgb(0_0_0/0.22)] z-[70] popover-in">
                            <div className="px-4 py-3 border-b border-border/20 dark:border-white/5">
                                <div className="text-[12px] font-medium text-content-subtle mb-2">Estado</div>
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
                                                className={`h-8 px-2.5 rounded-lg text-[13px] font-medium border transition-all ${active ? "bg-brand-500/10 text-brand-700 dark:text-brand-300 border-brand-500/40" : "border-border dark:border-white/10 text-content-muted dark:text-white/70 hover:bg-surface-2 hover:text-content dark:hover:bg-white/5 dark:hover:text-white"}`}>
                                                {f.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className="px-4 py-3 border-b border-border/20 dark:border-white/5">
                                <div className="text-[12px] font-medium text-content-subtle mb-2">Rango de fecha</div>
                                <DateRangePicker from={q.dateFrom} to={q.dateTo} setFrom={q.setDateFrom} setTo={q.setDateTo} />
                            </div>
                            <div className="px-4 py-2">
                                <button onClick={() => { q.clearFilters(); setShowFilterDrop(false); }}
                                    className="w-full h-8 text-[13px] font-medium text-content-muted hover:text-content hover:bg-surface-2 dark:text-white/60 dark:hover:text-white dark:hover:bg-white/5 rounded-lg transition-colors">
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
                <div className="overflow-auto flex-1">
                    <table className="table-ledger min-w-[720px]">
                        <thead className="sticky top-0 z-10">
                            <tr>
                                <th className="pl-4">Cotización</th>
                                <th>Estado</th>
                                <th>Cliente</th>
                                <th>Fecha</th>
                                <th>Líneas</th>
                                <th className="text-right">Total</th>
                                <th className="pr-4 w-px"><span className="sr-only">Acciones</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {q.loading ? (
                                <LedgerSkeleton cols={7} />
                            ) : q.quotations.length === 0 ? (
                                <LedgerEmpty cols={7} title="Sin cotizaciones" hint="Las cotizaciones hechas desde el punto de venta aparecerán aquí." />
                            ) : q.quotations.map(quot => {
                                const anulada = quot.status === "anulada";
                                const lineas = (quot.items || []).length;
                                return (
                                    <tr key={quot.id} {...ledgerRow(() => q.setSelectedQuot(quot))}>
                                        <td className="pl-4">
                                            <span className={`text-[13px] font-semibold tabular-nums ${anulada ? "text-content-subtle line-through decoration-1" : "text-brand-700 dark:text-brand-300"}`}>#{quot.id}</span>
                                        </td>
                                        <td><StatusMark status={quot.status} map={QUOTE_STATUS} /></td>
                                        <td className="max-w-0">
                                            <span className={`block truncate font-semibold ${anulada ? "text-content-subtle" : "text-content dark:text-white"}`}>
                                                {toNameCase(quot.customer_name) || "Consumidor final"}
                                            </span>
                                            {quot.customer_rif && (
                                                <span className="block text-[12px] text-content-subtle tabular-nums">{quot.customer_rif}</span>
                                            )}
                                        </td>
                                        <td>
                                            <span className="text-[12px] font-medium text-content-subtle tabular-nums whitespace-nowrap">{fmtDateShort(quot.created_at)}</span>
                                        </td>
                                        <td>
                                            <span className="text-[12px] font-medium text-content-subtle tabular-nums">{lineas} {lineas === 1 ? "línea" : "líneas"}</span>
                                        </td>
                                        <td className="text-right">
                                            <Money value={fmtPrice(quot.total)} strike={anulada} className={`text-[14px] font-semibold ${anulada ? "text-content-subtle" : "text-content dark:text-white"}`} />
                                        </td>
                                        <td className="pr-4 whitespace-nowrap cursor-default" onClick={stopRow}>
                                            <div className="flex items-center justify-end gap-0.5">
                                                <RowIcon icon="print" title="Imprimir cotización" onClick={() => handlePrint(quot)} />
                                                {quot.status === "pendiente" && can("admin") && (
                                                    <RowIcon icon="ban" tone="danger" title="Anular cotización" onClick={() => handleCancel(quot)} />
                                                )}
                                                {anulada && can("admin") && (
                                                    <RowIcon icon="trash" tone="danger" title="Eliminar cotización" onClick={() => handleDelete(quot)} />
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
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
