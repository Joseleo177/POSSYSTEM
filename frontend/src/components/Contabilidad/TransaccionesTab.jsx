import React, { useState } from "react";
import { useTransacciones } from "../../hooks/contabilidad/useTransacciones";
import ReturnModal from "../ReturnModal";
import ConfirmModal from "../ui/ConfirmModal";
import PaymentFormModal from "../PaymentFormModal";
import EditSaleModal from "../cobro/EditSaleModal";
import SaleDetailModal from "../Customers/SaleDetailModal";
import StatusMark, { statusTone } from "../ui/StatusMark";
import Money from "../ui/Money";
import { fmtDateShort, fmtTime, fmtDayLabel, toLocalISO, toNameCase } from "../../helpers";
import DateRangePicker from "../ui/DateRangePicker";
import CustomSelect from "../ui/CustomSelect";
import Pagination from "../ui/Pagination";
import { api } from "../../services/api";

// Filas de la tabla: una cabecera por día y debajo sus facturas. El servidor ya las manda
// por created_at descendente, así que basta con cortar cuando cambia el día local.
const groupByDay = (sales) => {
    const rows = [];
    let lastDay = null;
    for (const sale of sales) {
        const day = toLocalISO(new Date(sale.created_at));
        if (day !== lastDay) { rows.push({ day, at: sale.created_at }); lastDay = day; }
        rows.push({ sale });
    }
    return rows;
};

const Icon = ({ d }) => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
    </svg>
);
const ICON_EDIT    = "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z";
const ICON_RECEIPT = "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z";
const ICON_RETURN  = "M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6";
const ICON_TRASH   = "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16";

