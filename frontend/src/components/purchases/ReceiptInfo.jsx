import CustomSelect from "../ui/CustomSelect";

export default function ReceiptInfo({ state }) {
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
        
        // Added state variables for the new UI logic
        supplierRef,
        showSupplierDropdown,
        setShowSupplierDropdown,
        loadingSuppliers,
        filteredSuppliers,
    } = state;

    return (
        <div className="card-premium mb-5 overflow-visible bg-surface-1 dark:bg-white/[0.01]">
            <div className="flex items-center gap-2 mb-6">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-content-subtle opacity-50">Cabecera del Recibo de Compra</div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
                {/* Bodega/Almacén */}
                <div className="md:col-span-4">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-content-subtle dark:text-content-dark-muted mb-2 block px-1">Almacén Destino *</label>
                    <div className="relative group">
                        <CustomSelect
                            value={String(selectedWarehouseId || "")}
                            onChange={val => setSelectedWarehouseId(val)}
                            options={warehouses.map(w => ({
                                value: String(w.id),
                                label: w.name.toUpperCase(),
                            }))}
                            placeholder="Seleccionar Almacén..."
                            className="w-full"
                        />
                    </div>
                </div>

                {/* Proveedor */}
                <div className="md:col-span-4">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-content-subtle dark:text-content-dark-muted mb-2 block px-1">Proveedor *</label>
                    
                    {selectedSupplier ? (
                        <div className="h-10 flex items-center justify-between gap-3 bg-brand-500/5 border border-brand-500/20 rounded-lg px-4 animate-in zoom-in-95 duration-200">
                            <div className="flex-1 min-w-0">
                                <div className="text-xs font-bold text-brand-500 uppercase truncate tracking-tight">{selectedSupplier.name}</div>
                                <div className="text-[9px] font-bold text-brand-500/50 tabular-nums">RIF: {selectedSupplier.rif}</div>
                            </div>
                            <button 
                                onClick={() => setSelectedSupplier(null)}
                                className="w-6 h-6 flex items-center justify-center rounded-lg bg-brand-500/10 text-brand-500 hover:bg-brand-500 hover:text-black transition-all active:scale-90"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                    ) : (
                        <div className="relative">
                            <div className="relative group">
                                <input
                                    value={supplierSearch}
                                    onChange={e => setSupplierSearch(e.target.value)}
                                    placeholder="Buscar proveedor..."
                                    className="input h-10 pr-10"
                                />
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-content-subtle opacity-30 group-hover:opacity-60 transition-opacity">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                </div>
                            </div>

                            {supplierSearch.trim() !== "" && (
                                <div className="absolute z-50 w-full mt-1 bg-white dark:bg-surface-dark-2 border border-border/40 dark:border-white/10 rounded-xl shadow-2xl p-1 max-h-[200px] overflow-y-auto animate-in fade-in slide-in-from-top-2">
                                    {supplierResults.length === 0 ? (
                                        <div className="p-3 text-center">
                                            <div className="text-[10px] font-bold text-content-subtle uppercase mb-2 opacity-50">Sin resultados</div>
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
                <div className="md:col-span-4">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-content-subtle dark:text-content-dark-muted mb-2 block px-1">Notas / Referencia</label>
                    <input
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        placeholder="ej. Factura #1234..."
                        className="input h-10 tabular-nums"
                    />
                </div>
            </div>
        </div>
    );
}
