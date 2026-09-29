import { toNameCase } from "../../helpers";
import StatusMark from "../ui/StatusMark";
import { ledgerRow, stopRow, RowIcon } from "../ui/Ledger";

// La tabla necesita 680px para no comprimirse, así que en un teléfono solo se veían las dos
// primeras columnas y el resto quedaba tras un scroll horizontal que nadie descubre: ni el
// RIF, ni el saldo, ni las acciones. Desde lg se mantiene la tabla; por debajo, las mismas
// filas se pintan como tarjetas. Balance y acciones se comparten entre ambas vistas para que
// no puedan divergir al tocar una sola.

const TYPE_LABEL = { cliente: "Cliente", proveedor: "Proveedor", ambos: "Cliente y proveedor" };
const typeLabel = (t) => TYPE_LABEL[t] || (t ? t.charAt(0).toUpperCase() + t.slice(1) : "");

// Iniciales del contacto: dan a cada fila un ancla visual sin depender de una foto.
const initials = (name = "") => name.trim().split(/\s+/).slice(0, 2).map(w => w.charAt(0)).join("").toUpperCase() || "?";
const Avatar = ({ name, supplier }) => (
    <span className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-[11px] font-semibold ${supplier ? "bg-violet-500/10 text-violet-700 dark:text-violet-300" : "bg-brand-500/10 text-brand-700 dark:text-brand-300"}`}>
        {initials(name)}
    </span>
);

function Balance({ c, fmtPrice }) {
    const debt   = parseFloat(c.total_debt || 0);
    const credit = parseFloat(c.credit_balance || 0);
    return (
        <div className="flex flex-col gap-0.5">
            {debt > 0 ? (
                <div className="flex items-baseline gap-2">
                    <span className="text-[14px] font-semibold text-red-600 dark:text-red-400 tabular-nums whitespace-nowrap">{fmtPrice(c.total_debt)}</span>
                    <span className="text-[12px] text-content-subtle">{c.type === "proveedor" ? "por pagar" : "por cobrar"}</span>
                </div>
            ) : (
                // Al día es lo normal: gris con un check, sin pastilla verde.
                <StatusMark status="x" map={{ x: { label: "Al día", tone: "success", quiet: "check" } }} />
            )}
            {credit > 0.001 && (
                <div className="flex items-baseline gap-2">
                    <span className="text-[13px] font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums whitespace-nowrap">{fmtPrice(c.credit_balance)}</span>
                    <span className="text-[12px] text-content-subtle">a favor</span>
                </div>
            )}
        </div>
    );
}

function Actions({ c, onEdit, onDelete }) {
    return (
        <div className="flex justify-end gap-0.5">
            <RowIcon icon="edit" title="Editar" onClick={() => onEdit(c)} />
            <RowIcon icon="trash" tone="danger" title="Eliminar" onClick={() => onDelete(c)} />
        </div>
    );
}

const EMPTY = (
    <div className="py-20 text-center">
        <div className="text-[13px] font-semibold text-content dark:text-white">Sin contactos</div>
        <div className="text-[12px] text-content-subtle mt-1">Los clientes y proveedores que registres aparecerán aquí.</div>
    </div>
);

export default function CustomerTable({
    customers,
    onDetail,
    onEdit,
    onDelete,
    fmtPrice
}) {
    return (
        <div className="flex-1 overflow-hidden flex flex-col py-3 px-3 sm:px-4">

            {/* ── Escritorio: tabla ── */}
            <div className="overflow-auto flex-1 hidden lg:block">
                <table className="table-ledger min-w-[680px]">
                    <thead className="sticky top-0 z-10">
                        <tr>
                            <th className="pl-4">Contacto</th>
                            <th>RIF / Cédula</th>
                            <th>Tipo</th>
                            <th>Balance</th>
                            <th className="pr-4 w-px"><span className="sr-only">Acciones</span></th>
                        </tr>
                    </thead>
                    <tbody>
                        {customers.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="!h-auto !border-b-0">{EMPTY}</td>
                            </tr>
                        ) : customers.map(c => (
                            // La fila abre el detalle (antes, un ojo aparte en cada fila).
                            <tr key={c.id} {...ledgerRow(() => onDetail(c), parseFloat(c.total_debt || 0) > 0 ? "#ef4444" : undefined)}>
                                <td className="pl-4 max-w-0 w-[40%]">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <Avatar name={c.name} supplier={c.type === "proveedor"} />
                                        <div className="min-w-0">
                                            <div className="font-semibold text-content dark:text-white truncate">{toNameCase(c.name)}</div>
                                            {c.city && <div className="text-[12px] text-content-subtle truncate">{toNameCase(c.city)}</div>}
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    <span className="text-[13px] font-medium text-content-subtle tabular-nums">{c.rif || "Sin RIF"}</span>
                                </td>
                                <td>
                                    <span className="text-[12px] font-medium text-content-subtle">{typeLabel(c.type)}</span>
                                </td>
                                <td><Balance c={c} fmtPrice={fmtPrice} /></td>
                                <td className="pr-4 whitespace-nowrap cursor-default" onClick={stopRow}>
                                    <Actions c={c} onEdit={onEdit} onDelete={onDelete} />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* ── Móvil y tablet: tarjetas ── */}
            <div className="lg:hidden flex-1 overflow-auto space-y-2">
                {customers.length === 0 ? EMPTY : customers.map(c => (
                    <div
                        key={c.id}
                        onClick={() => onDetail(c)}
                        className="bg-surface dark:bg-white/[0.03] border border-border/60 dark:border-white/[0.06] rounded-xl p-3 active:bg-surface-2 dark:active:bg-white/[0.06] transition-colors"
                    >
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1 flex items-start gap-3">
                                <Avatar name={c.name} supplier={c.type === "proveedor"} />
                                <div className="min-w-0">
                                    <div className="text-[14px] font-semibold text-content dark:text-white break-words">
                                        {toNameCase(c.name)}
                                    </div>
                                    {/* El RIF es el dato con el que se identifica al contacto al facturar,
                                        y en la tabla vivía en una columna que el teléfono nunca mostraba. */}
                                    <div className="text-[12px] text-content-subtle tabular-nums mt-0.5">
                                        {[typeLabel(c.type), c.rif || "Sin RIF", toNameCase(c.city)].filter(Boolean).join(" · ")}
                                    </div>
                                </div>
                            </div>
                            {/* stopPropagation: la tarjeta entera abre el detalle, pero editar y
                                eliminar no pueden dispararlo de paso. */}
                            <div className="shrink-0" onClick={stopRow}>
                                <Actions c={c} onEdit={onEdit} onDelete={onDelete} />
                            </div>
                        </div>

                        <div className="mt-2.5 pt-2.5 border-t border-border/60 dark:border-white/[0.06]">
                            <Balance c={c} fmtPrice={fmtPrice} />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
