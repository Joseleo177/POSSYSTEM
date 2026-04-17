import DatePicker from "../ui/DatePicker";
import CustomSelect from "../ui/CustomSelect";
import { PKG_UNITS } from "../../constants/pkg";

const fmt2 = (num) => Number(num || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ProductSearch({ state }) {
    const {
        itemForm,
        setIF,
        productSearch,
        setProductSearch,
        productResults,
        searching,
        selectProduct,
        openCreateProduct,
        calc,
        addItem,
        items,
        removeItem,
        grandTotal,
        savePurchase,
        loading,
        selectedWarehouseId,
    } = state;

    return (
        <div className="flex flex-col gap-3">
            <div className="card-premium overflow-visible p-4">
                <div className="text-[10px] font-black uppercase tracking-widest text-brand-500 mb-3 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-500 shadow-[0_0_8px_rgba(var(--color-brand-500),0.6)]" />
                    Buscador de Mercancia
                </div>

                {/* Buscador */}
                <div className="mb-3 relative z-[40]">
                    <label className="label !text-[10px] mb-1">Producto a Ingresar</label>

                    {itemForm.product ? (
                        <div className="flex items-center gap-3 bg-brand-500/[0.03] border border-brand-500/20 rounded-xl p-3 shadow-sm border-l-4 border-l-brand-500">
                            <div className="flex-1">
                                <div className="text-sm font-black text-brand-500 uppercase tracking-tight">
                                    {itemForm.product.name}
                                </div>
                                <div className="flex items-center gap-3 mt-0.5">
                                    <div className="text-[10px] font-bold text-content-subtle opacity-60 uppercase tracking-widest">
                                        Stock actual: <span className="text-content dark:text-white tabular-nums">{itemForm.product.stock} {itemForm.product.unit}</span>
                                    </div>
                                    {itemForm.product.cost_price && (
                                        <div className="text-[10px] font-bold text-content-subtle opacity-60 uppercase tracking-widest border-l border-border/20 pl-3">
                                            Último Costo: <span className="text-brand-500 tabular-nums">${fmt2(itemForm.product.cost_price)}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <button
                                onClick={() => setIF("product", null)}
                                className="h-8 px-3 flex items-center justify-center rounded-xl bg-danger/10 text-danger border border-danger/20 hover:bg-danger hover:text-white transition-all text-[10px] font-black uppercase tracking-widest active:scale-95"
                            >
                                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                                Cambiar
                            </button>
                        </div>
                    ) : (
                        <div className="relative">
                            <input
                                spellCheck={false}
                                autoComplete="off"
                                value={productSearch}
                                onChange={e => setProductSearch(e.target.value)}
                                placeholder="Escribe el nombre o codigo del producto..."
                                className="input h-9 pr-10"
                            />
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-20">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            </div>
                            {searching && (
                                <div className="absolute right-10 top-1/2 -translate-y-1/2">
                                    <div className="w-3 h-3 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                                </div>
                            )}
                            {productSearch.trim().length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-surface-2 dark:bg-[#1a1c23] border border-border/30 dark:border-white/10 rounded-2xl shadow-2xl max-h-60 overflow-y-auto z-[100] p-1.5 backdrop-blur-xl">
                                    {productResults.map(p => (
                                        <div
                                            key={p.id}
                                            onClick={() => selectProduct(p)}
                                            className="px-4 py-2.5 cursor-pointer rounded-xl border border-transparent hover:border-brand-500/20 hover:bg-brand-500/5 transition-all group"
                                        >
                                            <div className="font-black text-brand-500 group-hover:text-brand-400 uppercase text-xs">{p.name}</div>
                                            <div className="text-[10px] font-bold text-content-subtle opacity-50 mt-0.5 uppercase whitespace-nowrap overflow-hidden text-ellipsis tabular-nums">
                                                Stock: {p.stock} {p.unit}
                                                {p.package_unit && ` · Pack: ${p.package_unit} x${p.package_size}`}
                                                {p.cost_price && ` · Anterior: $${fmt2(p.cost_price)}`}
                                            </div>
                                        </div>
                                    ))}
                                    <div
                                        onClick={() => openCreateProduct(productSearch)}
                                        className="mt-1 px-4 py-2.5 cursor-pointer rounded-xl bg-warning/5 border border-warning/10 text-[11px] font-black text-warning flex items-center gap-3 hover:bg-warning hover:text-black transition-all group"
                                    >
                                        <div className="w-6 h-6 flex items-center justify-center rounded-lg bg-warning/10 group-hover:bg-black/10">
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" /></svg>
                                        </div>
                                        CREAR PRODUCTO: "{productSearch.toUpperCase()}"
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Grid de Formulario de Item */}
                <div className={`space-y-3 transition-all duration-300 ${!itemForm.product ? "opacity-30 pointer-events-none select-none" : ""}`}>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-content-subtle opacity-50 px-1">Empaque</label>
                            <CustomSelect
                                value={itemForm.package_unit || ""}
                                onChange={(val) => setIF("package_unit", val)}
                                options={PKG_UNITS.map(u => ({ value: u, label: u }))}
                                placeholder="Caja, Bulto..."
                                className="w-full"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="label !text-[10px]">Unidades x Empaque</label>
                            <input
                                type="number"
                                min="1"
                                step="1"
                                value={itemForm.package_size}
                                onChange={e => setIF("package_size", e.target.value)}
                                disabled={itemForm.package_unit?.toLowerCase() === "unidad"}
                                className={`input h-9 text-center font-black tabular-nums transition-all ${itemForm.package_unit?.toLowerCase() === "unidad" ? "bg-surface-3 opacity-30 cursor-not-allowed border-dashed" : ""}`}
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="label !text-[10px]">Cant. Empaques</label>
                            <input
                                type="number"
                                min="1"
                                step="1"
                                value={itemForm.package_qty}
                                onChange={e => setIF("package_qty", e.target.value)}
                                className="input h-9 text-center font-black tabular-nums border-brand-500/20 active:border-brand-500 focus:border-brand-500"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="label !text-[10px]">Costo x Empaque ($)</label>
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={itemForm.package_price}
                                onChange={e => setIF("package_price", e.target.value)}
                                placeholder="0.00"
                                className="input h-9 text-center font-black tabular-nums text-brand-500"
                            />
                        </div>
                    </div>

                    {/* Cálculos y Proyecciones */}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                        <div className="bg-surface-1 dark:bg-white/[0.02] p-3 rounded-xl border border-border/10">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-content-subtle mb-2 block">Margen Sugerido</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    min="0"
                                    step="0.1"
                                    value={itemForm.profit_margin}
                                    onChange={e => setIF("profit_margin", e.target.value)}
                                    className="input h-9 pr-8 font-bold tabular-nums"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-content-subtle opacity-40">%</span>
                            </div>
                        </div>

                        <div className="bg-surface-1 dark:bg-white/[0.02] p-3 rounded-xl border border-border/10 flex flex-col justify-between">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-content-subtle mb-1 block">Costo Unitario</label>
                            <div className="text-lg font-black text-info tabular-nums tracking-tighter">
                                <span className="text-xs mr-1 opacity-40">$</span>
                                {calc?.unit_cost ? fmt2(calc.unit_cost) : "0"}
                            </div>
                            <div className="text-[8px] font-bold text-info/50 uppercase tracking-widest leading-none">Cálculo Proyectado</div>
                        </div>

                        <div className="bg-brand-500/5 p-3 rounded-xl border border-brand-500/10 flex flex-col justify-between">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-brand-500 mb-1 block">Precio de Venta</label>
                            <div className="text-lg font-black text-brand-500 tabular-nums tracking-tighter">
                                <span className="text-xs mr-1 opacity-40">$</span>
                                {calc?.sale_price ? fmt2(calc.sale_price) : "0"}
                            </div>
                            <div className="text-[8px] font-bold text-brand-500/50 uppercase tracking-widest leading-none italic">Sincronización Activa</div>
                        </div>

                        <div className="bg-surface-1 dark:bg-white/[0.02] p-3 rounded-xl border border-border/10 flex flex-col justify-between">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-warning mb-1 block">Total Unidades</label>
                            <div className="text-lg font-black text-warning tabular-nums tracking-tighter">
                                {calc?.total_units || "0"}
                                <span className="text-[10px] ml-1.5 opacity-40 uppercase">{itemForm.product?.unit || "uds"}</span>
                            </div>
                            <div className="text-[8px] font-bold text-warning/50 uppercase tracking-widest leading-none">Ingreso al Stock</div>
                        </div>
                    </div>

                    {/* Lotes y Vencimiento */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
                        <div className="space-y-1">
                            <div className="flex items-center justify-between px-1">
                                <label className="label !text-[10px] !mb-0">Identificador de Lote</label>
                                <span className="text-[9px] font-black uppercase text-brand-500 tracking-[0.2em]">obligatorio</span>
                            </div>
                            <input
                                type="text"
                                value={itemForm.lot_number || ""}
                                onChange={e => setIF("lot_number", e.target.value)}
                                placeholder="Ej. LOT-2024-AUG"
                                className="input h-9 font-bold tracking-widest uppercase tabular-nums"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="label !text-[10px] px-1">Fecha de Expiración</label>
                            <DatePicker
                                value={itemForm.expiration_date || ""}
                                onChange={v => setIF("expiration_date", v)}
                                placeholder="Indefinido / Permanente"
                                className="w-full"
                            />
                        </div>
                    </div>
                </div>

                {/* Acciones de agregado */}
                <div className={`mt-4 pt-3 border-t border-border/20 dark:border-white/5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 transition-all duration-300 ${!itemForm.product ? "opacity-30 pointer-events-none select-none" : ""}`}>
                    <label className="flex items-center gap-3 cursor-pointer group">
                        <div className="relative flex items-center">
                            <input
                                type="checkbox"
                                checked={itemForm.update_price}
                                onChange={e => setIF("update_price", e.target.checked)}
                                className="peer appearance-none w-5 h-5 rounded-lg border-2 border-border/30 checked:bg-brand-500 checked:border-brand-500 transition-all cursor-pointer"
                            />
                            <svg className="absolute w-3.5 h-3.5 text-black left-[3px] opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" /></svg>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[11px] font-black text-content dark:text-white uppercase tracking-tight group-hover:text-brand-500 transition-colors">
                                Sincronizar precio en Catalago
                            </span>
                            {calc?.sale_price > 0 && (
                                <span className="text-[9px] font-bold text-success uppercase leading-none mt-0.5">
                                    Nuevo PVP: ${fmt2(calc.sale_price)}
                                </span>
                            )}
                        </div>
                    </label>
                    <button
                        onClick={addItem}
                        disabled={!itemForm.product}
                        className="h-9 px-6 rounded-xl bg-success text-black text-[11px] font-bold uppercase tracking-widest hover:brightness-105 disabled:opacity-30 disabled:grayscale transition-all shadow-lg shadow-success/10 active:scale-95 flex items-center justify-center gap-2"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" /></svg>
                        Confirmar Entrada
                    </button>
                </div>
            </div>

            {/* Listado de items temporales */}
            {items.length > 0 && (
                <div className="card-premium !p-0 overflow-hidden shadow-2xl">
                    <div className="px-4 py-2.5 bg-surface-2 dark:bg-white/[0.01] border-b border-border/10 dark:border-white/5 flex items-center justify-between">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-content-subtle opacity-50">Mercancía en Tránsito (Recibo)</div>
                        <div className="badge badge-info shadow-none !px-2 font-bold uppercase tabular-nums">{items.length} Tipos de productos</div>
                    </div>

                    <div className="overflow-auto max-h-[360px]">
                        <table className="table-pos">
                            <thead>
                                <tr>
                                    <th>Producto</th>
                                    <th className="text-center">Control</th>
                                    <th>Empaque</th>
                                    <th className="text-center">Cant.</th>
                                    <th className="text-right">Unitario</th>
                                    <th className="text-center">PVP</th>
                                    <th className="text-right">Subtotal</th>
                                    <th className="w-16 text-right pr-6"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/20 dark:divide-white/5">
                                {items.map(item => (
                                    <tr key={item.key} className="group hover:bg-brand-500/[0.02] transition-colors">
                                        <td>
                                            <div className="font-medium text-xs text-content dark:text-white uppercase tracking-tight truncate max-w-[200px]">
                                                {item.product?.name}
                                            </div>
                                        </td>
                                        <td className="text-center">
                                            <div className="flex flex-col items-center gap-0.5 leading-none">
                                                <span className="text-[9px] font-bold bg-warning/10 text-warning px-1.5 py-0.5 rounded uppercase tracking-tighter">L: {item.lot_number || "S/L"}</span>
                                                {item.expiration_date && (
                                                    <span className="text-[8px] font-medium text-content-subtle uppercase tabular-nums opacity-60">V: {item.expiration_date}</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="text-[10px] font-medium text-content-subtle opacity-60 uppercase whitespace-nowrap">
                                            {item.package_unit} × {item.package_unit?.toLowerCase() === "unidad" ? "1" : item.package_size}
                                        </td>
                                        <td className="text-center font-medium text-xs tabular-nums text-content dark:text-white">
                                            {item.package_qty}
                                        </td>
                                        <td className="text-right tabular-nums text-[10px] font-bold opacity-60">
                                            ${fmt2(item.unit_cost)}
                                        </td>
                                        <td className="text-center">
                                            <span className="badge badge-success !bg-success/5 !text-success shadow-none font-black tabular-nums scale-90 uppercase">
                                                ${fmt2(item.sale_price)}
                                            </span>
                                        </td>
                                        <td className="text-right font-black text-xs tabular-nums text-warning tracking-tighter pr-2">
                                            ${fmt2(item.subtotal)}
                                        </td>
                                        <td className="text-right pr-6">
                                            <button
                                                onClick={() => removeItem(item.key)}
                                                className="p-2 rounded-xl text-danger opacity-0 group-hover:opacity-100 hover:bg-danger/10 transition-all active:scale-95"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Totales y Acción final */}
                    <div className="bg-surface-2 dark:bg-white/[0.04] px-5 py-4 border-t border-border/30 dark:border-white/10 flex flex-col md:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center text-brand-500 shadow-inner">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            </div>
                            <div>
                                <div className="text-[10px] font-black uppercase tracking-[0.3em] text-content-subtle opacity-40 leading-none mb-0.5">Total del Recibo</div>
                                <div className="text-2xl font-black text-brand-500 tabular-nums tracking-tighter leading-none">${fmt2(grandTotal)}</div>
                            </div>
                        </div>

                        <button
                            onClick={savePurchase}
                            disabled={loading || !selectedWarehouseId}
                            className={`h-10 px-8 rounded-xl flex items-center gap-3 transition-all active:scale-95 shadow-2xl ${loading || !selectedWarehouseId
                                ? "bg-surface-3 cursor-not-allowed opacity-50 text-content-subtle"
                                : "bg-brand-500 text-black hover:scale-[1.02] hover:brightness-110 shadow-brand-500/20"
                                }`}
                        >
                            <span className="text-[11px] font-black uppercase tracking-widest">
                                {loading ? "Procesando Almacen..." : !selectedWarehouseId ? "Esperando Almacén" : "Finalizar y Cargar Stock"}
                            </span>
                            {!loading && selectedWarehouseId && (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                            )}
                        </button>
                    </div>
                </div>
            )}

            {items.length === 0 && (
                <div className="card-premium flex flex-col items-center justify-center py-10 gap-3 opacity-20 grayscale border-dashed">
                    <svg className="w-10 h-10 text-content-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
                    <div className="text-[10px] font-black uppercase tracking-widest text-center">El recibo esta vacío.<br />Agrega productos para registrar la compra.</div>
                </div>
            )}
        </div>
    );
}
