// La tabla necesita 680px para no comprimirse, así que en un teléfono solo se veían las dos
// primeras columnas y el resto quedaba tras un scroll horizontal que nadie descubre: ni el
// RIF, ni el saldo, ni las acciones. Desde lg se mantiene la tabla; por debajo, las mismas
// filas se pintan como tarjetas. Balance y acciones se comparten entre ambas vistas para que
// no puedan divergir al tocar una sola.

function Balance({ c, fmtPrice }) {
    const debt   = parseFloat(c.total_debt || 0);
    const credit = parseFloat(c.credit_balance || 0);
    return (
        <div className="flex flex-col gap-0.5">
            {debt > 0 ? (
                <div className="flex flex-col">
                    <span className="text-[11px] font-black text-danger tabular-nums">-{fmtPrice(c.total_debt)}</span>
                    <span className="text-[9px] font-bold uppercase text-danger/50">
                        {c.type === "proveedor" ? "Por pagar" : "Por cobrar"}
                    </span>
                </div>
            ) : (
                <span className="badge badge-success shadow-none !bg-success/5 !text-success border-success/10 font-black uppercase tracking-widest">
                    Al día
                </span>
            )}
            {credit > 0.001 && (
                <div className="flex flex-col">
                    <span className="text-[11px] font-black text-brand-500 tabular-nums">{fmtPrice(c.credit_balance)}</span>
                    <span className="text-[9px] font-bold uppercase text-brand-500/50">Crédito</span>
                </div>
            )}
        </div>
    );
}

function Actions({ c, onDetail, onEdit, onDelete }) {
    return (
        <div className="flex justify-end gap-1">
            <button
                onClick={() => onDetail(c)}
                className="p-2 hover:bg-brand-500/10 rounded-xl transition-all text-content-subtle hover:text-brand-500"
                title="Ver Detalle"
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
            </button>
            <button
                onClick={() => onEdit(c)}
                className="p-2 hover:bg-warning/10 rounded-xl transition-all text-content-subtle hover:text-warning"
                title="Editar"
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
            </button>
            <button
                onClick={() => onDelete(c)}
                className="p-2 hover:bg-danger/10 rounded-xl transition-all text-content-subtle hover:text-danger"
                title="Eliminar"
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
            </button>
        </div>
    );
}

const EMPTY = (
    <div className="py-20 text-center opacity-30">
        <div className="text-[11px] font-black uppercase tracking-widest text-content-subtle">Sin registros en la base de datos</div>
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
            <div className="card-premium overflow-auto flex-1 hidden lg:block">
                <table className="table-pos min-w-[680px]">
                    <thead>
                        <tr>
                            <th className="text-left">Tipo</th>
                            <th className="text-left">Contacto</th>
                            <th className="text-left">RIF / Cédula</th>
                            <th className="text-left">Balance</th>
                            <th className="text-right w-[140px] pr-6">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/20 dark:divide-white/5">
                        {customers.length === 0 ? (
                            <tr>
                                <td colSpan={5}>{EMPTY}</td>
                            </tr>
                        ) : customers.map(c => (
                            <tr key={c.id} className="group transition-colors">
                                <td>
                                    <span className={`badge ${c.type === "proveedor" ? "badge-violet" : "badge-info"} shadow-none`}>
                                        {c.type}
                                    </span>
                                </td>
                                <td>
                                    <div className="text-[12px] font-black uppercase tracking-tight text-content dark:text-white group-hover:text-brand-500 transition-colors">
                                        {c.name}
                                    </div>
                                    {c.city && <div className="text-[10px] text-content-subtle font-bold opacity-60 uppercase">{c.city}</div>}
                                </td>
                                <td className="text-[11px] font-bold text-content-subtle tabular-nums">
                                    {c.rif || "S/N"}
                                </td>
                                <td><Balance c={c} fmtPrice={fmtPrice} /></td>
                                <td className="text-right pr-6">
                                    <Actions c={c} onDetail={onDetail} onEdit={onEdit} onDelete={onDelete} />
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
                        className="bg-surface dark:bg-white/[0.03] border border-border/60 dark:border-white/[0.06] rounded-2xl p-3 shadow-card dark:shadow-none active:bg-surface-2 dark:active:bg-white/[0.06] transition-colors"
                    >
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                                <span className={`badge ${c.type === "proveedor" ? "badge-violet" : "badge-info"} shadow-none`}>
                                    {c.type}
                                </span>
                                <div className="text-[13px] font-black uppercase tracking-tight text-content dark:text-white mt-1.5 break-words">
                                    {c.name}
                                </div>
                                {/* El RIF es el dato con el que se identifica al contacto al facturar,
                                    y en la tabla vivía en una columna que el teléfono nunca mostraba. */}
                                <div className="text-[11px] font-bold text-content-subtle tabular-nums mt-0.5">
                                    {c.rif || "S/N"}{c.city ? ` · ${c.city.toUpperCase()}` : ""}
                                </div>
                            </div>
                            {/* stopPropagation: la tarjeta entera abre el detalle, pero editar y
                                eliminar no pueden dispararlo de paso. */}
                            <div className="shrink-0" onClick={e => e.stopPropagation()}>
                                <Actions c={c} onDetail={onDetail} onEdit={onEdit} onDelete={onDelete} />
                            </div>
                        </div>

                        <div className="mt-2.5 pt-2.5 border-t border-black/5 dark:border-white/[0.06]">
                            <Balance c={c} fmtPrice={fmtPrice} />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
