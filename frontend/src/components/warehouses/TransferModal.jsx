import Modal from "../ui/Modal";
import { Button } from "../ui/Button";

const EMPTY = { from_warehouse_id: "", to_warehouse_id: "", product_id: "", qty: "", note: "" };

export default function TransferModal({ open, onClose, warehouses, products, transferForm, setTransferForm, doTransfer, loadingTransfer }) {
    const handleClose = () => {
        setTransferForm(EMPTY);
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
                    <select
                        value={transferForm.product_id}
                        onChange={e => setTransferForm(p => ({ ...p, product_id: e.target.value }))}
                        className="input"
                    >
                        <option value="">Seleccionar producto</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
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
