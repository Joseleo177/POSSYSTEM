import { useEffect, useState } from "react";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import { toNameCase, fmtDateShort } from "../../helpers";
import { LedgerSkeleton, LedgerEmpty, ledgerRow } from "../ui/Ledger";
import { errMsg } from "./shared";

// Qué lleva cada producto estándar. Con receta, la orden de ese producto ya sabe qué cortar,
// qué accesorios descontar y cuánto debería costar.
const resumen = (r) => {
    const partes = [];
    if (r.materials) partes.push(r.materials === 1 ? "1 corte" : `${r.materials} cortes`);
    if (r.accessories) partes.push(r.accessories === 1 ? "1 accesorio" : `${r.accessories} accesorios`);
    if (r.processes) partes.push(r.processes === 1 ? "1 etapa" : `${r.processes} etapas`);
    if (r.params?.length) partes.push(`a medida (${r.params.map(p => p.key).join(", ")})`);
    return partes.join(" · ") || "Vacía";
};

export default function RecipesView({ version, onOpen, onNew }) {
    const { notify } = useApp();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let vivo = true;
        setLoading(true);
        api.factory.recipes()
            .then(r => { if (vivo) setRows(r.data || []); })
            .catch(e => { if (vivo) notify(errMsg(e), "err"); })
            .finally(() => { if (vivo) setLoading(false); });
        return () => { vivo = false; };
    }, [version]);

    const vacio = { title: "Sin recetas", hint: "Arma la del producto que siempre fabricas igual: qué cortes lleva y qué accesorios." };

    return (
        <div className="flex-1 flex flex-col overflow-y-auto lg:overflow-hidden -mx-3 sm:-mx-4 -my-2">
            <div className="hidden lg:flex flex-1 min-h-0 flex-col py-3 px-4">
                <div className="card-premium overflow-auto flex-1">
                    <table className="table-ledger min-w-[760px]">
                        <thead className="sticky top-0 z-10">
                            <tr>
                                <th className="pl-4">Producto</th>
                                <th>Material</th>
                                <th className="w-[200px]">Lleva</th>
                                <th className="w-[140px] pr-4">Actualizada</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? <LedgerSkeleton cols={4} rows={4} />
                                : rows.length === 0 ? <LedgerEmpty cols={4} title={vacio.title} hint={vacio.hint} />
                                : rows.map(r => (
                                    <tr key={r.id} {...ledgerRow(onOpen ? () => onOpen(r) : undefined)}>
                                        <td className="pl-4 max-w-0">
                                            <div className="text-[13px] font-semibold text-content dark:text-white truncate">{toNameCase(r.product_name)}</div>
                                        </td>
                                        <td className="max-w-0">
                                            <div className="text-[13px] text-content dark:text-white truncate">{r.material_names ? toNameCase(r.material_names) : "—"}</div>
                                        </td>
                                        <td className="text-[13px] text-content dark:text-white">{resumen(r)}</td>
                                        <td className="pr-4 text-[12px] text-content-subtle tabular-nums">{fmtDateShort(r.updated_at)}</td>
                                    </tr>
                                ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="lg:hidden px-3 py-3 space-y-2">
                {loading ? (
                    <div className="py-16 flex justify-center"><div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
                ) : rows.length === 0 ? (
                    <div className="py-16 text-center px-6">
                        <div className="text-[14px] font-semibold text-content dark:text-white">{vacio.title}</div>
                        <div className="text-[13px] text-content-subtle mt-1">{vacio.hint}</div>
                        {onNew && <button onClick={onNew} className="btn-outline h-10 px-4 rounded-lg text-[13px] font-medium mt-4">Nueva receta</button>}
                    </div>
                ) : rows.map(r => (
                    <div key={r.id} role="button" tabIndex={0} onClick={() => onOpen?.(r)}
                        onKeyDown={e => { if (e.key === "Enter") onOpen?.(r); }}
                        className="rounded-xl border border-border/70 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] px-3.5 py-3">
                        <div className="text-[14px] font-semibold text-content dark:text-white truncate">{toNameCase(r.product_name)}</div>
                        <div className="mt-1 flex items-center justify-between gap-3">
                            <span className="text-[12px] text-content-subtle truncate">{r.material_names ? toNameCase(r.material_names) : "Sin material"}</span>
                            <span className="text-[12px] text-content-subtle shrink-0">{resumen(r)}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
