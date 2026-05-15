import { useState, useEffect, useRef } from "react";
import Modal from "../ui/Modal";
import { api } from "../../services/api";
import { fmtNumber } from "../../helpers";

const fmtPrice = (n) => `$${fmtNumber(parseFloat(n || 0))}`;

export default function EditSaleModal({ open, onClose, sale, notify, onSaved }) {
    const [items, setItems] = useState([]);
    const [search, setSearch] = useState("");
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [loading, setLoading] = useState(false);
    const searchRef = useRef(null);
    const debounceRef = useRef(null);

    useEffect(() => {
        if (open && sale) {
            setItems(
                (sale.items || []).map(i => ({
                    product_id: i.product_id,
                    name: i.name,
                    price: parseFloat(i.price),
                    qty: parseFloat(i.quantity),
                }))
            );
            setSearch("");
            setResults([]);
        }
    }, [open, sale]);

    useEffect(() => {
        if (!search.trim()) { setResults([]); return; }
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
            setSearching(true);
            try {
                const res = await api.products.getAll({ search: search.trim(), limit: 8, active: true });
                setResults(res.data?.products || res.data || []);
            } catch { setResults([]); }
            setSearching(false);
        }, 280);
        return () => clearTimeout(debounceRef.current);
    }, [search]);

    if (!open || !sale) return null;

    const handleQtyChange = (idx, val) => {
        let parsed = parseFloat(val);
        if (isNaN(parsed) || parsed < 0) parsed = 0;
        setItems(prev => prev.map((it, i) => i === idx ? { ...it, qty: parsed } : it));
    };

    const handleRemove = (idx) => {
        setItems(prev => prev.filter((_, i) => i !== idx));
    };

    const handleAddProduct = (p) => {
        const existing = items.findIndex(it => it.product_id === p.id);
        if (existing >= 0) {
            setItems(prev => prev.map((it, i) => i === existing ? { ...it, qty: it.qty + 1 } : it));
        } else {
            setItems(prev => [...prev, {
                product_id: p.id,
                name: p.name,
                price: parseFloat(p.price),
                qty: 1,
            }]);
        }
        setSearch("");
        setResults([]);
        searchRef.current?.focus();
    };

    const total = items.reduce((acc, it) => acc + (it.qty * it.price), 0);

    const handleSave = async () => {
        const validItems = items.filter(it => it.qty > 0);
        if (!validItems.length) return notify("Debes incluir al menos un producto", "err");
        setLoading(true);
        try {
            await api.sales.update(sale.id, {
                items: validItems.map(it => ({ product_id: it.product_id, qty: it.qty, price: it.price })),
                discount_amount: parseFloat(sale.discount_amount || 0),
            });
            notify("Factura actualizada correctamente", "ok");
            onSaved();
            onClose();
        } catch (e) {
            notify(e.message, "err");
        }
        setLoading(false);
    };

    return (
        <Modal open={open} onClose={onClose} title={`EDITAR ${sale.invoice_number || "#" + sale.id}`} width={600}>
            <p className="text-[12px] text-content-muted dark:text-content-dark-muted mb-4">
                Modifica cantidades, elimina productos o agrega nuevos. Solo aplica mientras la factura esté en estado <strong>Pendiente</strong>.
            </p>

            {/* Items table */}
            <div className="bg-surface-2 dark:bg-surface-dark-3 rounded-[1rem] border border-border/40 overflow-hidden shadow-sm mb-4 max-h-[35vh] overflow-y-auto scrollbar-dark">
                <table className="w-full text-[11px] border-collapse min-w-[460px]">
                    <thead className="sticky top-0 bg-surface-3 dark:bg-surface-dark border-b border-border/40 z-10">
                        <tr>
                            <th className="text-left px-4 py-2 font-black text-content-subtle uppercase tracking-wide">Producto</th>
                            <th className="text-center px-4 py-2 font-black text-content-subtle uppercase tracking-wide w-24">Precio U.</th>
                            <th className="text-right px-4 py-2 font-black text-content-subtle uppercase tracking-wide w-28 text-brand-500">Cantidad</th>
                            <th className="w-10" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/20">
                        {items.length === 0 && (
                            <tr><td colSpan={4} className="py-8 text-center text-[11px] text-content-subtle italic opacity-50">Sin productos</td></tr>
                        )}
                        {items.map((item, idx) => (
                            <tr key={idx} className="hover:bg-brand-500/5 transition-colors">
                                <td className="px-4 py-3 font-bold text-content">{item.name}</td>
                                <td className="px-4 py-3 text-center font-bold text-content-muted">{fmtPrice(item.price)}</td>
                                <td className="px-4 py-2 text-right">
                                    <input
                                        type="number"
                                        min="0"
                                        step="1"
                                        className="w-[70px] bg-white dark:bg-surface-dark-2 border border-border dark:border-border-dark py-1.5 px-2 rounded-lg text-[11px] font-bold text-center outline-none focus:ring-1 focus:ring-brand-500/20 shadow-sm"
                                        value={item.qty === 0 ? "" : item.qty}
                                        onChange={e => handleQtyChange(idx, e.target.value)}
                                        placeholder="0"
                                    />
                                </td>
                                <td className="px-2 py-3 text-center">
                                    <button
                                        onClick={() => handleRemove(idx)}
                                        className="p-1 rounded-lg text-content-subtle hover:text-danger hover:bg-danger/10 transition-all"
                                        title="Eliminar"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Product search */}
            <div className="mb-4 relative">
                <label className="label text-[11px] font-black uppercase tracking-wide text-content-subtle mb-1">Agregar producto</label>
                <input
                    ref={searchRef}
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar por nombre o código..."
                    className="w-full bg-surface-2 dark:bg-surface-dark-2 border border-border dark:border-border-dark py-2.5 px-3 rounded-xl text-xs outline-none focus:ring-2 focus:ring-brand-500/20 shadow-sm text-content dark:text-content-dark placeholder:text-content-subtle"
                />
                {(results.length > 0 || searching) && (
                    <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white dark:bg-surface-dark-2 border border-border/40 dark:border-white/10 rounded-xl shadow-2xl overflow-hidden">
                        {searching && (
                            <div className="px-4 py-3 text-[11px] text-content-subtle animate-pulse">Buscando...</div>
                        )}
                        {results.map(p => (
                            <button
                                key={p.id}
                                onClick={() => handleAddProduct(p)}
                                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-brand-500/5 transition-colors text-left"
                            >
                                <span className="text-[11px] font-bold text-content dark:text-white truncate">{p.name}</span>
                                <span className="text-[11px] font-black text-brand-500 ml-4 shrink-0">{fmtPrice(p.price)}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Total */}
            <div className="p-4 bg-brand-500/10 border border-brand-500/20 rounded-2xl flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wide text-brand-400 opacity-80">Nuevo Total</span>
                <span className="text-2xl font-black text-brand-400 tracking-tight">{fmtPrice(total)}</span>
            </div>

            <div className="flex justify-end gap-3 mt-6">
                <button onClick={onClose} disabled={loading} className="btn-sm btn-secondary font-black uppercase tracking-wide">
                    Cerrar
                </button>
                <button
                    onClick={handleSave}
                    disabled={loading || items.filter(i => i.qty > 0).length === 0}
                    className={[
                        "btn-md font-black uppercase tracking-wide transition-all duration-300 shadow-lg border-transparent",
                        (loading || items.filter(i => i.qty > 0).length === 0)
                            ? "bg-surface-3 dark:bg-surface-dark-3 text-content-muted cursor-not-allowed shadow-none"
                            : "bg-brand-500 text-black hover:brightness-110 hover:scale-[1.02] cursor-pointer"
                    ].join(" ")}
                >
                    {loading ? "Guardando..." : "Guardar cambios"}
                </button>
            </div>
        </Modal>
    );
}
