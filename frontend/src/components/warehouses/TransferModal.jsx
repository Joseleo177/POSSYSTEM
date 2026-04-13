import Modal from "../ui/Modal";
import { Button } from "../ui/Button";

const EMPTY = { from_warehouse_id: "", to_warehouse_id: "", qty: "", note: "" };

export default function TransferModal({
    open, onClose, warehouses,
    transferProductSearch, setTransferProductSearch,
    transferProductResults, setTransferProductResults,
    transferProductSelected, setTransferProductSelected,
    transferForm, setTransferForm, doTransfer, loadingTransfer
}) {
    const handleClose = () => {
        setTransferForm(EMPTY);
        setTransferProductSearch("");
        setTransferProductResults([]);
        setTransferProductSelected(null);
        onClose();
    };

    return (
        <Modal open={open} onClose={handleClose} title="Nueva Transferencia" width={520}>
            <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                    <div className="label mb-1">Origen *</div>
                    <select
                        value={transferForm.from_warehouse_id}
                        onChange={e => setTransferForm(p => ({
                            ...p,
                            from_warehouse_id: e.target.value,
                            to_warehouse_id: p.to_warehouse_id === e.target.value ? "" : p.to_warehouse_id,
                        }))}
                        className="input"
                    >
                        <option value="">Seleccionar origen</option>
                        {warehouses.filter(w => w.active).map(w => (
                            <option key={w.id} value={w.id}>{w.name}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <div className="label mb-1">Destino *</div>
                    <select
                        value={transferForm.to_warehouse_id}
                        onChange={e => setTransferForm(p => ({ ...p, to_warehouse_id: e.target.value }))}
                        className="input"
                    >
                        <option value="">Seleccionar destino</option>
                        {warehouses.filter(w => w.active && w.id !== parseInt(transferForm.from_warehouse_id)).map(w => (
                            <option key={w.id} value={w.id}>{w.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-[2fr_1fr] gap-3 mb-3">
                <div>
                    <div className="label mb-1">Producto *</div>
                    {transferProductSelected ? (
                        <div className="input h-8 flex items-center justify-between gap-2">
                            <span className="text-[11px] font-black truncate">{transferProductSelected.name}</span>
                            <button
                                onClick={() => { setTransferProductSelected(null); setTransferProductSearch(""); setTransferProductResults([]); }}
                                className="text-content-subtle hover:text-danger flex-shrink-0"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                    ) : (
                        <div className="relative">
                            <input
                                value={transferProductSearch}
                                onChange={e => setTransferProductSearch(e.target.value)}
                                placeholder="Buscar producto..."
                                className="input h-8 pl-8 text-[11px]"
                            />
                            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-subtle pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            {transferProductResults.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-surface-dark-2 border border-border/40 dark:border-white/10 rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto">
                                    {transferProductResults.map(p => (
                                        <div
                                            key={p.id}
                                            onClick={() => { setTransferProductSelected(p); setTransferProductSearch(""); setTransferProductResults([]); }}
                                            className="px-3 py-2 text-[11px] font-black uppercase tracking-wide cursor-pointer hover:bg-surface-2 dark:hover:bg-white/5 border-b border-border/20 last:border-0"
                                        >
                                            {p.name}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
                <div>
                    <div className="label mb-1">Cantidad *</div>
                    <input
                        type="number"
                        min="0.001"
                        step="0.001"
                        value={transferForm.qty}
                        onChange={e => setTransferForm(p => ({ ...p, qty: e.target.value }))}
                        placeholder="0"
                        className="input"
                    />
                </div>
            </div>

            <div className="mb-4">
                <div className="label mb-1">Nota (opcional)</div>
                <input
                    value={transferForm.note}
                    onChange={e => setTransferForm(p => ({ ...p, note: e.target.value }))}
                    placeholder="ej. Reposición semanal de tienda"
                    className="input"
                />
            </div>

            <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-border/10">
                <Button variant="ghost" onClick={handleClose}>Cancelar</Button>
                <Button variant="primary" onClick={doTransfer} disabled={loadingTransfer}>
                    {loadingTransfer ? "Transfiriendo..." : "Registrar transferencia"}
                </Button>
            </div>
        </Modal>
    );
}
