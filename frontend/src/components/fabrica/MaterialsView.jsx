import { useEffect, useState } from "react";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import { toNameCase } from "../../helpers";
import CustomSelect from "../ui/CustomSelect";
import { LedgerSkeleton, LedgerEmpty, ledgerRow } from "../ui/Ledger";
import { fmtDims, fmtSize, errMsg } from "./shared";

const formato = (m) => fmtDims({ width_mm: m.piece_width_mm, length_mm: m.piece_length_mm });

// Lo que dice la columna "Sin numerar": cero es lo normal. Positivo = entró material (una
// compra) que todavía no tiene número; negativo = se movió existencia por fuera de Fábrica
// (venta, ajuste) y las piezas dicen más de lo que hay.
function SinNumerar({ n, unit }) {
    if (Math.abs(n) < 0.005) return <span className="text-[13px] text-content-subtle tabular-nums">—</span>;
    if (n > 0) return (
        <span className="text-[13px] text-amber-700 dark:text-amber-400 tabular-nums">{fmtSize(n, unit)} por numerar</span>
    );
    return <span className="text-[13px] text-red-600 dark:text-red-400 tabular-nums">Descuadre {fmtSize(-n, unit)}</span>;
}

export default function MaterialsView({ warehouses, version, onEdit, onNew }) {
    const { notify } = useApp();
    const [warehouseId, setWarehouseId] = useState("");
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let vivo = true;
        setLoading(true);
        api.factory.materials(warehouseId ? { warehouse_id: warehouseId } : {})
            .then(r => { if (vivo) setRows(r.data || []); })
            .catch(e => { if (vivo) notify(errMsg(e), "err"); })
            .finally(() => { if (vivo) setLoading(false); });
        return () => { vivo = false; };
    }, [warehouseId, version]);

    const vacio = { title: "Sin materiales", hint: "Un producto con control por piezas: una lámina de 1,22 × 2,44 m, un tubo de 6 m." };

    return (
        <div className="flex-1 flex flex-col overflow-y-auto lg:overflow-hidden -mx-3 sm:-mx-4 -my-2">
            {warehouses.length > 1 && (
                <div className="shrink-0 px-4 py-2 flex items-center gap-2 border-b border-border/20 dark:border-white/5">
                    <CustomSelect value={warehouseId} onChange={setWarehouseId} height="h-9" className="w-48"
                        options={[{ value: "", label: "Todos los almacenes" }, ...warehouses.map(w => ({ value: String(w.id), label: toNameCase(w.name) }))]} />
                </div>
            )}

            <div className="hidden lg:flex flex-1 min-h-0 flex-col py-3 px-4">
                <div className="card-premium overflow-auto flex-1">
                    <table className="table-ledger min-w-[820px]">
                        <thead className="sticky top-0 z-10">
                            <tr>
                                <th className="pl-4">Material</th>
                                <th className="w-[150px]">Formato habitual</th>
                                <th className="w-[130px] text-right">Existencia</th>
                                <th className="w-[160px]">Piezas</th>
                                <th className="w-[190px] pr-4">Sin numerar</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? <LedgerSkeleton cols={5} rows={4} />
                                : rows.length === 0 ? <LedgerEmpty cols={5} title={vacio.title} hint={vacio.hint} />
                                : rows.map(m => (
                                    <tr key={m.id} {...ledgerRow(onEdit ? () => onEdit(m) : undefined, m.unnumbered < -0.005 ? "#ef4444" : undefined)}>
                                        <td className="pl-4 max-w-0">
                                            <div className="text-[13px] font-semibold text-content dark:text-white truncate">{toNameCase(m.name)}</div>
                                        </td>
                                        <td className="text-[13px] text-content dark:text-white tabular-nums">
                                            {formato(m)}
                                            <div className="text-[12px] text-content-subtle">{m.piece_mode === "length" ? "Por longitud" : "Por área"}</div>
                                        </td>
                                        <td className="text-right text-[13px] text-content dark:text-white tabular-nums">{fmtSize(m.stock, m.unit)}</td>
                                        <td className="text-[13px] text-content dark:text-white">
                                            {m.available} disponibles
                                            {m.in_shop > 0 && <div className="text-[12px] text-amber-700 dark:text-amber-400">{m.in_shop} en el taller</div>}
                                        </td>
                                        <td className="pr-4"><SinNumerar n={m.unnumbered} unit={m.unit} /></td>
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
                        {onNew && <button onClick={onNew} className="btn-outline h-10 px-4 rounded-lg text-[13px] font-medium mt-4">Crear material</button>}
                    </div>
                ) : rows.map(m => (
                    <div key={m.id} role="button" tabIndex={0} onClick={() => onEdit?.(m)}
                        className="rounded-xl border border-border/70 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] px-3.5 py-3">
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-[14px] font-semibold text-content dark:text-white truncate">{toNameCase(m.name)}</span>
                            <span className="text-[13px] font-medium text-content dark:text-white tabular-nums shrink-0">{fmtSize(m.stock, m.unit)}</span>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-3">
                            <span className="text-[12px] text-content-subtle tabular-nums">{formato(m)} · {m.available} disponibles</span>
                            <SinNumerar n={m.unnumbered} unit={m.unit} />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
