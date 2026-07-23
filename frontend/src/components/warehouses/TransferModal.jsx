import { useState, useEffect } from "react";
import Modal from "../ui/Modal";
import { Button } from "../ui/Button";
import CustomSelect from "../ui/CustomSelect";
import { isIntegerUnit, fmtQtyUnit } from "../../helpers/unitFormatter";

const EMPTY = { from_warehouse_id: "", to_warehouse_id: "", qty: "", note: "" };

export default function TransferModal({
    open, onClose, warehouses,
    transferProductSearch, setTransferProductSearch,
    transferProductResults, setTransferProductResults,
    transferProductSelected, setTransferProductSelected,
    transferForm, setTransferForm, doTransfer, loadingTransfer,
    transferProductTotal = 0, loadingTransferProducts, loadingMoreTransferProducts, loadMoreTransferProducts,
}) {
    const [showDropdown, setShowDropdown] = useState(false);
    const [items, setItems] = useState([]);

    // Reinicia la lista al cerrar/abrir el modal
    useEffect(() => { if (!open) setItems([]); }, [open]);

    const handleClose = () => {
        setTransferForm(EMPTY);
        setTransferProductSearch("");
        setTransferProductResults([]);
        setTransferProductSelected(null);
        setItems([]);
        onClose();
    };

    const warehouseOptions = warehouses
        .filter(w => w.active)
        .map(w => ({ value: w.id, label: w.name }));

    const originSelected = !!transferForm.from_warehouse_id;
    const qtyIsInteger = isIntegerUnit(transferProductSelected?.unit);

    // Scroll infinito del listado de productos
    const handleProductScroll = (e) => {
        const { scrollTop, scrollHeight, clientHeight } = e.target;
        if (scrollHeight - scrollTop <= clientHeight + 60) {
            if (transferProductResults.length < transferProductTotal && !loadingMoreTransferProducts && !loadingTransferProducts) {
                loadMoreTransferProducts?.();
            }
        }
    };

    const qtyValue = parseFloat(transferForm.qty);
    const canAdd = transferProductSelected && qtyValue > 0;

    const addItem = () => {
        if (!canAdd) return;
        const q = qtyIsInteger ? Math.floor(qtyValue) : qtyValue;
        if (q <= 0) return;
        const entry = {
            product_id: transferProductSelected.id,
            name:       transferProductSelected.name,
            unit:       transferProductSelected.unit,
            stock:      transferProductSelected.stock,
            qty:        q,
        };
        setItems(prev => {
            const exists = prev.some(x => x.product_id === entry.product_id);
            return exists
                ? prev.map(x => x.product_id === entry.product_id ? entry : x)
                : [...prev, entry];
        });
        setTransferProductSelected(null);
        setTransferProductSearch("");
        setShowDropdown(false);
        setTransferForm(p => ({ ...p, qty: "" }));
    };

    const removeItem = (pid) => setItems(prev => prev.filter(x => x.product_id !== pid));

    const canExecute = transferForm.from_warehouse_id && transferForm.to_warehouse_id && items.length > 0 && !loadingTransfer;

    return (
        <Modal open={open} onClose={handleClose} title="Nueva Transferencia de Inventario" width={560}>
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

                {/* ── Agregar producto a la lista ── */}
                {!originSelected ? (
                    <div className="rounded-xl border border-dashed border-border/40 dark:border-white/10 py-5 text-center text-[11px] font-bold uppercase tracking-widest text-content-subtle opacity-50">
                        Selecciona el almacén origen para agregar productos
                    </div>
                ) : (
                    <div className="grid grid-cols-[1.5fr_1fr_auto] gap-3 items-end">
                        <div className="relative">
                            <label className="label mb-1.5 opacity-70">Producto</label>
                            {transferProductSelected ? (
                                <div className="input h-10 flex items-center justify-between gap-3 border-brand-500 bg-brand-500/5 px-3">
                                    <span className="text-[11px] font-black uppercase tracking-tight truncate">{transferProductSelected.name}</span>
                                    <button
                                        onClick={() => { setTransferProductSelected(null); setTransferProductSearch(""); }}
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
                                        onFocus={() => setShowDropdown(true)}
                                        onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                                        placeholder="Nombre o código..."
                                        className="input h-10 pl-9"
                                    />
                                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-subtle opacity-40 group-focus-within:text-brand-500 group-focus-within:opacity-100 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                    {showDropdown && (
                                        <div
                                            onScroll={handleProductScroll}
                                            className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-surface-dark-2 border border-border/40 dark:border-white/10 rounded-xl shadow-2xl z-50 max-h-56 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200 divide-y divide-border/10"
                                        >
                                            {loadingTransferProducts && transferProductResults.length === 0 ? (
                                                <div className="py-6 text-center text-[10px] font-black uppercase tracking-widest text-content-subtle opacity-50">Buscando productos...</div>
                                            ) : transferProductResults.length === 0 ? (
                                                <div className="py-6 text-center text-[10px] font-black uppercase tracking-widest text-content-subtle opacity-50">Sin productos con stock</div>
                                            ) : (
                                                transferProductResults.map(p => {
                                                    const added = items.some(x => x.product_id === p.id);
                                                    return (
                                                        <button
                                                            key={p.id}
                                                            onMouseDown={e => e.preventDefault()}
                                                            onClick={() => { setTransferProductSelected(p); setTransferProductSearch(""); setShowDropdown(false); }}
                                                            className="w-full px-4 py-2.5 text-[11px] font-black uppercase tracking-tight text-left hover:bg-brand-500/[0.03] hover:text-brand-500 transition-all flex items-center justify-between gap-2"
                                                        >
                                                            <span className="truncate">{p.name} {added && <span className="text-brand-500 opacity-70">· en lista</span>}</span>
                                                            <span className="text-[9px] opacity-40 shrink-0">Stock: {p.stock}</span>
                                                        </button>
                                                    );
                                                })
                                            )}
                                            {loadingMoreTransferProducts && (
                                                <div className="py-3 text-center text-[10px] font-black uppercase tracking-widest text-content-subtle opacity-40">Cargando más...</div>
                                            )}
                                            {!loadingTransferProducts && !loadingMoreTransferProducts && transferProductResults.length > 0 && transferProductResults.length >= transferProductTotal && (
                                                <div className="py-2 text-center text-[9px] font-bold uppercase tracking-widest text-content-subtle opacity-30">{transferProductTotal} producto{transferProductTotal !== 1 ? "s" : ""}</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        <div>
                            <label className="label mb-1.5 opacity-70">Cantidad</label>
                            <input
                                type="number"
                                min={qtyIsInteger ? "1" : "0.001"}
                                step={qtyIsInteger ? "1" : "0.001"}
                                value={transferForm.qty}
                                onChange={e => {
                                    let v = e.target.value;
                                    if (qtyIsInteger) v = String(v).replace(/[.,].*$/, "");
                                    setTransferForm(p => ({ ...p, qty: v }));
                                }}
                                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }}
                                placeholder={qtyIsInteger ? "0" : "0.00"}
                                className="input h-10 font-black tabular-nums text-brand-500 placeholder:text-content-subtle/30"
                            />
                        </div>
                        <button
                            onClick={addItem}
                            disabled={!canAdd}
                            title="Agregar a la lista"
                            className={`h-10 px-4 rounded-xl text-[11px] font-black uppercase tracking-wide transition-all ${canAdd ? "bg-brand-500 text-black hover:brightness-110 active:scale-95" : "bg-surface-3 dark:bg-white/5 text-content-subtle cursor-not-allowed"}`}
                        >
                            + Agregar
                        </button>
                    </div>
                )}

                {/* ── Lista de productos a transferir ── */}
                {items.length > 0 && (
                    <div className="rounded-xl border border-border/30 dark:border-white/10 overflow-hidden">
                        <div className="px-4 py-2 bg-surface-2/50 dark:bg-white/[0.03] flex items-center justify-between">
                            <span className="text-[10px] font-black uppercase tracking-widest text-content-subtle">Productos a transferir</span>
                            <span className="text-[10px] font-black text-brand-500">{items.length}</span>
                        </div>
                        <div className="max-h-52 overflow-y-auto divide-y divide-border/10 dark:divide-white/5">
                            {items.map(it => {
                                const insufficient = it.stock != null && parseFloat(it.qty) > parseFloat(it.stock);
                                return (
                                    <div key={it.product_id} className="px-4 py-2.5 flex items-center gap-3">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[11px] font-black uppercase tracking-tight truncate">{it.name}</p>
                                            <p className={`text-[9px] font-bold ${insufficient ? "text-danger" : "text-content-subtle opacity-50"}`}>
                                                {insufficient ? `⚠ Excede el stock (disp. ${it.stock})` : `Disponible: ${it.stock}`}
                                            </p>
                                        </div>
                                        <span className={`text-[12px] font-black tabular-nums shrink-0 ${insufficient ? "text-danger" : "text-brand-500"}`}>
                                            {fmtQtyUnit(it.qty, it.unit)}
                                        </span>
                                        <button
                                            onClick={() => removeItem(it.product_id)}
                                            className="w-7 h-7 rounded-lg hover:bg-danger/10 text-content-subtle hover:text-danger transition-all flex items-center justify-center shrink-0"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* ── Nota ── */}
                <div>
                    <label className="label mb-1.5 opacity-70">Motivo de la transferencia (Opcional)</label>
                    <textarea
                        value={transferForm.note}
                        onChange={e => setTransferForm(p => ({ ...p, note: e.target.value }))}
                        placeholder="ej. Reposición de inventario para sucursal principal..."
                        className="input min-h-[70px] py-3 px-3 resize-none text-[11px] leading-relaxed"
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
                    onClick={() => doTransfer(items)}
                    disabled={!canExecute}
                    className="h-10 px-8 shadow-lg shadow-brand-500/20 font-black tracking-[0.2em] text-[10px] uppercase"
                >
                    {loadingTransfer ? "Procesando..." : `Ejecutar Transferencia${items.length > 0 ? ` (${items.length})` : ""}`}
                </Button>
            </div>
        </Modal>
    );
}
