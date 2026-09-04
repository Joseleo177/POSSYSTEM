import CustomSelect from "../ui/CustomSelect";
import { isRateEdited } from "../ui/RateField";
import { useApp } from "../../context/AppContext";

export default function ReceiptInfo({ state }) {
    const { baseCurrency, activeCurrencies } = useApp();
    const nonBaseCurrencies = (activeCurrencies || []).filter(c => !c.is_base);
    const {
        warehouses,
        selectedWarehouseId,
        setSelectedWarehouseId,

        selectedSupplier,
        setSelectedSupplier,

        supplierSearch,
        setSupplierSearch,
        supplierResults,
        selectSupplier,
        openCreateSupplier,

        notes,
        setNotes,

        invoiceCurrency,
        invoiceCurRate,
        invoiceRateInput,
        setInvoiceRateInput,
        selectInvoiceCurrency,

        supplierRef,
        showSupplierDropdown,
        setShowSupplierDropdown,
        loadingSuppliers,
        filteredSuppliers,
    } = state;

    return (
        <div className="card-premium mb-3 overflow-visible bg-surface-1 dark:bg-white/[0.01]">
            <div className="flex items-center gap-2 mb-3">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-content-subtle">Cabecera del Recibo de Compra</div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
                {/* Bodega/Almacén. Con uno solo no hay nada que elegir: mostrarlo solo
                    insinuaría que hay más, cuando no los hay. `selectedWarehouseId` ya
                    queda fijo en el único disponible desde el hook. */}
                {warehouses.length > 1 && (
                    <div className="md:col-span-3">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-content-subtle dark:text-content-dark-muted mb-1 block px-1">Almacén Destino</label>
                        <CustomSelect
                            value={String(selectedWarehouseId || "")}
                            onChange={val => setSelectedWarehouseId(val)}
                            options={warehouses.map(w => ({ value: String(w.id), label: w.name.toUpperCase() }))}
                            placeholder="Seleccionar Almacén..."
                            className="w-full"
                        />
                    </div>
                )}

                {/* Proveedor */}
                <div className="md:col-span-3">
                    {/* El borrador se guarda sin proveedor —es el papel de trabajo donde se
                        arma la lista antes de decidir a quién comprarle—, pero confirmar o
                        recibir sí lo exige, así que se marca desde el principio. */}
                    <label className="text-[10px] font-bold uppercase tracking-wider text-content-subtle dark:text-content-dark-muted mb-1 block px-1">Proveedor <span className="text-danger">*</span></label>

                    {selectedSupplier ? (
                        <div className="h-9 flex items-center justify-between gap-3 bg-brand-500/5 border border-brand-500/20 rounded-lg px-3 animate-in zoom-in-95 duration-200">
                            <div className="flex-1 min-w-0">
                                <div className="text-xs font-bold text-brand-500 uppercase truncate tracking-tight">{selectedSupplier.name}</div>
                                <div className="text-[9px] font-bold text-brand-500/50 tabular-nums">RIF: {selectedSupplier.rif}</div>
                            </div>
                            <button
                                onClick={() => setSelectedSupplier(null)}
                                className="w-5 h-5 flex items-center justify-center rounded-md bg-brand-500/10 text-brand-500 hover:bg-brand-500 hover:text-black transition-all active:scale-90"
                            >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                    ) : (
                        <div className="relative">
                            <div className="relative group">
                                <input
                                    value={supplierSearch}
                                    onChange={e => setSupplierSearch(e.target.value)}
                                    placeholder="Buscar proveedor..."
                                    className="input h-9 pr-10"
                                />
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-content-subtle opacity-30 group-hover:opacity-60 transition-opacity">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                </div>
                            </div>

                            {supplierSearch.trim() !== "" && (
                                <div className="absolute z-50 w-full mt-1 bg-white dark:bg-surface-dark-2 border border-border/40 dark:border-white/10 rounded-xl shadow-2xl p-1 max-h-[200px] overflow-y-auto animate-in fade-in slide-in-from-top-2">
                                    {supplierResults.length === 0 ? (
                                        <div className="p-3 text-center">
                                            <div className="text-[10px] font-bold text-content-subtle uppercase mb-2">Sin resultados</div>
                                            <button onClick={() => openCreateSupplier(supplierSearch)} className="text-[10px] font-bold text-brand-500 uppercase hover:underline">+ Crear Nuevo</button>
                                        </div>
                                    ) : (
                                        supplierResults.map(s => (
                                            <div key={s.id} onClick={() => selectSupplier(s)} className="p-3 hover:bg-brand-500/10 rounded-lg cursor-pointer flex justify-between items-center transition-colors group">
                                                <div>
                                                    <div className="text-xs font-bold uppercase tracking-tight group-hover:text-brand-500">{s.name}</div>
                                                    <div className="text-[10px] text-content-subtle opacity-60 tabular-nums">RIF: {s.rif}</div>
                                                </div>
                                                <svg className="w-3.5 h-3.5 text-brand-500 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Notas */}
                <div className="md:col-span-3">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-content-subtle dark:text-content-dark-muted mb-1 block px-1">Notas / Referencia</label>
                    <input
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        placeholder="ej. Factura #1234..."
                        className="input h-9 tabular-nums"
                    />
                </div>

                {/* Moneda y tasa de la factura del proveedor. Va en la cabecera, junto a la
                    referencia, porque es un dato de la compra —a cuánto se compró ese día— y
                    no una preferencia de visualización de la tabla. */}
                {nonBaseCurrencies.length > 0 && (
                    <div className="md:col-span-3">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-content-subtle dark:text-content-dark-muted mb-1 block px-1">Moneda / Tasa</label>
                        <div className="flex items-center gap-1.5">
                            <div className="flex items-center h-9 rounded-lg overflow-hidden border border-border/40 dark:border-white/10 shrink-0">
                                <button
                                    type="button"
                                    onClick={() => selectInvoiceCurrency(null)}
                                    className={`h-full px-2 text-[10px] font-black uppercase tracking-wide transition-all ${!invoiceCurrency ? "bg-brand-500 text-white" : "text-content-subtle dark:text-white/30 hover:bg-surface-2 dark:hover:bg-white/[0.06]"}`}
                                    title="Cargar costos en moneda base"
                                >
                                    {baseCurrency?.symbol || "Ref."}
                                </button>
                                {nonBaseCurrencies.map(c => (
                                    <button
                                        key={c.id}
                                        type="button"
                                        onClick={() => selectInvoiceCurrency(c)}
                                        className={`h-full px-2 text-[10px] font-black uppercase tracking-wide border-l border-border/40 dark:border-white/10 transition-all ${invoiceCurrency?.id === c.id ? "bg-brand-500 text-white" : "text-content-subtle dark:text-white/30 hover:bg-surface-2 dark:hover:bg-white/[0.06]"}`}
                                        title={`Cargar costos en ${c.name}`}
                                    >
                                        {c.code}
                                    </button>
                                ))}
                            </div>
                            <input
                                value={invoiceRateInput}
                                onChange={e => setInvoiceRateInput(e.target.value.replace(/[^\d.,]/g, ""))}
                                disabled={!invoiceCurrency}
                                placeholder={invoiceCurRate.toFixed(4)}
                                title={invoiceCurrency ? `Tasa de configuración: ${invoiceCurRate.toFixed(4)}` : "Elige la moneda de la factura"}
                                className={`input h-9 tabular-nums text-center px-1 disabled:opacity-30 ${isRateEdited(invoiceRateInput, invoiceCurRate) ? "!border-warning/60 text-warning" : ""}`}
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
