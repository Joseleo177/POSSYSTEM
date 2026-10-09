import { useRef } from "react";
import { usePagos } from "../../hooks/contabilidad/usePagos";
import FilterPopover from "../ui/FilterPopover";
import PaymentFormModal from "../PaymentFormModal";
import Modal from "../ui/Modal";
import ConfirmModal from "../ui/ConfirmModal";
import Pagination from "../ui/Pagination";
import DateRangePicker from "../ui/DateRangePicker";
import CustomSelect from "../ui/CustomSelect";
import { useApp } from "../../context/AppContext";
import StatusMark, { statusTone } from "../ui/StatusMark";
import Money from "../ui/Money";
import Segmented from "../ui/Segmented";
import { ledgerRow, stopRow, LedgerSkeleton, LedgerEmpty, JournalDot, RowIcon, RowCta } from "../ui/Ledger";
import { journalsForWarehouse, fmtDate, toNameCase } from "../../helpers";

// Cobro casado con una línea del extracto del banco (Conciliación). Es la confirmación de que
// el dinero llegó: lo normal, así que va en gris con su visto.
const VERIFIED = { ok: { label: "Conciliado", tone: "success", quiet: "check" } };

export default function PagosTab({ notify, can, baseCurrency, fmtPrice, fmtPayment, setReceiptSale, journals = [] }) {
    const {
        data, total, sumBase, sumLocal, currencyCount, currencyId, page, setPage, loading, LIMIT,
        viewType,
        searchTerm, setSearchTerm,
        payDateFrom, setPayDateFrom,
        payDateTo, setPayDateTo,
        journalFilter, setJournalFilter,
        employeeFilter, setEmployeeFilter, employees,
        warehouseFilter, setWarehouseFilter, warehouses,
        verifiedFilter, setVerifiedFilter,
        showFilterDrop, setShowFilterDrop,
        payDetail, setPayDetail,
        payModal, setPayModal,
        deleteDialog, setDeleteDialog,
        clearFilters, reload,
        confirmRemovePayment,
        hasFilters, filterCount, totalPages,
    } = usePagos({ notify });

    // Moneda en la que están hechos los cobros del filtro, cuando es una sola. El id lo dice el
    // servidor junto con los totales, así que el pie rotula con el símbolo correcto sin suponer
    // que la moneda secundaria del sistema es la del filtro.
    const { activeCurrencies } = useApp();
    const filterCurrency = currencyId ? (activeCurrencies || []).find(c => c.id === currencyId) : null;
    const filtrosBtnRef = useRef(null);

    // Con una sucursal elegida, ni un diario de otra ni un empleado que nunca trabajó ahí
    // pueden dar resultados. Un diario compartido (warehouse_id null) sigue apareciendo:
    // sirve a cualquier sucursal.
    const visibleJournals  = journalsForWarehouse(journals, warehouseFilter);
    const visibleEmployees = (employees || []).filter(e =>
        !warehouseFilter || (e.warehouses || []).some(w => w.id === Number(warehouseFilter)));

    const subheader = (
        <div className="shrink-0 px-4 py-2 border-b border-border/20 dark:border-white/5 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-subtle/70 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input type="text" placeholder="Buscar cliente o factura..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="input h-9 pl-9 w-full" />
            </div>

            <div className="relative">
                <button
                    ref={filtrosBtnRef}
                    onClick={() => setShowFilterDrop(p => !p)}
                    className={["h-9 px-3 rounded-lg text-[13px] font-medium border flex items-center gap-2 transition-colors",
                        hasFilters ? "bg-brand-500/10 text-brand-700 dark:text-brand-300 border-brand-500/40" : "bg-white dark:bg-white/5 border-border dark:border-white/10 text-content-muted dark:text-white/70 hover:bg-surface-2 hover:text-content dark:hover:text-white"
                    ].join(" ")}
                >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
                    Filtros
                    {hasFilters && <span className="bg-content text-white dark:bg-white dark:text-black min-w-4 h-4 px-1 rounded-full flex items-center justify-center text-[10px]">{filterCount}</span>}
                </button>
                <FilterPopover open={showFilterDrop} onClose={() => setShowFilterDrop(false)} anchorRef={filtrosBtnRef}>
                            {/* El selector de vista Historial / Por Cobrar se retiró de aquí: las
                                cuentas por cobrar tienen su propio módulo. La vista "pendientes"
                                sigue implementada en usePagos y en la tabla por si se reactiva. */}
                            {visibleJournals.length > 0 && (
                                <div className="px-4 py-3 border-b border-border/20 dark:border-white/5">
                                    <div className="text-[12px] font-medium text-content-subtle mb-2">Diario de pago</div>
                                    {/* Select y no rejilla de botones: los diarios los crea el usuario y
                                        no tienen tope, así que en botones los nombres salían truncados
                                        ("PAG MOVIL ME...") dentro de un scroll propio. Misma regla que
                                        en el catálogo: lista abierta, select; lista corta y fija, botones. */}
                                    <CustomSelect
                                        value={journalFilter}
                                        onChange={setJournalFilter}
                                        height="h-9"
                                        placeholder="Todos los diarios"
                                        options={[
                                            { value: "", label: "Todos los diarios" },
                                            ...visibleJournals.map(j => ({
                                                value: String(j.id),
                                                label: j.name,
                                                color: j.color || undefined,
                                            })),
                                        ]}
                                    />
                                </div>
                            )}
                            {/* Quién cobró. El cobro guarda su propio empleado: una factura la
                                puede emitir un cajero y cobrarla otro, así que este filtro no
                                es el mismo que el de Ventas. Select por lo mismo que el diario:
                                la lista crece con la nómina. */}
                            {visibleEmployees.length > 0 && (
                                <div className="px-4 py-3 border-b border-border/20 dark:border-white/5">
                                    <div className="text-[12px] font-medium text-content-subtle mb-2">Empleado</div>
                                    <CustomSelect
                                        value={employeeFilter}
                                        onChange={setEmployeeFilter}
                                        height="h-9"
                                        placeholder="Todos"
                                        options={[
                                            { value: "", label: "Todos" },
                                            ...visibleEmployees.map(e => ({ value: String(e.id), label: e.full_name || e.username })),
                                        ]}
                                    />
                                </div>
                            )}
                            {/* Con una sola sucursal no hay nada que elegir: mostrar el selector solo
                                insinuaría que hay más, cuando no las hay. */}
                            {warehouses.length > 1 && (
                                <div className="px-4 py-3 border-b border-border/20 dark:border-white/5">
                                    <div className="text-[12px] font-medium text-content-subtle mb-2">Sucursal</div>
                                    <CustomSelect
                                        value={warehouseFilter}
                                        onChange={setWarehouseFilter}
                                        height="h-9"
                                        placeholder="Todas"
                                        options={[
                                            { value: "", label: "Todas" },
                                            ...warehouses.map(w => ({ value: String(w.id), label: w.name })),
                                        ]}
                                    />
                                </div>
                            )}
                            {/* Verificado = casado con el extracto del banco en Conciliación. */}
                            <div className="px-4 py-3 border-b border-border/20 dark:border-white/5">
                                <div className="text-[12px] font-medium text-content-subtle mb-2">Banco</div>
                                <Segmented
                                    value={verifiedFilter}
                                    onChange={setVerifiedFilter}
                                    className="w-full [&>button]:flex-1 [&>button]:justify-center [&>button]:px-2"
                                    options={[
                                        { key: "", label: "Todos" },
                                        { key: "yes", label: "Conciliados" },
                                        { key: "no", label: "Sin conciliar" },
                                    ]}
                                />
                            </div>
                            <div className="px-4 py-3 border-b border-border/20 dark:border-white/5">
                                <div className="text-[12px] font-medium text-content-subtle mb-2">Rango de fechas</div>
                                <DateRangePicker compact from={payDateFrom} to={payDateTo} setFrom={setPayDateFrom} setTo={setPayDateTo} />
                            </div>
                            <div className="px-4 py-2">
                                <button onClick={clearFilters} className="w-full h-8 text-[13px] font-medium text-content-muted hover:text-content hover:bg-surface-2 dark:text-white/60 dark:hover:text-white dark:hover:bg-white/5 rounded-lg transition-colors">
                                    Limpiar todo
                                </button>
                            </div>
                </FilterPopover>
            </div>

        </div>
    );

    return (
        <div className="h-full flex flex-col overflow-hidden">
            {subheader}
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                {/* Tablet y escritorio: tabla. En el teléfono no cabía: el cliente quedaba en "Jose …". */}
                <div className="hidden md:block overflow-auto flex-1">
                    <table className="table-ledger min-w-[720px]">
                        <thead className="sticky top-0 z-10">
                            <tr>
                                {/* La columna cambia de contenido según la vista: en el historial
                                    muestra el diario del cobro; en pendientes, el estado de la factura. */}
                                <th className="pl-4">Referencia</th>
                                <th>{viewType === "pendientes" ? "Estado" : "Diario"}</th>
                                <th>Cliente</th>
                                <th>Fecha</th>
                                <th className="text-right">Monto</th>
                                <th className="pr-4 w-px"><span className="sr-only">Acciones</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <LedgerSkeleton cols={6} />
                            ) : data.length === 0 ? (
                                <LedgerEmpty cols={6} title={viewType === "pendientes" ? "Nada pendiente por cobrar" : "Sin cobros"} hint="No hay movimientos en esta vista." />
                            ) : data.map(item => {
                                const isInvoice = viewType === "pendientes";
                                // En el historial la fila abre el detalle del cobro (antes, un
                                // botón "Detalle" en cada fila). En pendientes manda el botón Cobrar.
                                const row = ledgerRow(isInvoice ? undefined : () => setPayDetail(item), isInvoice ? statusTone(item.status) : undefined);
                                return (
                                    <tr key={`${viewType}-${item.id}`} {...row}>
                                        <td className="pl-4">
                                            <span className="text-[13px] font-semibold text-brand-700 dark:text-brand-300 tabular-nums">
                                                {item.invoice_number || (isInvoice ? `Factura #${item.id}` : `Cobro #${item.id}`)}
                                            </span>
                                            {/* Un solo movimiento de dinero que saldó varias facturas: la
                                                fila es el movimiento, no cada factura. */}
                                            {item.group_count > 1 && (
                                                <div className="text-[12px] text-content-subtle">Cobro conjunto · {item.group_count} facturas</div>
                                            )}
                                            {/* Pago combinado: cada caja es su propia fila (su propio
                                                movimiento), pero el cobro fue uno solo. */}
                                            {item.batch_journal_count > 1 && (
                                                <div className="text-[12px] font-medium text-amber-700 dark:text-amber-400">Pago combinado · {item.batch_journal_count} formas</div>
                                            )}
                                            {!isInvoice && item.reference_number && (
                                                <div className="text-[12px] text-content-subtle tabular-nums">Ref. {item.reference_number}</div>
                                            )}
                                            {warehouses.length > 1 && item.warehouse_name && (
                                                <div className="text-[12px] text-content-subtle">{toNameCase(item.warehouse_name)}</div>
                                            )}
                                        </td>
                                        <td>
                                            {/* En el historial todas las filas son cobros hechos, así que
                                                un "Cobro realizado" repetido no decía nada: va el diario,
                                                que es el dato que cambia de fila a fila y con el que se
                                                concilia la caja. En pendientes sí manda el estado. */}
                                            {isInvoice ? (
                                                item.status === "borrador"
                                                    ? <StatusMark status="borrador" map={{ borrador: { label: "Sin factura", tone: "neutral" } }} />
                                                    : <StatusMark status={item.status === "parcial" ? "parcial" : "pendiente"} />
                                            ) : item.journal_name ? (
                                                <>
                                                    <JournalDot name={item.journal_name} color={item.journal_color} />
                                                    {item.verified && (
                                                        <div className="mt-0.5"><StatusMark status="ok" map={VERIFIED} /></div>
                                                    )}
                                                </>
                                            ) : (
                                                <span className="text-[12px] font-medium text-content-subtle">Devolución</span>
                                            )}
                                        </td>
                                        <td className="max-w-0">
                                            <span className="block truncate font-semibold text-content dark:text-white">{toNameCase(item.customer_name) || "Consumidor final"}</span>
                                        </td>
                                        <td>
                                            <span className="text-[12px] font-medium text-content-subtle tabular-nums whitespace-nowrap">{fmtDate(item.created_at)}</span>
                                        </td>
                                        <td className="text-right">
                                            <Money value={isInvoice ? fmtPrice(item.total) : fmtPayment(item)} className="text-[14px] font-semibold text-content dark:text-white" />
                                            {isInvoice && item.status === "parcial" && (
                                                <div className="text-[12px] text-red-600 dark:text-red-400">Debe <Money value={fmtPrice(item.balance)} /></div>
                                            )}
                                        </td>
                                        <td className="pr-4 whitespace-nowrap cursor-default" onClick={stopRow}>
                                            <div className="flex items-center justify-end gap-0.5">
                                                {isInvoice ? (
                                                    <>
                                                        <RowCta onClick={() => setPayModal(item)}>Cobrar</RowCta>
                                                        {item.status !== "borrador" && (
                                                            <RowIcon icon="doc" title="Ver factura" onClick={() => setReceiptSale(item)} />
                                                        )}
                                                    </>
                                                ) : can("admin") && (
                                                    <RowIcon icon="trash" tone="danger" title={item.group_count > 1 ? "Eliminar el cobro completo" : "Eliminar"} onClick={() => setDeleteDialog(item)} />
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>

                        {/* Sumador al pie. El total viene del servidor y corresponde al filtro
                            COMPLETO, no a la página: con 50 registros por página, sumar solo lo
                            visible daría una cifra que no es la que el usuario filtró. Va en
                            moneda base porque es la única común entre diarios de distinta moneda. */}
                        {!loading && data.length > 0 && viewType !== "pendientes" && (
                            <tfoot className="sticky bottom-0">
                                <tr>
                                    <td colSpan={4} className="pl-4">
                                        <div className="text-[13px] font-semibold text-content dark:text-white">Total del filtro</div>
                                        <div className="text-[12px] text-content-subtle tabular-nums">{total.toLocaleString("es-VE")} {total === 1 ? "cobro" : "cobros"}</div>
                                    </td>
                                    <td className="text-right">
                                        <Money value={fmtPrice(sumBase)} className="text-[15px] font-semibold text-content dark:text-white" />
                                        {/* Si todo el filtro comparte moneda, se muestra el monto REAL
                                            recibido —cada cobro a la tasa de su día—, que es el que
                                            cuadra con el estado de cuenta del diario. Convertir el
                                            total base a la tasa de hoy daba otra cifra: con tasas
                                            entre 737 y 780, la diferencia llegaba a miles de bolívares.
                                            Con monedas mezcladas no se muestra nada: sumar bolívares
                                            con divisas no significaría nada. */}
                                        {currencyCount === 1 && filterCurrency && !filterCurrency.is_base && (
                                            <div className="text-[12px] font-medium tabular-nums text-content-subtle">
                                                {filterCurrency.symbol}{sumLocal.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </div>
                                        )}
                                    </td>
                                    <td className="pr-4" />
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>

                {/* Teléfono: tarjetas. Referencia y monto arriba; el cliente a todo el ancho; el
                    diario con su marca de conciliado y la fecha debajo. El borrado (solo admin)
                    queda a la vista: en táctil no hay hover. */}
                <div className="md:hidden flex-1 overflow-y-auto px-4 py-3 space-y-2">
                    {loading ? (
                        <div className="py-16 flex justify-center"><div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
                    ) : data.length === 0 ? (
                        <div className="py-16 px-6 text-center">
                            <div className="text-[14px] font-semibold text-content dark:text-white">{viewType === "pendientes" ? "Nada pendiente por cobrar" : "Sin cobros"}</div>
                            <div className="text-[13px] text-content-subtle mt-1">No hay movimientos en esta vista.</div>
                        </div>
                    ) : data.map(item => {
                        const isInvoice = viewType === "pendientes";
                        const tone = isInvoice ? statusTone(item.status) : undefined;
                        const detalle = [
                            item.group_count > 1 ? `Cobro conjunto · ${item.group_count} facturas` : null,
                            !isInvoice && item.reference_number ? `Ref. ${item.reference_number}` : null,
                            warehouses.length > 1 && item.warehouse_name ? toNameCase(item.warehouse_name) : null,
                        ].filter(Boolean).join(" · ");
                        return (
                            <div key={`m-${viewType}-${item.id}`} role="button" tabIndex={0}
                                onClick={isInvoice ? undefined : () => setPayDetail(item)}
                                className="relative rounded-xl border border-border/70 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] pl-3.5 pr-2.5 py-3 overflow-hidden active:scale-[0.99] transition-transform">
                                {tone && <span aria-hidden="true" className="absolute left-0 inset-y-0 w-[3px]" style={{ backgroundColor: tone }} />}
                                <div className="flex items-start justify-between gap-3 pr-1">
                                    <span className="min-w-0 text-[14px] font-semibold text-brand-700 dark:text-brand-300 tabular-nums break-words">
                                        {item.invoice_number || (isInvoice ? `Factura #${item.id}` : `Cobro #${item.id}`)}
                                    </span>
                                    <Money value={isInvoice ? fmtPrice(item.total) : fmtPayment(item)} className="shrink-0 text-[15px] font-semibold text-content dark:text-white" />
                                </div>
                                <div className="mt-1 pr-1 flex items-baseline justify-between gap-3">
                                    <span className="min-w-0 text-[14px] font-semibold text-content dark:text-white truncate">{toNameCase(item.customer_name) || "Consumidor final"}</span>
                                    <span className="shrink-0 text-[12px] text-content-subtle tabular-nums whitespace-nowrap">{fmtDate(item.created_at)}</span>
                                </div>
                                {detalle && <div className="pr-1 text-[12px] text-content-subtle truncate">{detalle}</div>}
                                {item.batch_journal_count > 1 && (
                                    <div className="pr-1 text-[12px] font-medium text-amber-700 dark:text-amber-400">Pago combinado · {item.batch_journal_count} formas</div>
                                )}
                                <div className="mt-1.5 flex items-center justify-between gap-3">
                                    <div className="min-w-0 flex items-center gap-2.5">
                                        {isInvoice
                                            ? <StatusMark status={item.status === "parcial" ? "parcial" : "pendiente"} />
                                            : item.journal_name
                                                ? <JournalDot name={item.journal_name} color={item.journal_color} />
                                                : <span className="text-[12px] font-medium text-content-subtle">Devolución</span>}
                                        {!isInvoice && item.verified && <StatusMark status="ok" map={VERIFIED} />}
                                    </div>
                                    <div className="shrink-0 flex items-center gap-1" onClick={stopRow}>
                                        {isInvoice ? (
                                            <RowCta onClick={() => setPayModal(item)} className="ml-1.5 !mr-0">Cobrar</RowCta>
                                        ) : can("admin") && (
                                            <RowIcon icon="trash" tone="danger" title={item.group_count > 1 ? "Eliminar el cobro completo" : "Eliminar"} onClick={() => setDeleteDialog(item)} />
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Total del filtro en el teléfono: el pie de la tabla no se ve sin ella. */}
                {!loading && data.length > 0 && viewType !== "pendientes" && (
                    <div className="md:hidden shrink-0 px-4 py-2.5 border-t border-border/60 dark:border-white/[0.06] bg-white dark:bg-surface-dark-2 flex items-start justify-between gap-3">
                        <div>
                            <div className="text-[13px] font-semibold text-content dark:text-white">Total del filtro</div>
                            <div className="text-[12px] text-content-subtle tabular-nums">{total.toLocaleString("es-VE")} {total === 1 ? "cobro" : "cobros"}</div>
                        </div>
                        <div className="text-right">
                            <Money value={fmtPrice(sumBase)} className="text-[15px] font-semibold text-content dark:text-white" />
                            {currencyCount === 1 && filterCurrency && !filterCurrency.is_base && (
                                <div className="text-[12px] font-medium tabular-nums text-content-subtle">
                                    {filterCurrency.symbol}{sumLocal.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <Pagination page={page} totalPages={totalPages} total={total} limit={LIMIT} onPageChange={setPage} />
            </div>

            {payModal && (
                <PaymentFormModal sale={payModal} onClose={() => setPayModal(null)} onSuccess={() => { setPayModal(null); reload(); }} />
            )}

            {payDetail && (() => {
                const p = payDetail;
                const isBase = !p.currency_code || p.currency_code === baseCurrency?.code;
                const rate = parseFloat(p.exchange_rate) || 1;
                const sym = p.currency_symbol || baseCurrency?.symbol || "Ref.";
                const fmtP = n => `${sym} ${(Number(n || 0) * (isBase ? 1 : rate)).toFixed(2)}`;
                // El monto grande va en la moneda del diario, pero amount se almacena en base:
                // sin la tasa y el equivalente no había forma de conciliar este cobro con los
                // reportes, que suman en base. Se omiten si el cobro ya fue en moneda base.
                const baseSym = baseCurrency?.symbol || "Ref.";
                const conjunto = p.items?.length > 1;
                return (
                    <Modal open={!!payDetail} onClose={() => setPayDetail(null)} title="Detalle del cobro" width={420}>
                        <div className="space-y-4">
                            {/* Cifra héroe: la caja por la que entró y cuánto, en su moneda. */}
                            <div className="rounded-xl bg-surface-2 dark:bg-white/[0.03] border border-border/60 dark:border-white/[0.06] px-4 py-3.5">
                                <JournalDot name={p.journal_name || "Sin caja"} color={p.journal_color} />
                                <Money value={fmtP(p.amount)} className="block mt-1 text-[24px] font-bold tracking-tight leading-tight text-content dark:text-white" />
                                {!isBase && (
                                    <p className="mt-0.5 text-[12px] text-content-subtle tabular-nums">
                                        <Money value={`≈ ${baseSym} ${Number(p.amount || 0).toFixed(2)}`} /> · tasa {rate.toFixed(4)}
                                    </p>
                                )}
                            </div>

                            {/* Esta fila es UN movimiento de caja; si el cobro se hizo con varias
                                formas de pago, las otras son sus propias filas y se borran juntas. */}
                            {p.batch_journal_count > 1 && (
                                <div className="rounded-lg border-l-[3px] border-amber-500 bg-amber-500/[0.06] px-3.5 py-2.5">
                                    <p className="text-[13px] font-medium text-content dark:text-white">Pago combinado de {p.batch_journal_count} formas de pago</p>
                                    <p className="text-[12px] text-content-subtle leading-relaxed mt-0.5">
                                        Cada una es su propio movimiento de caja. Eliminar cualquiera deshace el cobro completo.
                                    </p>
                                </div>
                            )}

                            {/* Desglose del cobro conjunto: cuánto se aplicó a cada factura. */}
                            {conjunto && (
                                <div>
                                    <p className="text-[13px] font-semibold text-content dark:text-white mb-2">
                                        Aplicado a {p.group_count} {p.group_count === 1 ? "factura" : "facturas"}
                                    </p>
                                    <div className="rounded-xl border border-border/70 dark:border-white/[0.08] divide-y divide-border/60 dark:divide-white/[0.06]">
                                        {(p.items || []).map(it => (
                                            <div key={it.payment_id} className="px-3.5 py-2.5 flex items-baseline justify-between gap-3">
                                                <span className="text-[13px] font-medium text-content dark:text-white tabular-nums truncate">{it.invoice_number || `#${it.sale_id}`}</span>
                                                <Money value={fmtP(it.amount)} className="text-[13px] font-semibold text-content dark:text-white shrink-0" />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <dl className="divide-y divide-border/60 dark:divide-white/[0.06]">
                                {[
                                    !conjunto && ["Factura", p.invoice_number || `#${p.sale_id}`],
                                    p.customer_name && ["Cliente", toNameCase(p.customer_name)],
                                    p.created_at && ["Fecha", fmtDate(p.created_at)],
                                    p.reference_number && ["N° de referencia", p.reference_number],
                                    p.journal_name && ["Banco", p.verified ? "Conciliado con el extracto" : "Sin conciliar"],
                                    p.notes && ["Notas", p.notes],
                                ].filter(Boolean).map(([label, value]) => (
                                    <div key={label} className="flex items-baseline justify-between gap-4 py-2.5">
                                        <dt className="text-[12px] text-content-subtle whitespace-nowrap shrink-0">{label}</dt>
                                        <dd className="text-[13px] font-medium text-content dark:text-white text-right tabular-nums min-w-0 break-words">{value}</dd>
                                    </div>
                                ))}
                            </dl>
                        </div>
                        <div className="flex justify-end mt-5 pt-4 border-t border-border/60 dark:border-white/[0.06]">
                            <button onClick={() => setPayDetail(null)} className="btn-outline h-10 px-5 rounded-lg text-[13px] font-medium">Cerrar</button>
                        </div>
                    </Modal>
                );
            })()}

            <ConfirmModal
                isOpen={!!deleteDialog}
                title="¿Eliminar cobro?"
                message={
                    deleteDialog?.batch_journal_count > 1
                        ? `Este movimiento es una de las ${deleteDialog.batch_journal_count} formas de pago de un mismo cobro: se revierte el cobro COMPLETO, incluidas las otras cajas${deleteDialog.group_count > 1 ? ` y las ${deleteDialog.group_count} facturas que cubrió` : ""}.`
                    : deleteDialog?.group_count > 1
                        ? `Este cobro cubrió ${deleteDialog.group_count} facturas y se revierte completo: todas vuelven a quedar con su saldo pendiente.`
                        : "Esta acción revertirá el cobro. El saldo de la factura se actualizará automáticamente."
                }
                onConfirm={confirmRemovePayment}
                onCancel={() => setDeleteDialog(null)}
                type="danger"
                confirmText="Sí, eliminar"
            />
        </div>
    );
}
