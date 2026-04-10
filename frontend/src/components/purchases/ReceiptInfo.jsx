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
    } = state;

    return (
        <div className="card overflow-visible card-md mb-3">
            <div className="text-[11px] font-bold text-content-muted dark:text-content-dark-muted tracking-wide mb-3">
                INFORMACIÓN DEL RECIBO
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

                {/* Almacén */}
                <div>
                    <label className="label">Almacén destino *</label>

                    {warehouses.length === 0 ? (
                        <div className="input text-danger bg-danger/5 border-danger">
                            Sin almacenes disponibles
                        </div>
                    ) : (
                        <CustomSelect
                            value={selectedWarehouseId}
                            onChange={val => setSelectedWarehouseId(val)}
                            options={warehouses.map(w => ({
                                value: String(w.id),
                                label: w.name,
                            }))}
                            placeholder="Seleccionar almacén"
                            className="w-full"
                        />
                    )}

                    {selectedWarehouseId && (
                        <div className="text-[11px] text-success mt-1">
                            ● El stock entrará a{" "}
                            <b>
                                {warehouses.find(w => String(w.id) === selectedWarehouseId)?.name}
                            </b>
                        </div>
                    )}
                </div>

                {/* Proveedor */}
                <div className="relative z-[50]">
                    <label className="label">Proveedor</label>

                    {selectedSupplier ? (
                        <div className="flex items-center gap-2 bg-info/10 border border-info/30 rounded-lg p-2">
                            <div className="flex-1">
                                <div className="text-sm font-bold text-brand-500 dark:text-brand-400">
                                    {selectedSupplier.name}
                                </div>
                                {selectedSupplier.rif && (
                                    <div className="text-[11px] text-content-muted dark:text-content-dark-muted">
                                        {selectedSupplier.rif}
                                    </div>
                                )}
                            </div>

                            <button
                                onClick={() => {
                                    setSelectedSupplier(null);
                                    setSupplierSearch("");
                                }}
                                className="btn-sm btn-danger"
                            >
                                ✕
                            </button>
                        </div>
                    ) : (
                        <div className="relative">
                            <input
                                spellCheck={false}
                                autoComplete="off"
                                value={supplierSearch}
                                onChange={e => setSupplierSearch(e.target.value)}
                                placeholder="Buscar proveedor registrado..."
                                className="input"
                            />

                            {supplierSearch.trim().length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-surface-2 dark:bg-surface-dark-2 border border-border dark:border-border-dark rounded-lg shadow-2xl max-h-48 overflow-y-auto">

                                    {supplierResults.map(s => (
                                        <div
                                            key={s.id}
                                            onClick={() => selectSupplier(s)}
                                            className="px-4 py-3 cursor-pointer border-b border-border/50 dark:border-border-dark/50 text-sm hover:bg-surface-3 dark:hover:bg-surface-dark-3 transition-colors"
                                        >
                                            <div className="font-bold text-brand-500 dark:text-brand-400">
                                                {s.name}
                                            </div>
                                            <div className="text-[11px] text-content-muted dark:text-content-dark-muted mt-0.5">
                                                {[s.rif, s.tax_name].filter(Boolean).join(" · ") ||
                                                    "Sin datos adicionales"}
                                            </div>
                                        </div>
                                    ))}

                                    <div
                                        onClick={() => openCreateSupplier(supplierSearch)}
                                        className={`px-4 py-3 cursor-pointer text-sm font-bold text-brand-500 dark:text-brand-400 flex items-center gap-2 hover:bg-surface-3 dark:hover:bg-surface-dark-3 transition-colors ${supplierResults.length > 0
                                                ? "border-t border-border dark:border-border-dark"
                                                : ""
                                            }`}
                                    >
                                        <span className="text-lg bg-brand-500/10 text-brand-500 w-6 h-6 flex items-center justify-center rounded-md">
                                            +
                                        </span>
                                        Crear "{supplierSearch}"
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Notas */}
                <div>
                    <label className="label">Notas (opcional)</label>
                    <input
                        spellCheck={false}
                        autoComplete="off"
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        placeholder="ej. Compra de la semana..."
                        className="input"
                    />
                </div>
            </div>
        </div>
    );
}
