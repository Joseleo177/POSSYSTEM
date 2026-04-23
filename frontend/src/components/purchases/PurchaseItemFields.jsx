import CustomSelect from "../ui/CustomSelect";

// Helper for currency formatting
const fmt2 = (num) => Number(num || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PurchaseItemFields({ state }) {
    const {
        itemForm,
        setIF,
        calcItem,
        PKG_UNITS,
    } = state;

    const calc = calcItem(itemForm);

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* FILA 1: Logística de Empaque */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-content-subtle opacity-50 px-1">Empaque</label>
                    <CustomSelect
                        value={itemForm.package_unit || ""}
                        onChange={(val) => setIF("package_unit", val)}
                        options={PKG_UNITS.map(u => ({ value: u, label: u }))}
                        placeholder="Caja, Bulto..."
                        className="w-full"
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-content-subtle opacity-50 px-1">Unidades x Empaque</label>
                    <input
                        type="number"
                        min="1"
                        step="1"
                        value={itemForm.package_size}
                        onChange={(e) => setIF("package_size", e.target.value)}
                        disabled={itemForm.package_unit?.toLowerCase() === "unidad"}
                        placeholder={itemForm.package_unit?.toLowerCase() === "unidad" ? "1" : "ej. 12"}
                        className={`input h-10 tabular-nums ${
                            itemForm.package_unit?.toLowerCase() === "unidad"
                                ? "bg-surface-2 dark:bg-white/[0.02] opacity-40 cursor-not-allowed"
                                : ""
                        }`}
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-content-subtle opacity-50 px-1">Cant. Empaques</label>
                    <input
                        type="number"
                        min="1"
                        step="1"
                        value={itemForm.package_qty}
                        onChange={(e) => setIF("package_qty", e.target.value)}
                        className="input h-10 tabular-nums font-bold text-brand-500"
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-content-subtle opacity-50 px-1">Costo x Empaque ($)</label>
                    <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={itemForm.package_price}
                        onChange={(e) => setIF("package_price", e.target.value)}
                        placeholder="0.00"
                        className="input h-10 tabular-nums"
                    />
                </div>
            </div>

            {/* FILA 2: Proyecciones y Márgenes */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-content-subtle opacity-50 px-1">Margen Sugerido (%)</label>
                    <div className="relative group">
                        <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={itemForm.profit_margin}
                            onChange={(e) => setIF("profit_margin", e.target.value)}
                            className="input h-10 pr-8 tabular-nums font-bold"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-content-subtle opacity-40">%</span>
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-content-subtle opacity-50 px-1">Costo Unitario</label>
                    <div className="card-premium h-10 flex flex-col justify-center px-4 bg-brand-500/[0.02] border-brand-500/10 rounded-lg">
                        <div className="text-xs font-bold text-brand-500 tabular-nums">
                            {calc.unit_cost ? `$ ${fmt2(calc.unit_cost)}` : "$ 0"}
                        </div>
                        <div className="text-[8px] uppercase tracking-tighter opacity-40 font-bold">Cálculo Proyectado</div>
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-content-subtle opacity-50 px-1">Precio de Venta</label>
                    <div className="card-premium h-10 flex flex-col justify-center px-4 bg-success/5 border-success/10">
                        <div className="text-xs font-bold text-success tabular-nums">
                            {calc.sale_price ? `$ ${fmt2(calc.sale_price)}` : "$ 0"}
                        </div>
                        <div className="text-[8px] uppercase tracking-tighter opacity-40 font-bold text-success">Sincronización Activa</div>
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-content-subtle opacity-50 px-1">Total Unidades</label>
                    <div className="card-premium h-10 flex flex-col justify-center px-4 bg-warning/5 border-warning/10">
                        <div className="text-xs font-bold text-warning tabular-nums">
                            {calc.total_units || 0} <span className="text-[9px] opacity-60">UDS</span>
                        </div>
                        <div className="text-[8px] uppercase tracking-tighter opacity-40 font-bold text-warning">Ingreso al Stock</div>
                    </div>
                </div>
            </div>

            {/* FILA 3: Opciones de Catálogo */}
            <div className="pt-2 border-t border-border/10">
                <label className="flex items-center gap-3 cursor-pointer group">
                    <div className="relative">
                        <input
                            type="checkbox"
                            checked={itemForm.update_price}
                            onChange={(e) => setIF("update_price", e.target.checked)}
                            className="peer sr-only"
                        />
                        <div className="w-5 h-5 rounded border-2 border-border/40 peer-checked:border-brand-500 peer-checked:bg-brand-500 transition-all flex items-center justify-center">
                            <svg className="w-3.5 h-3.5 text-black opacity-0 peer-checked:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                    </div>
                    <span className="text-[11px] font-bold text-content-subtle uppercase tracking-tight group-hover:text-brand-500 transition-colors">
                        Sincronizar precio en catálogo
                    </span>
                </label>
            </div>
        </div>
    );
}
