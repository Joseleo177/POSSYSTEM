import { useEffect, useState } from "react";
import { ledgerRow, stopRow, LedgerSkeleton, LedgerEmpty, RowIcon } from "../ui/Ledger";
import { useApp } from "../../context/AppContext";
import { api } from "../../services/api";
import { toNameCase } from "../../helpers";
import { olvidarVendedores } from "../cobro/SellerPickerModal";

const COLS = 5;

/**
 * Los vendedores de la empresa, activos e inactivos. No son usuarios: se nombran en la caja con
 * su código. Cambiar el % rige desde la próxima venta.
 */
export default function SellersView({ version, onEdit, onNew }) {
    const { notify, sucursales = [] } = useApp();
    const [rows, setRows] = useState(null);

    useEffect(() => {
        setRows(null);
        // La lista de la caja se vuelve a pedir: un vendedor nuevo tiene que salir en F7 ya.
        olvidarVendedores();
        api.commissions.sellers(true)
            .then(r => setRows(r.data || []))
            .catch(e => { notify(e.message, "err"); setRows([]); });
    }, [version, notify]);

    const sucursal = (id) => (id ? toNameCase(sucursales.find(w => w.id === id)?.name) || "—" : "Todas");
    const lista = rows || [];

    return (
        <div className="flex-1 min-h-0 flex flex-col overflow-y-auto lg:overflow-hidden">
            <div className="hidden md:flex flex-1 min-h-0 flex-col py-3 px-4">
                <div className="card-premium overflow-auto flex-1">
                    <table className="table-ledger min-w-[720px]">
                        <thead className="sticky top-0 z-10">
                            <tr>
                                <th className="pl-4 w-[90px]">Código</th>
                                <th>Vendedor</th>
                                <th className="w-[110px] text-right">Comisión</th>
                                <th className="w-[200px]">Sucursal</th>
                                <th className="w-[70px] pr-4" />
                            </tr>
                        </thead>
                        <tbody>
                            {!rows ? <LedgerSkeleton cols={COLS} rows={5} />
                                : lista.length === 0 ? (
                                    <LedgerEmpty cols={COLS} title="Sin vendedores" hint="Crea el primero con «Nuevo vendedor». No necesitan usuario." />
                                ) : lista.map(s => (
                                    <tr key={s.id} {...ledgerRow(onEdit ? () => onEdit(s) : undefined)} className={`${onEdit ? "ledger-row" : ""} ${s.active ? "" : "opacity-60"}`}>
                                        <td className="pl-4 text-[13px] font-semibold tabular-nums text-content dark:text-white">{s.code}</td>
                                        <td className="max-w-0">
                                            <div className="text-[13px] font-semibold text-content dark:text-white truncate">{toNameCase(s.name)}</div>
                                            <div className="text-[12px] text-content-subtle truncate">
                                                {[s.doc_id, s.phone].filter(Boolean).join(" · ") || "Sin datos de contacto"}{s.active ? "" : " · inactivo"}
                                            </div>
                                        </td>
                                        <td className="text-right text-[13px] font-semibold tabular-nums text-content dark:text-white">{s.commission_pct}%</td>
                                        <td className="text-[13px] text-content dark:text-white truncate">{sucursal(s.warehouse_id)}</td>
                                        <td className="pr-4" onClick={stopRow}>
                                            <div className="flex items-center justify-end">
                                                {onEdit && <RowIcon icon="edit" title="Editar" onClick={() => onEdit(s)} />}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="md:hidden px-4 py-3 space-y-2">
                {!rows ? (
                    <div className="py-16 flex justify-center"><div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
                ) : lista.length === 0 ? (
                    <div className="py-14 text-center px-6">
                        <div className="text-[14px] font-semibold text-content dark:text-white">Sin vendedores</div>
                        <div className="text-[13px] text-content-subtle mt-1">No necesitan usuario: solo se nombran en la caja.</div>
                        {onNew && <button onClick={onNew} className="btn-outline h-12 px-5 rounded-lg text-[13px] font-medium mt-4">Nuevo vendedor</button>}
                    </div>
                ) : lista.map(s => (
                    <div key={s.id} role="button" tabIndex={0} onClick={() => onEdit?.(s)} onKeyDown={e => { if (e.key === "Enter") onEdit?.(s); }}
                        className={`rounded-xl border border-border/70 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] px-3.5 py-3 active:scale-[0.99] transition-transform ${s.active ? "" : "opacity-60"}`}>
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-[14px] font-semibold text-content dark:text-white truncate"><span className="tabular-nums text-content-subtle">{s.code}</span> · {toNameCase(s.name)}</span>
                            <span className="text-[14px] font-semibold tabular-nums text-content dark:text-white shrink-0">{s.commission_pct}%</span>
                        </div>
                        <div className="text-[12px] text-content-subtle mt-0.5 truncate">{sucursal(s.warehouse_id)}{s.active ? "" : " · inactivo"}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}