export default function TransaccionesTab({ notify, can, allSeries, fmtPrice, setReceiptSale }) {
    const {
        sales, total, sumTotal, sumPaid, sumPending, sumForgiven, page, setPage, loading, LIMIT,
        histDateFrom, setHistDateFrom, histDateTo, setHistDateTo,
        searchTerm, setSearchTerm,
        activeFilters, activeSeries,
        employeeId, setEmployeeId, employees,
        warehouseId, setWarehouseId, warehouses,
        showFilterDrop, setShowFilterDrop,
        saleDetail, setSaleDetail,
        returnSale, setReturnSale,
        cancelConfirm, setCancelConfirm,
        toggleFilter, toggleSerie, clearFilters,
        cancelSale, loadSales,
        hasFilters, totalPages,
    } = useTransacciones({ notify });

    // Las notas de crédito viven en su propia pestaña: filtrar facturas por una serie de NC
    // no devolvería nada y solo ensuciaría el desplegable.
    // Cada serie es de UNA sucursal (no hay series compartidas, a diferencia de los diarios de
    // pago): con una sucursal elegida, las de las demás no pueden dar resultados.
    const invoiceSeries = (allSeries || []).filter(s =>
        s.type !== "nc" && (!warehouseId || s.warehouse_id === Number(warehouseId)));

    // Igual que la serie: un empleado que nunca trabajó en esta sucursal no puede haber hecho
    // ninguna venta ahí. `e.warehouses` lo trae `GET /employees` (ver AssignEmployeesModal).
    const visibleEmployees = (employees || []).filter(e =>
        !warehouseId || (e.warehouses || []).some(w => w.id === Number(warehouseId)));

    const [payModal, setPayModal] = useState(null);
    const [editModal, setEditModal] = useState(null);
    const [loadingReturn, setLoadingReturn] = useState(null);

    // Deshacer una exoneración: la factura vuelve a cuentas por cobrar con el saldo que tenía.
    const unforgive = async (sale) => {
        try {
            await api.sales.unforgive(sale.id);
            notify("Exoneración deshecha: la factura vuelve a deberse");
            loadSales();
        } catch (e) { notify(e.message, "err"); }
    };

    const openReturnModal = async (sale) => {
        setLoadingReturn(sale.id);
        try {
            const res = await api.sales.getOne(sale.id);
            setReturnSale(res.data);
        } catch { setReturnSale(sale); }
        setLoadingReturn(null);
    };

    const subheader = (
        <div className="shrink-0 px-4 py-2 border-b border-border/20 dark:border-white/5 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-subtle/70 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input type="text" placeholder="Buscar por factura, cliente o RIF..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="input h-9 pl-9 w-full" />
            </div>

            <div className="relative">
                <button
                    onClick={() => setShowFilterDrop(p => !p)}
                    className={["h-9 px-3 rounded-lg text-[13px] font-medium border flex items-center gap-2 transition-colors",
                        hasFilters ? "bg-brand-500/10 text-brand-700 dark:text-brand-300 border-brand-500/40" : "bg-white dark:bg-white/5 border-border dark:border-white/10 text-content-muted dark:text-white/70 hover:bg-surface-2 hover:text-content dark:hover:text-white"
                    ].join(" ")}
                >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
                    Filtros
                    {hasFilters && (
                        <span className="bg-content text-white dark:bg-white dark:text-black min-w-4 h-4 px-1 rounded-full flex items-center justify-center text-[9px]">
                            {activeFilters.length + activeSeries.length + (employeeId ? 1 : 0) + (warehouseId ? 1 : 0) + (histDateFrom || histDateTo ? 1 : 0)}
                        </span>
                    )}
                </button>
                {showFilterDrop && (
                    <>
                        <div className="fixed inset-0 z-[60]" onClick={() => setShowFilterDrop(false)} />
                        <div className="absolute top-full right-0 mt-1 w-72 bg-white dark:bg-surface-dark-2 border border-black/[0.07] dark:border-white/10 rounded-xl shadow-[0_12px_40px_-8px_rgb(0_0_0/0.22)] z-[70] popover-in">
                            <div className="px-4 py-3 border-b border-border/20 dark:border-white/5">
                                <div className="text-[12px] font-medium text-content-subtle mb-2">Estado</div>
                                <div className="grid grid-cols-2 gap-1.5">
                                    {[{ id: 'borrador', label: 'Borrador' }, { id: 'pendiente', label: 'Pendiente' }, { id: 'parcial', label: 'Parcial' }, { id: 'pagado', label: 'Pagada' }, { id: 'exonerado', label: 'Exonerada' }, { id: 'anulado', label: 'Anulada' }].map(f => (
                                        <button key={f.id} onClick={() => toggleFilter(f.id)}
                                            className={`h-8 px-2.5 rounded-lg text-[13px] font-medium border transition-all ${activeFilters.includes(f.id) ? "bg-brand-500/10 text-brand-700 dark:text-brand-300 border-brand-500/40" : "border-border dark:border-white/10 text-content-muted dark:text-white/70 hover:bg-surface-2 hover:text-content dark:hover:bg-white/5 dark:hover:text-white"}`}>
                                            {f.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {invoiceSeries.length > 1 && (
                                <div className="px-4 py-3 border-b border-border/20 dark:border-white/5">
                                    <div className="text-[12px] font-medium text-content-subtle mb-2">Serie</div>
                                    <div className="grid grid-cols-2 gap-1.5">
                                        {invoiceSeries.map(s => (
                                            <button key={s.id} onClick={() => toggleSerie(s.id)}
                                                className={`h-8 px-2.5 rounded-lg text-[13px] font-medium border transition-all truncate ${activeSeries.includes(s.id) ? "bg-brand-500/10 text-brand-700 dark:text-brand-300 border-brand-500/40" : "border-border dark:border-white/10 text-content-muted dark:text-white/70 hover:bg-surface-2 hover:text-content dark:hover:bg-white/5 dark:hover:text-white"}`}
                                                title={s.name}>
                                                {s.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {/* Empleado: un desplegable y no botones como estado y serie, porque
                                la lista crece con la nómina y en una plantilla de diez no
                                entrarían en el panel. Sin permiso para ver empleados la lista
                                llega vacía y la sección no se dibuja. */}
                            {visibleEmployees.length > 0 && (
                                <div className="px-4 py-3 border-b border-border/20 dark:border-white/5">
                                    <div className="text-[12px] font-medium text-content-subtle mb-2">Empleado</div>
                                    <CustomSelect
                                        value={employeeId}
                                        onChange={setEmployeeId}
                                        height="h-8"
                                        placeholder="Todos"
                                        options={[
                                            { value: "", label: "Todos" },
                                            ...visibleEmployees.map(e => ({ value: e.id, label: e.full_name || e.username })),
                                        ]}
                                    />
                                </div>
                            )}
                            {/* Sucursal: con una sola no aporta nada elegir entre ella misma. */}
                            {warehouses.length > 1 && (
                                <div className="px-4 py-3 border-b border-border/20 dark:border-white/5">
                                    <div className="text-[12px] font-medium text-content-subtle mb-2">Sucursal</div>
                                    <CustomSelect
                                        value={warehouseId}
                                        onChange={setWarehouseId}
                                        height="h-8"
                                        placeholder="Todas"
                                        options={[
                                            { value: "", label: "Todas" },
                                            ...warehouses.map(w => ({ value: String(w.id), label: w.name })),
                                        ]}
                                    />
                                </div>
                            )}
                            <div className="px-4 py-3 border-b border-border/20 dark:border-white/5">
                                <div className="text-[12px] font-medium text-content-subtle mb-2">Rango de fecha</div>
                                <DateRangePicker from={histDateFrom} to={histDateTo} setFrom={setHistDateFrom} setTo={setHistDateTo} />
                            </div>
                            <div className="px-4 py-2">
                                <button onClick={clearFilters} className="w-full h-8 text-[13px] font-medium text-content-muted hover:text-content hover:bg-surface-2 dark:text-white/60 dark:hover:text-white dark:hover:bg-white/5 rounded-lg transition-colors">
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
                {/* Tabla libro: la fila entera abre el detalle (antes, un botón "Detalles"
                    repetido en cada fila). Las acciones siguen visibles —hay tablets— pero en
                    gris: el único botón con peso es "Cobrar", y solo sale donde hay deuda. */}
                <div className="overflow-auto flex-1">
                    <table className="table-ledger min-w-[760px]">
                        <colgroup>
                            <col className="w-[76px]" />
                            <col className="w-[150px]" />
                            <col />
                            <col className="w-[130px]" />
                            <col className="w-[170px]" />
                            <col className="w-px" />
                        </colgroup>
                        <thead className="sticky top-0 z-10">
                            <tr>
                                <th className="pl-4">Hora</th>
                                <th>Factura</th>
                                <th>Cliente</th>
                                <th>Estado</th>
                                <th className="text-right">Total</th>
                                <th className="pr-4"><span className="sr-only">Acciones</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                Array.from({ length: 8 }, (_, i) => (
                                    <tr key={i} aria-hidden="true">
                                        {["w-10", "w-24", "w-48", "w-16", "w-20 ml-auto", "w-24 ml-auto"].map((w, j) => (
                                            <td key={j} className={j === 0 ? "pl-4" : j === 5 ? "pr-4" : ""}>
                                                <div className={`h-2.5 rounded-full bg-surface-3 dark:bg-white/[0.06] animate-pulse ${w}`} />
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            ) : sales.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="!h-auto py-20 text-center !border-b-0">
                                        <svg className="w-8 h-8 mx-auto mb-3 text-content-subtle/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={ICON_RECEIPT} />
                                        </svg>
                                        <div className="text-[13px] font-semibold text-content dark:text-white">Sin facturas</div>
                                        <div className="text-[12px] text-content-subtle mt-1">
                                            {hasFilters ? "Ninguna coincide con los filtros aplicados." : "Aquí aparecerán las ventas facturadas."}
                                        </div>
                                        {hasFilters && (
                                            <button onClick={clearFilters} className="mt-4 h-8 px-3 rounded-lg text-[12px] font-semibold text-content dark:text-white border border-border dark:border-white/10 hover:bg-surface-2 dark:hover:bg-white/5 transition-colors">
                                                Quitar filtros
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ) : groupByDay(sales).map(row => row.day ? (
                                <tr key={`d-${row.day}`} className="ledger-day">
                                    <td colSpan={6} className="pl-4">
                                        <div className="flex items-baseline gap-2.5">
                                            <span className="text-[14px] font-bold tracking-[-0.01em] text-content dark:text-white">{fmtDayLabel(row.at)}</span>
                                            <span className="text-[12px] font-medium text-content-subtle tabular-nums">{fmtDateShort(row.at)}</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : (() => {
                                const sale = row.sale;
                                const anulada = sale.status === "anulado";
                                const tone = statusTone(sale.status);
                                const open = () => setSaleDetail(sale);
                                return (
                                    <tr
                                        key={sale.id}
                                        className="ledger-row"
                                        tabIndex={0}
                                        onClick={open}
                                        onKeyDown={e => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(); } }}
                                        data-tone={tone ? "" : undefined}
                                        style={tone ? { "--row-tone": tone } : undefined}
                                    >
                                        <td className="pl-4">
                                            <span className="text-[13px] font-medium text-content-subtle tabular-nums">{fmtTime(sale.created_at)}</span>
                                        </td>
                                        <td>
                                            <span className={`text-[13px] font-semibold tabular-nums ${anulada ? "text-content-subtle line-through decoration-1" : "text-brand-700 dark:text-brand-300"}`}>
                                                {sale.invoice_number || `#${sale.id}`}
                                            </span>
                                            {warehouses.length > 1 && sale.warehouse_name && (
                                                <span className="block text-[12px] font-medium text-content-subtle truncate">{toNameCase(sale.warehouse_name)}</span>
                                            )}
                                        </td>
                                        <td className="max-w-0">
                                            <span className={`block truncate font-semibold ${anulada ? "text-content-subtle" : "text-content dark:text-white"}`}>
                                                {toNameCase(sale.customer_name) || "Consumidor final"}
                                            </span>
                                            {sale.journal_name && (
                                                <span className="flex items-center gap-1.5 text-[12px] font-medium text-content-subtle truncate">
                                                    <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-content-subtle/40" style={sale.journal_color ? { backgroundColor: sale.journal_color } : undefined} />
                                                    {toNameCase(sale.journal_name)}
                                                </span>
                                            )}
                                        </td>
                                        <td><StatusMark status={sale.status} /></td>
                                        <td className="text-right">
                                            <Money
                                                value={fmtPrice(sale.total)}
                                                strike={anulada}
                                                className={`text-[14px] font-semibold ${anulada ? "text-content-subtle" : "text-content dark:text-white"}`}
                                            />
                                            {sale.status === "parcial" && (
                                                <div className="text-[11px] text-red-600 dark:text-red-400">
                                                    Saldo <Money value={fmtPrice(sale.balance)} className="text-[11px]" />
                                                </div>
                                            )}
                                            {sale.forgiven_amount > 0.001 && (
                                                <div className="text-[11px] text-violet-600 dark:text-violet-400">
                                                    Exonerado <Money value={fmtPrice(sale.forgiven_amount)} className="text-[11px]" />
                                                </div>
                                            )}
                                        </td>
                                        {/* El clic en una acción no debe abrir además el detalle. */}
                                        <td className="pr-4 whitespace-nowrap cursor-default" onClick={e => e.stopPropagation()}>
                                            <div className="flex items-center justify-end gap-0.5">
                                                {(sale.status === "borrador" || sale.status === "pendiente" || sale.status === "parcial") && (
                                                    <button
                                                        onClick={() => setPayModal(sale)}
                                                        className="h-8 px-3 mr-1.5 rounded-lg text-[12px] font-semibold btn-accent active:scale-95 transition-all"
                                                    >
                                                        Cobrar
                                                    </button>
                                                )}
                                                {sale.status === "borrador" && (
                                                    <button onClick={() => setEditModal(sale)} className="row-icon" title="Editar borrador" aria-label="Editar borrador">
                                                        <Icon d={ICON_EDIT} />
                                                    </button>
                                                )}
                                                <button onClick={() => setReceiptSale(sale)} className="row-icon" title="Ver recibo" aria-label="Ver recibo">
                                                    <Icon d={ICON_RECEIPT} />
                                                </button>
                                                {(sale.status === "pagado" || sale.status === "parcial") && (
                                                    <button onClick={() => openReturnModal(sale)} disabled={loadingReturn === sale.id} className="row-icon hover:!text-amber-600 dark:hover:!text-amber-400" title="Devolver" aria-label="Devolver">
                                                        {loadingReturn === sale.id
                                                            ? <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                                                            : <Icon d={ICON_RETURN} />
                                                        }
                                                    </button>
                                                )}
                                                {sale.status === "exonerado" && can("sales.forgive") && (
                                                    <button onClick={() => unforgive(sale)} className="row-icon hover:!text-violet-600 dark:hover:!text-violet-400" title="Deshacer exoneración: la factura vuelve a deberse" aria-label="Deshacer exoneración">
                                                        <Icon d={ICON_RETURN} />
                                                    </button>
                                                )}
                                                {can("admin") && !anulada && (
                                                    <button onClick={() => setCancelConfirm(sale)} className="row-icon hover:!text-red-600 hover:!bg-red-500/10 dark:hover:!text-red-400" title="Anular" aria-label="Anular">
                                                        <Icon d={ICON_TRASH} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })())}
                        </tbody>

                        {/* Sumador al pie. Los totales vienen del servidor y corresponden al filtro
                            COMPLETO, no a la página. Van en moneda base, la única común entre
                            facturas cobradas en distintas monedas. */}
                        {!loading && sales.length > 0 && (
                            <tfoot className="sticky bottom-0">
                                <tr>
                                    <td colSpan={4} className="pl-4">
                                        <div className="text-[13px] font-semibold text-content dark:text-white">Total del filtro</div>
                                        <div className="text-[11px] text-content-subtle">
                                            <span className="tabular-nums">{total.toLocaleString("es-VE")}</span> {total === 1 ? "factura" : "facturas"}
                                        </div>
                                    </td>
                                    <td className="text-right">
                                        <Money value={fmtPrice(sumTotal)} className="text-[15px] font-semibold text-content dark:text-white" />
                                        <div className="text-[11px] text-emerald-700 dark:text-emerald-400">
                                            Cobrado <Money value={fmtPrice(sumPaid)} className="text-[11px]" />
                                        </div>
                                        {/* El pendiente lo calcula el servidor, no es total − cobrado:
                                            así una factura anulada aportaba su monto completo a la
                                            deuda pese a no deber nada. */}
                                        {sumForgiven > 0.001 && (
                                            <div className="text-[11px] text-violet-600 dark:text-violet-400">
                                                Exonerado <Money value={fmtPrice(sumForgiven)} className="text-[11px]" />
                                            </div>
                                        )}
                                        {sumPending > 0.001 && (
                                            <div className="text-[11px] font-semibold text-red-600 dark:text-red-400">
                                                Pendiente <Money value={fmtPrice(sumPending)} className="text-[11px]" />
                                            </div>
                                        )}
                                    </td>
                                    <td className="pr-4" />
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>

                <Pagination page={page} totalPages={totalPages} total={total} limit={LIMIT} onPageChange={setPage} />
            </div>

            {returnSale && (
                <ReturnModal open={!!returnSale} onClose={() => setReturnSale(null)} sale={returnSale} onReturnSuccess={loadSales} notify={notify} />
            )}

            {payModal && (
                <PaymentFormModal
                    sale={payModal}
                    onClose={() => setPayModal(null)}
                    onSuccess={() => { setPayModal(null); loadSales(); }}
                />
            )}

            <EditSaleModal
                open={!!editModal}
                onClose={() => setEditModal(null)}
                sale={editModal}
                notify={notify}
                onSaved={loadSales}
            />

            <ConfirmModal
                isOpen={!!cancelConfirm}
                title="¿Anular transacción?"
                message={`¿Estás seguro de que deseas anular la factura ${cancelConfirm?.invoice_number || '#' + cancelConfirm?.id}? Se restaurará el stock original de los productos.`}
                onConfirm={async () => { await cancelSale(cancelConfirm.id); setCancelConfirm(null); }}
                onCancel={() => setCancelConfirm(null)}
                type="danger"
                confirmText="Sí, anular venta"
            />

            {saleDetail && (
                <SaleDetailModal saleId={saleDetail.id} onClose={() => setSaleDetail(null)} />
            )}
        </div>
    );
}
