import { useState, useEffect, useCallback } from "react";
import Modal from "../ui/Modal";
import { Button } from "../ui/Button";
import { useDebounce } from "../../hooks/useDebounce";
import { api } from "../../services/api";

export default function AddStockModal({
    open, onClose, selectedWarehouse,
    addStockProduct, clearAddStockProduct,
    selectAddStockProduct,
    addStockForm, setAddStockForm,
    doAddStock, savingStock,
}) {
    const [search, setSearch] = useState("");
    const debouncedSearch = useDebounce(search, 400);
    const [results, setResults] = useState([]);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [loadingList, setLoadingList] = useState(false);
    const LIMIT = 30;

    const loadProducts = useCallback(async (pageNum = 0, append = false) => {
        if (!open || addStockProduct) return;
        if (pageNum === 0) setLoadingList(true);
        else setLoadingMore(true);

        try {
            const params = {
                search: debouncedSearch,
                limit: LIMIT,
                offset: pageNum * LIMIT,
                is_service: false,
            };
            if (selectedWarehouse) params.not_in_warehouse_id = selectedWarehouse.id;
            
            const r = await api.products.getAll(params);
            const prods = r.data || [];
            setResults(prev => append ? [...prev, ...prods] : prods);
            setHasMore(prods.length === LIMIT);
            setPage(pageNum);
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingList(false);
            setLoadingMore(false);
        }
    }, [open, addStockProduct, debouncedSearch, selectedWarehouse]);

    useEffect(() => {
        if (open && !addStockProduct) loadProducts(0, false);
    }, [open, addStockProduct, debouncedSearch, loadProducts]);

    const handleScroll = (e) => {
        const { scrollTop, scrollHeight, clientHeight } = e.target;
        if (scrollHeight - scrollTop <= clientHeight + 50) {
            if (hasMore && !loadingMore && !loadingList) {
                loadProducts(page + 1, true);
            }
        }
    };

    // Limpiar buscador al abrir/cerrar
    useEffect(() => {
        if (!open) {
            setSearch("");
            setResults([]);
        }
    }, [open]);

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
                    <div className="space-y-3">
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar producto..."
                            className="input"
                        />
                        
                        <div 
                            className="max-h-48 overflow-y-auto border border-border/40 dark:border-white/10 rounded-lg divide-y divide-border/10 dark:divide-white/[0.04]"
                            onScroll={handleScroll}
                        >
                            {loadingList ? (
                                <div className="py-6 text-center text-xs text-content-muted dark:text-content-dark-muted font-bold uppercase tracking-widest">
                                    Buscando productos...
                                </div>
                            ) : results.length === 0 ? (
                                <div className="py-6 text-center text-xs text-content-muted dark:text-content-dark-muted font-bold uppercase tracking-widest">
                                    No hay resultados
                                </div>
                            ) : (
                                results.map(p => (
                                    <div
                                        key={p.id}
                                        onClick={() => selectAddStockProduct(p)}
                                        className="px-3 py-2 cursor-pointer text-xs hover:bg-surface-3 dark:hover:bg-surface-dark-3 transition-colors flex items-center justify-between"
                                    >
                                        <div>
                                            <div className="font-bold text-content dark:text-content-dark">{p.name}</div>
                                            <div className="text-[11px] text-content-muted dark:text-content-dark-muted">
                                                {p.category_name || "Sin categoría"}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                            {loadingMore && (
                                <div className="py-3 text-center text-[10px] text-content-muted dark:text-content-dark-muted font-black uppercase tracking-widest opacity-50">
                                    Cargando más...
                                </div>
                            )}
                        </div>
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
