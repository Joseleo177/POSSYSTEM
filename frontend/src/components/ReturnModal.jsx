import { useState, useEffect } from "react";
import Modal from "./ui/Modal";
import { api } from "../services/api";
import { fmtNumber } from "../helpers";
import ConfirmModal from "./ui/ConfirmModal";

const fmtPrice = (n) => `$${fmtNumber(n)}`;

export default function ReturnModal({ open, onClose, sale, onReturnSuccess, notify }) {
    const [returnQtys, setReturnQtys] = useState({});
    const [reason, setReason] = useState("");
    const [loading, setLoading] = useState(false);
    const [confirmShow, setConfirmShow] = useState(false);

    useEffect(() => {
        if (open && sale) {
            setReturnQtys({});
            setReason("");
        }
    }, [open, sale]);

    if (!open || !sale) return null;

    const handleQtyChange = (itemId, maxQty, val) => {
        let parsed = parseFloat(val);
        if (isNaN(parsed) || parsed < 0) parsed = 0;
        if (parsed > maxQty) parsed = maxQty;
        setReturnQtys(prev => ({ ...prev, [itemId]: parsed }));
    };

    const handleReturnAll = () => {
        const qtys = {};
        sale.items.forEach(i => { 
            const available = parseFloat(i.quantity) - parseFloat(i.returned_qty || 0);
            if (available > 0) qtys[i.id] = available;
        });
        setReturnQtys(qtys);
    };

    const totalReturn = sale.items.reduce((acc, i) => {
        const retQty = returnQtys[i.id] || 0;
        return acc + (retQty * (parseFloat(i.price) - parseFloat(i.discount || 0)));
    }, 0);

    const handleSubmit = () => {
        const returnItems = Object.entries(returnQtys)
            .map(([id, qty]) => ({ sale_item_id: parseInt(id), qty }))
            .filter(i => i.qty > 0);

        if (returnItems.length === 0) {
            return notify("Debes indicar al menos una cantidad mayor a 0 para devolver", "err");
        }

        setConfirmShow(true);
    };

    const executeSubmit = async () => {
        const returnItems = Object.entries(returnQtys)
            .map(([id, qty]) => ({ sale_item_id: parseInt(id), qty }))
            .filter(i => i.qty > 0);

        setConfirmShow(false);
        setLoading(true);
        try {
            await api.sales.createReturn(sale.id, { items: returnItems, reason });
            notify("Devolución registrada correctamente");
            onReturnSuccess();
            onClose();
        } catch (e) {
            notify(e.message, "err");
        }
        setLoading(false);
    };

    return (
        <>
            <Modal open={open} onClose={onClose} title={`DEVOLUCIÓN DE ${sale.invoice_number || "#" + sale.id}`} width={600}>
                <div className="mb-4 text-[12px] text-content-muted dark:text-content-dark-muted">
                    Indica la cantidad que deseas devolver de cada producto. Si devuelves una cantidad parcial, el valor total a reintegrar se calculará automáticamente.
                </div>

                <div className="flex justify-end mb-2">
                    <button onClick={handleReturnAll} className="btn-sm btn-secondary text-[11px] uppercase tracking-wide font-black">
                        ↻ Devolver todo
                    </button>
                </div>

                <div className="bg-surface-2 dark:bg-surface-dark-3 rounded-[1rem] border border-border/40 overflow-hidden shadow-sm mb-4 max-h-[40vh] overflow-y-auto scrollbar-dark">
                    <table className="w-full text-[11px] border-collapse min-w-[500px]">
                        <thead className="sticky top-0 bg-surface-3 dark:bg-surface-dark border-b border-border/40 z-10">
                            <tr>
                                <th className="text-left px-4 py-2 font-black text-content-subtle uppercase tracking-wide">Producto</th>
                                <th className="text-center px-4 py-2 font-black text-content-subtle uppercase tracking-wide w-24">Precio U.</th>
                                <th className="text-center px-4 py-2 font-black text-content-subtle uppercase tracking-wide w-24">Vendidos</th>
                                <th className="text-center px-4 py-2 font-black text-content-subtle uppercase tracking-wide w-24 text-danger">Devueltos</th>
                                <th className="text-right px-4 py-2 font-black text-content-subtle uppercase tracking-wide w-28 text-brand-500">Volver a Dev.</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/20">
                            {sale.items.map((item, idx) => {
                                const available = parseFloat(item.quantity) - parseFloat(item.returned_qty || 0);
                                return (
                                <tr key={idx} className={`hover:bg-brand-500/5 transition-colors ${available <= 0 ? 'opacity-40 bg-surface-3' : ''}`}>
                                    <td className="px-4 py-3 font-bold text-content">{item.name}</td>
                                    <td className="px-4 py-3 text-center font-bold text-content-muted">{fmtPrice(item.price)}</td>
                                    <td className="px-4 py-3 text-center font-bold text-content-muted">{parseFloat(item.quantity)}</td>
                                    <td className="px-4 py-3 text-center font-bold text-danger">{parseFloat(item.returned_qty || 0)}</td>
                                    <td className="px-4 py-2 text-right">
                                        <input
                                            type="number"
                                            min="0"
                                            max={available}
                                            step="1"
                                            disabled={available <= 0}
                                            className="w-[70px] bg-white dark:bg-surface-dark-2 border border-border dark:border-border-dark py-1.5 px-2 rounded-lg text-[11px] font-bold text-center outline-none focus:ring-1 focus:ring-brand-500/20 shadow-sm disabled:opacity-50"
                                            value={returnQtys[item.id] === 0 ? "" : (returnQtys[item.id] || "")}
                                            onChange={(e) => handleQtyChange(item.id, available, e.target.value)}
                                            placeholder="0"
                                        />
                                    </td>
                                </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <div className="mb-4">
                    <label className="label text-[11px] font-black uppercase tracking-wide text-content-subtle mb-1">Motivo / Notas de la devolución</label>
                    <input
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Ej: Producto dañado, cambio por defecto, cliente se arrepintió..."
                        className="w-full bg-surface-2 dark:bg-surface-dark-2 border border-border dark:border-border-dark py-2.5 px-3 rounded-xl text-xs outline-none focus:ring-2 focus:ring-brand-500/20 shadow-sm text-content dark:text-content-dark placeholder:text-content-subtle"
                    />
                </div>

                <div className="p-4 bg-brand-500/10 border border-brand-500/20 rounded-2xl flex items-center justify-between mt-6">
                    <div>
                        <span className="text-[11px] font-black uppercase tracking-wide text-brand-400 opacity-80 block">Total a Reintegrar</span>
                        <span className="text-xs font-bold text-content-subtle">(No afecta el registro cobrado originalmente, usar diario manual si amerita reintegro financiero)</span>
                    </div>
                    <div className="text-2xl font-black text-brand-400 tracking-tight">
                        {fmtPrice(totalReturn)}
                    </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                    <button onClick={onClose} disabled={loading} className="btn-sm btn-secondary font-black uppercase tracking-wide">
                        Cerrar
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={loading || totalReturn === 0}
                        className={[
                            "btn-md font-black uppercase tracking-wide transition-all duration-300 shadow-lg border-transparent",
                            (loading || totalReturn === 0)
                                ? "bg-surface-3 dark:bg-surface-dark-3 text-content-muted cursor-not-allowed shadow-none"
                                : "bg-warning text-black hover:bg-amber-400 hover:scale-[1.02] shadow-warning/20 cursor-pointer"
                        ].join(" ")}
                    >
                        {loading ? "Procesando..." : "Confirmar Devolución"}
                    </button>
                </div>
            </Modal>

            <ConfirmModal
                isOpen={confirmShow}
                title="¿Confirmar devolución?"
                message={`Estás a punto de procesar una devolución por un total de ${fmtPrice(totalReturn)}. El stock será reintegrado automáticamente a sus almacenes de origen.`}
                onConfirm={executeSubmit}
                onCancel={() => setConfirmShow(false)}
                confirmText="Sí, procesar devolución"
                type="warning"
            />
        </>
    );
}
