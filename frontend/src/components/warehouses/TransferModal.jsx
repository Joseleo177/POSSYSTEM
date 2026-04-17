import Modal from "../ui/Modal";
import { Button } from "../ui/Button";
import CustomSelect from "../ui/CustomSelect";

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

    // Mapeo de almacenes para el CustomSelect
    const warehouseOptions = warehouses
        .filter(w => w.active)
        .map(w => ({ value: w.id, label: w.name }));

    return (
        <Modal open={open} onClose={handleClose} title="Nueva Transferencia de Inventario" width={550}>
            <div className="space-y-4 p-1">
                {/* ── Origen y Destino ── */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="label mb-1.5 opacity-70">Almacén Origen <span className="text-danger">*</span></label>
                        <CustomSelect
                            value={transferForm.from_warehouse_id}
                            onChange={val => setTransferForm(p => ({
                                ...p,
                                from_warehouse_id: val,
                                to_warehouse_id: String(p.to_warehouse_id) === String(val) ? "" : p.to_warehouse_id,
                            }))}
                            options={warehouseOptions}
                            placeholder="Seleccionar origen..."
                            className="w-full"
                        />
                    </div>
                    <div>
                        <label className="label mb-1.5 opacity-70">Almacén Destino <span className="text-danger">*</span></label>
                        <CustomSelect
                            value={transferForm.to_warehouse_id}
                            onChange={val => setTransferForm(p => ({ ...p, to_warehouse_id: val }))}
                            options={warehouseOptions.filter(o => String(o.value) !== String(transferForm.from_warehouse_id))}
                            placeholder="Seleccionar destino..."
                            className="w-full"
                        />
                    </div>
                </div>

                {/* ── Producto y Cantidad ── */}
                <div className="grid grid-cols-[1.5fr_1fr] gap-4">
                    <div className="relative">
                        <label className="label mb-1.5 opacity-70">Producto a Transferir <span className="text-danger">*</span></label>
                        {transferProductSelected ? (
                            <div className="input h-10 flex items-center justify-between gap-3 border-brand-500 bg-brand-500/5 px-3">
                                <div className="flex items-center gap-2 overflow-hidden">
                                    <div className="w-6 h-6 rounded bg-brand-500 flex items-center justify-center flex-shrink-0 shadow-sm shadow-brand-500/20">
                                        <svg className="w-3.5 h-3.5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                    </div>
                                    <span className="text-[11px] font-black uppercase tracking-tight truncate">{transferProductSelected.name}</span>
                                </div>
                                <button
                                    onClick={() => { setTransferProductSelected(null); setTransferProductSearch(""); setTransferProductResults([]); }}
                                    className="w-6 h-6 rounded hover:bg-danger/10 text-content-subtle hover:text-danger transition-all flex items-center justify-center flex-shrink-0"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>
                        ) : (
                            <div className="relative group">
                                <input
                                    value={transferProductSearch}
                                    onChange={e => setTransferProductSearch(e.target.value)}
                                    placeholder="Nombre o código del producto..."
                                    className="input h-10 pl-9"
                                />
                                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-subtle opacity-40 group-focus-within:text-brand-500 group-focus-within:opacity-100 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                {transferProductResults.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-surface-dark-2 border border-border/40 dark:border-white/10 rounded-xl shadow-2xl z-50 max-h-48 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200 divide-y divide-border/10">
                                        {transferProductResults.map(p => (
                                            <button
                                                key={p.id}
                                                onClick={() => { setTransferProductSelected(p); setTransferProductSearch(""); setTransferProductResults([]); }}
                                                className="w-full px-4 py-2.5 text-[11px] font-black uppercase tracking-tight text-left hover:bg-brand-500/[0.03] hover:text-brand-500 transition-all flex items-center justify-between"
                                            >
                                                <span>{p.name}</span>
                                                <span className="text-[9px] opacity-40">Stock: {p.stock}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    <div>
                        <label className="label mb-1.5 opacity-70">Cantidad <span className="text-danger">*</span></label>
                        <input
                            type="number"
                            min="0.001"
                            step="0.001"
                            value={transferForm.qty}
                            onChange={e => setTransferForm(p => ({ ...p, qty: e.target.value }))}
                            placeholder="0.00"
                            className="input h-10 font-black tabular-nums text-brand-500 placeholder:text-content-subtle/30"
                        />
                    </div>
                </div>

                {/* ── Nota ── */}
                <div>
                    <label className="label mb-1.5 opacity-70">Motivo de la transferencia (Opcional)</label>
                    <textarea
                        value={transferForm.note}
                        onChange={e => setTransferForm(p => ({ ...p, note: e.target.value }))}
                        placeholder="ej. Reposición de inventario para sucursal principal..."
                        className="input min-h-[80px] py-3 px-3 resize-none text-[11px] leading-relaxed"
                        rows={2}
                    />
                </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-border/10 dark:border-white/5">
                <Button variant="ghost" onClick={handleClose} className="h-10 px-6 font-black tracking-widest text-[10px] uppercase">
                    Cancelar
                </Button>
                <Button
                    variant="primary"
                    onClick={doTransfer}
                    disabled={loadingTransfer}
                    className="h-10 px-8 shadow-lg shadow-brand-500/20 font-black tracking-[0.2em] text-[10px] uppercase"
                >
                    {loadingTransfer ? "Procesando..." : "EJECUTAR TRANSFERENCIA"}
                </Button>
            </div>
        </Modal>
    );
}
