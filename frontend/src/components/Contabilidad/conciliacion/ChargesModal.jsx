import { useState, useEffect, useMemo } from "react";
import Modal from "../../ui/Modal";
import { Button } from "../../ui/Button";
import CustomSelect from "../../ui/CustomSelect";
import Money from "../../ui/Money";
import { api } from "../../../services/api";
import { fmtMoney, toNameCase } from "../../../helpers";
import { needsWarehouse, journalOptions, plural } from "./reconMeta";

const GROUP_LABEL = { comision: "Comisiones", impuesto: "Impuestos", interes: "Intereses" };

const LABEL = "text-[12px] font-medium text-content-subtle";

/**
 * Registrar de una vez lo que el banco cobró o abonó por su cuenta: comisiones e impuestos
 * como egresos, intereses como ingresos, cada uno en su categoría. Es lo que nadie carga a mano
 * y lo que más líneas ocupa en un extracto.
 */
export default function ChargesModal({ open, onClose, statement: st, lines, warehouses, notify, onDone }) {
    const [journalId, setJournalId] = useState("");
    const [warehouseId, setWarehouseId] = useState("");

    useEffect(() => {
        if (!open) return;
        setJournalId(st.default_journal_id ? String(st.default_journal_id) : "");
        setWarehouseId("");
    }, [open, st.default_journal_id]);

    const symbol = st.currency_symbol || "Ref.";
    const groups = useMemo(() => ["comision", "impuesto", "interes"].map(k => {
        const ls = lines.filter(l => l.kind === k);
        return { kind: k, count: ls.length, total: ls.reduce((s, l) => s + (l.credit || l.debit), 0) };
    }).filter(g => g.count), [lines]);

    const askWarehouse = needsWarehouse(st, journalId);

    const submit = async () => {
        try {
            const r = await api.reconciliation.charges(st.id, { journal_id: journalId || null, warehouse_id: warehouseId || null });
            notify(`${plural(r.count, "cargo conciliado", "cargos conciliados")} en ${plural(r.documents, "movimiento", "movimientos")}`);
            onDone();
        } catch (e) {
            notify(e.message, "err");
        }
    };

    return (
        <Modal open={open} onClose={onClose} title="Registrar comisiones del banco" width={460}
            footer={
                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                    <button onClick={onClose} className="btn-outline h-12 sm:h-10 px-4 rounded-lg text-[13px] font-semibold">Cancelar</button>
                    {(!askWarehouse || warehouseId) && journalId && (
                        <Button onClick={submit} className="h-12 sm:h-10">Registrar {plural(lines.length, "movimiento", "movimientos")}</Button>
                    )}
                </div>
            }>
            <div className="space-y-4">
                <p className="text-[13px] text-content-muted dark:text-white/65 leading-relaxed">
                    Se registran juntas: un solo egreso de comisiones (otro de impuestos y un ingreso de intereses, si los hay) por el total, y cada línea queda conciliada contra él. Lo verás en Egresos e Ingresos.
                </p>
                <div className="rounded-xl border border-border/60 dark:border-white/[0.06] divide-y divide-border/60 dark:divide-white/[0.06]">
                    {groups.map(g => (
                        <div key={g.kind} className="px-3.5 py-2.5 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <div className="text-[13px] font-medium text-content dark:text-white">{GROUP_LABEL[g.kind]}</div>
                                <div className="text-[12px] text-content-subtle">{plural(g.count, "línea", "líneas")} · {g.kind === "interes" ? "como ingreso" : "como egreso"}</div>
                            </div>
                            <Money value={`${g.kind === "interes" ? "" : "-"}${fmtMoney(g.total, symbol)}`} className="text-[14px] font-semibold text-content dark:text-white" />
                        </div>
                    ))}
                </div>
                <div>
                    <p className={`${LABEL} mb-1.5`}>Diario</p>
                    <CustomSelect value={journalId} onChange={setJournalId} options={journalOptions(st, "out")} placeholder="Elige el diario" />
                </div>
                {askWarehouse && (
                    <div>
                        <p className={`${LABEL} mb-1.5`}>Sucursal donde se registran</p>
                        <CustomSelect value={warehouseId} onChange={setWarehouseId} placeholder="Elige la sucursal"
                            options={warehouses.map(w => ({ value: String(w.id), label: toNameCase(w.name) }))} />
                    </div>
                )}
            </div>
        </Modal>
    );
}
