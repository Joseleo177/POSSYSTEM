import Modal from "../ui/Modal";
import { Button } from "../ui/Button";

export default function AddStockModal({
    open, onClose, selectedWarehouse,
    addStockProduct, clearAddStockProduct,
    addStockSearch, setAddStockSearch, addStockResults, selectAddStockProduct,
    addStockForm, setAddStockForm,
    doAddStock, savingStock,
}) {
    return (
        <Modal open={open} onClose={onClose} title="Agregar Producto al Almacén" width={480}>
            <p className="text-xs text-content-muted dark:text-content-dark-muted mb-4">
                Almacén: <b className="text-content dark:text-content-dark">{selectedWarehouse?.name}</b>
            </p>

            <div className="mb-3">
                <div className="label mb-1">Producto *</div>
                {addStockProduct ? (
                    <div className="flex items-center gap-2.5 bg-info/10 border border-info/40 rounded-lg px-3 py-2">
                        <div className="flex-1">
                            <div className="text-xs font-bold text-info">{addStockProduct.name}</div>
                            <div className="text-[11px] text-content-muted dark:text-content-dark-muted">
                                {addStockProduct.category_name || "Sin categoría"} · Stock: {addStockProduct.stock}
                            </div>
                        </div>
                        <button
                            onClick={clearAddStockProduct}
                            className="p-1.5 rounded-lg bg-danger/10 text-danger border border-danger/20 hover:bg-danger hover:text-black transition-all"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                ) : (
                    <div className="relative">
                        <input
                            value={addStockSearch}
                            onChange={e => setAddStockSearch(e.target.value)}
                            placeholder="Buscar producto..."
                            className="input"
                        />
                        {addStockResults.length > 0 && (
                            <div className="absolute top-full left-0 right-0 bg-surface-2 dark:bg-surface-dark-2 border border-border dark:border-border-dark rounded-lg z-10 max-h-48 overflow-y-auto shadow-xl">
                                {addStockResults.map(p => (
                                    <div
                                        key={p.id}
                                        onClick={() => selectAddStockProduct(p)}
                                        className="px-3 py-2 cursor-pointer border-b border-surface-3 dark:border-surface-dark-3 text-xs hover:bg-surface-3 dark:hover:bg-surface-dark-3 transition-colors"
                                    >
                                        <div className="font-bold text-content dark:text-content-dark">{p.name}</div>
                                        <div className="text-[11px] text-content-muted dark:text-content-dark-muted">
                                            {p.category_name || "Sin categoría"} · Stock: {p.stock} {p.unit}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="mb-4">
                <div className="label mb-1">Cantidad inicial *</div>
                <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={addStockForm.qty}
                    onChange={e => setAddStockForm(p => ({ ...p, qty: e.target.value }))}
                    placeholder="0"
                    className="input"
                />
                <div className="text-[11px] text-content-muted dark:text-content-dark-muted mt-1">
                    Puedes ingresar 0 para registrar sin stock inicial
                </div>
            </div>

            <div className="flex justify-end gap-2.5 mt-2">
                <Button variant="ghost" onClick={onClose}>Cancelar</Button>
                <Button
                    onClick={doAddStock}
                    disabled={savingStock}
                    className="bg-success/10 text-success border border-success/30 hover:bg-success hover:text-black shadow-none"
                >
                    {savingStock ? "Guardando..." : "Agregar al almacén"}
                </Button>
            </div>
        </Modal>
    );
}
