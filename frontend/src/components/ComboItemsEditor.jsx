import { useState, useEffect, useRef } from "react";
import { api } from "../services/api";

export default function ComboItemsEditor({ comboItems, onChange, excludeId, warehouseId }) {
    const [search, setSearch] = useState("");
    const [results, setResults] = useState([]);
    const [loadingSearch, setLoadingSearch] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const containerRef = useRef(null);
    const timer = useRef(null);

    useEffect(() => {
        if (!search.trim()) { setResults([]); return; }
        clearTimeout(timer.current);
        timer.current = setTimeout(async () => {
            setLoadingSearch(true);
            try {
                const r = await api.products.getAll({ search, is_combo: false, limit: 10, warehouse_id: warehouseId });
                setResults(r.data.filter(p => p.id !== excludeId));
            } catch {}
            finally { setLoadingSearch(false); }
        }, 250);
        return () => clearTimeout(timer.current);
    }, [search, excludeId, warehouseId]);

    useEffect(() => {
        const handle = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) setShowDropdown(false);
        };
        document.addEventListener("mousedown", handle);
        return () => document.removeEventListener("mousedown", handle);
    }, []);

    const add = (prod) => {
        if (comboItems.find(i => i.product_id === prod.id)) return;
        onChange([...comboItems, { product_id: prod.id, name: prod.name, unit: prod.unit || "uds", quantity: 1, price: parseFloat(prod.price || 0), cost_price: parseFloat(prod.cost_price || 0) }]);
        setSearch("");
        setShowDropdown(false);
    };

    const remove = (id) => onChange(comboItems.filter(i => i.product_id !== id));

    const updateQty = (id, q) => {
        if (parseFloat(q) < 0) return;
        const itemToUpdate = comboItems.find(i => i.product_id === id);
        if (itemToUpdate) {
            const u = itemToUpdate.unit ? itemToUpdate.unit.toUpperCase() : "";
            if (u === "UNIDAD" || u === "UDS") {
                if (q.includes(".") || q.includes(",")) return;
            }
        }
        onChange(comboItems.map(i => i.product_id === id ? { ...i, quantity: q } : i));
    };

    const totalQty = comboItems.reduce((acc, item) => acc + (parseFloat(item.quantity) || 0), 0);

    return (
        <div className="bg-surface-1 dark:bg-surface-dark-2 rounded-lg p-3 border border-border/40 dark:border-white/5 animate-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wide text-content-subtle dark:text-content-dark-muted">Fórmula del Producto</span>
            </div>

            <div className="space-y-2">
                {/* Buscador */}
                <div className="relative" ref={containerRef}>
                    <input
                        value={search}
                        onChange={e => { setSearch(e.target.value); setShowDropdown(true); }}
                        onFocus={() => setShowDropdown(true)}
                        placeholder="Buscar componente..."
                        className="input !h-8 text-sm pl-8"
                    />
                    <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-content-subtle">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    </div>
                    {showDropdown && search.trim() !== "" && (
                        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-surface-dark-2 border border-border dark:border-white/10 rounded-lg shadow-lg p-1 max-h-[180px] overflow-y-auto">
                            {loadingSearch ? (
                                <div className="p-3 text-center text-xs text-content-subtle">Buscando...</div>
                            ) : results.length === 0 ? (
                                <div className="p-3 text-center text-xs text-content-subtle">Sin resultados</div>
                            ) : results.map(p => (
                                <div key={p.id} onClick={() => add(p)} className="p-2 hover:bg-surface-2 dark:hover:bg-white/5 rounded-lg cursor-pointer flex justify-between items-center transition-colors">
                                    <div>
                                        <div className="text-xs font-medium">{p.name}</div>
                                        <div className="text-[10px] text-content-subtle">{p.category_name || "General"}</div>
                                    </div>
                                    <span className="text-[11px] font-medium text-brand-500">Ref. {p.price}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Lista de ingredientes */}
                {comboItems.length === 0 ? (
                    <div className="py-4 border border-dashed border-border/40 dark:border-white/10 rounded-lg text-center">
                        <div className="text-xs text-content-subtle">No hay componentes añadidos</div>
                    </div>
                ) : (
                    <div className="space-y-1">
                        <div className="flex px-2 text-[10px] font-bold text-content-subtle uppercase">
                            <div className="flex-1">Componente</div>
                            <div className="w-20 text-center">Cant.</div>
                            <div className="w-7"></div>
                        </div>
                        {comboItems.map((item, idx) => (
                            <div key={idx} className="flex items-center gap-2 bg-surface-2 dark:bg-surface-dark-3 py-1.5 px-2 rounded-lg border border-border/40 dark:border-white/5">
                                <div className="flex-1 min-w-0">
                                    <div className="text-xs font-medium truncate">{item.name}</div>
                                </div>
                                <div className="w-20">
                                    <input
                                        value={item.quantity}
                                        onChange={e => updateQty(item.product_id, e.target.value)}
                                        type="number"
                                        step={item.unit && (item.unit.toUpperCase() === "UNIDAD" || item.unit.toUpperCase() === "UDS") ? "1" : "0.001"}
                                        className="input !h-7 text-center text-xs"
                                    />
                                </div>
                                <button onClick={() => remove(item.product_id)} className="w-7 h-7 flex items-center justify-center text-content-muted hover:text-danger hover:bg-danger/10 rounded-md transition-colors flex-shrink-0">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                            </div>
                        ))}
                        <div className="flex justify-end pt-1">
                            <span className="text-[11px] font-medium text-content-subtle">
                                Total: <span className="font-bold text-content dark:text-content-dark">{totalQty % 1 === 0 ? totalQty : totalQty.toFixed(3)} uds</span>
                            </span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
