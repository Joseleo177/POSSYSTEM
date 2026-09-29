import { fmtDate, toNameCase } from "../../helpers";
import Pagination from "../ui/Pagination";
import StatusMark, { statusTone } from "../ui/StatusMark";
import { ledgerRow, stopRow, RowIcon } from "../ui/Ledger";

const LIMIT = 50;

// La tabla pide 720px para sus columnas, así que en un teléfono solo se veían las primeras y
// el resto —total, estado, pago y acciones— quedaba tras un scroll horizontal que nadie
// descubre. Desde lg se mantiene la tabla; por debajo, las mismas órdenes se pintan como
// tarjetas. Estados y acciones se comparten entre ambas vistas para que no diverjan.

// Recibida es lo normal: gris. Lo que aún no entró al almacén se marca.
const ORDER_STATUS = {
    recibido:  { label: "Recibida",  tone: "success", quiet: "check" },
    pendiente: { label: "Por recibir", tone: "info" },
    borrador:  { label: "Borrador",  tone: "neutral" },
};
// Pagada es lo normal: gris. Rojo solo para lo que se debe.
const PAY_STATUS = {
    pagado:    { label: "Pagada",  tone: "success", quiet: "check" },
    parcial:   { label: "Parcial", tone: "warning", flag: true },
    pendiente: { label: "Debe",    tone: "danger",  flag: true },
};

function Total({ p }) {
    return (
        <>
            <div className="text-[14px] font-semibold text-content dark:text-white tabular-nums whitespace-nowrap">
                <span className="text-[0.78em] font-medium text-content-subtle mr-1">Ref.</span>{Number(p.total).toFixed(2)}
            </div>
            {p.amount_paid > 0 && p.payment_status !== "pagado" && (
                <div className="text-[12px] text-content-subtle tabular-nums whitespace-nowrap">
                    Abonado {Number(p.amount_paid).toFixed(2)}
                </div>
            )}
        </>
    );
}

export default function PurchasesTable({ state }) {
    const {
        purchases, openDetail, setCancelConfirm,
        purchasesTotal, purchasesPage, setPurchasesPage
    } = state;

    const totalPages = Math.ceil((purchasesTotal || 0) / LIMIT);

    if (!purchases.length) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-2 text-center">
                <svg className="w-8 h-8 text-content-subtle/40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                <div className="text-[13px] font-semibold text-content dark:text-white">Sin órdenes de compra</div>
                <div className="text-[12px] text-content-subtle">Las compras registradas aparecerán aquí.</div>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">

            {/* ── Escritorio: tabla ── */}
            <div className="overflow-auto flex-1 hidden lg:block">
                <table className="table-ledger min-w-[820px]">
                    <thead className="sticky top-0 z-10">
                        <tr>
                            <th className="pl-4 w-20">Orden</th>
                            <th>Proveedor</th>
                            <th>Almacén</th>
                            <th className="text-right">Líneas</th>
                            <th className="text-right">Total</th>
                            <th>Recepción</th>
                            <th>Pago</th>
                            <th>Registró</th>
                            <th>Fecha</th>
                            <th className="pr-4 w-px"><span className="sr-only">Acciones</span></th>
                        </tr>
                    </thead>

                    <tbody>
                        {purchases.map((p) => (
                            // La fila entera abre el detalle, igual que la tarjeta en móvil.
                            <tr key={p.id} {...ledgerRow(() => openDetail(p.id), statusTone(p.payment_status || "pendiente", PAY_STATUS))}>
                                <td className="pl-4">
                                    <span className="text-[13px] font-semibold text-brand-700 dark:text-brand-300 tabular-nums">#{p.id}</span>
                                </td>

                                <td className="max-w-0 w-[30%]">
                                    <div className="font-semibold text-content dark:text-white truncate">
                                        {toNameCase(p.supplier_name) || "Proveedor final"}
                                    </div>
                                    {p.supplier_rif && (
                                        <div className="text-[12px] text-content-subtle tabular-nums">{p.supplier_rif}</div>
                                    )}
                                </td>

                                <td>
                                    <span className="text-[12px] font-medium text-content-subtle">{toNameCase(p.warehouse_name) || "—"}</span>
                                </td>

                                <td className="text-right">
                                    <span className="text-[13px] font-medium text-content-subtle tabular-nums">{p.item_count}</span>
                                </td>

                                <td className="text-right"><Total p={p} /></td>

                                <td><StatusMark status={p.status || "recibido"} map={ORDER_STATUS} /></td>
                                <td><StatusMark status={p.payment_status || "pendiente"} map={PAY_STATUS} /></td>

                                <td className="max-w-[140px]">
                                    <span className="block truncate text-[12px] font-medium text-content-subtle">
                                        {toNameCase(p.employee_name) || "Admin"}
                                    </span>
                                </td>

                                <td>
                                    <span className="text-[12px] font-medium text-content-subtle tabular-nums whitespace-nowrap">{fmtDate(p.created_at)}</span>
                                </td>

                                {/* stopRow: la fila abre el detalle, pero anular no puede
                                    dispararlo de paso. */}
                                <td className="pr-4 whitespace-nowrap cursor-default" onClick={stopRow}>
                                    <RowIcon icon="ban" tone="danger" title="Anular" onClick={() => setCancelConfirm(p)} />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* ── Móvil y tablet: tarjetas ── */}
            <div className="lg:hidden flex-1 overflow-auto space-y-2 px-1">
                {purchases.map((p) => (
                    <div
                        key={p.id}
                        onClick={() => openDetail(p.id)}
                        className="bg-surface dark:bg-white/[0.03] border border-border/60 dark:border-white/[0.06] rounded-xl p-3 active:bg-surface-2 dark:active:bg-white/[0.06] transition-colors"
                    >
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap text-[12px] text-content-subtle">
                                    <span className="font-semibold text-brand-700 dark:text-brand-300 tabular-nums">#{p.id}</span>
                                    {p.warehouse_name && <span>· {toNameCase(p.warehouse_name)}</span>}
                                </div>
                                <div className="text-[14px] font-semibold text-content dark:text-white mt-0.5 break-words">
                                    {toNameCase(p.supplier_name) || "Proveedor final"}
                                </div>
                                {p.supplier_rif && (
                                    <div className="text-[12px] text-content-subtle tabular-nums">{p.supplier_rif}</div>
                                )}
                            </div>
                            {/* stopPropagation: la tarjeta abre el detalle, pero anular no puede
                                dispararlo de paso. */}
                            <div className="shrink-0" onClick={stopRow}>
                                <RowIcon icon="ban" tone="danger" title="Anular" onClick={() => setCancelConfirm(p)} />
                            </div>
                        </div>

                        <div className="mt-2.5 pt-2.5 border-t border-border/60 dark:border-white/[0.06] flex items-end justify-between gap-2">
                            <div className="min-w-0">
                                <Total p={p} />
                                <div className="text-[12px] text-content-subtle tabular-nums mt-1">
                                    {p.item_count} {p.item_count === 1 ? "línea" : "líneas"} · {fmtDate(p.created_at)} · {toNameCase(p.employee_name) || "Admin"}
                                </div>
                            </div>
                            <div className="flex flex-col items-end gap-1 shrink-0">
                                <StatusMark status={p.status || "recibido"} map={ORDER_STATUS} />
                                <StatusMark status={p.payment_status || "pendiente"} map={PAY_STATUS} />
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <Pagination
                page={purchasesPage}
                totalPages={totalPages}
                total={purchasesTotal}
                limit={LIMIT}
                onPageChange={setPurchasesPage}
            />
        </div>
    );
}
