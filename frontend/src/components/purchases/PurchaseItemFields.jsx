import { fmt2 } from "../../utils/purchaseUtils";

export default function PurchaseItemFields({ state }) {
    const {
        itemForm,
        setIF,
        calcItem,
        PKG_UNITS,
    } = state;

    const calc = calcItem(itemForm);

    return (
        <>
            {/* FILA 1 */}
            <div className="grid grid-cols-4 gap-2.5 mb-2.5">
                <div>
                    <label className="label">Tipo de paquete</label>
                    <input
                        list="pkg-list"
                        value={itemForm.package_unit}
                        onChange={(e) => setIF("package_unit", e.target.value)}
                        placeholder="caja, bulto..."
                        className="input"
                    />
                    <datalist id="pkg-list">
                        {PKG_UNITS.map((u) => (
                            <option key={u} value={u} />
                        ))}
                    </datalist>
                </div>

                <div>
                    <label className="label">Unidades por paquete</label>
                    <input
                        type="number"
                        min="1"
                        step="1"
                        value={itemForm.package_size}
                        onChange={(e) => setIF("package_size", e.target.value)}
                        disabled={itemForm.package_unit?.toLowerCase() === "unidad"}
                        placeholder={
                            itemForm.package_unit?.toLowerCase() === "unidad" ? "1" : "ej. 12"
                        }
                        className={`input transition-all ${itemForm.package_unit?.toLowerCase() === "unidad"
                                ? "bg-surface-2 dark:bg-surface-dark-3 opacity-50 cursor-not-allowed"
                                : ""
                            }`}
                    />
                </div>

                <div>
                    <label className="label">Cantidad de paquetes</label>
                    <input
                        type="number"
                        min="1"
                        step="1"
                        value={itemForm.package_qty}
                        onChange={(e) => setIF("package_qty", e.target.value)}
                        className="input"
                    />
                </div>

                <div>
                    <label className="label">Precio por paquete ($)</label>
                    <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={itemForm.package_price}
                        onChange={(e) => setIF("package_price", e.target.value)}
                        placeholder="0.00"
                        className="input"
                    />
                </div>
            </div>

            {/* FILA 2 */}
            <div className="grid grid-cols-4 gap-2.5 mb-2">
                <div>
                    <label className="label">Margen de ganancia (%)</label>
                    <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={itemForm.profit_margin}
                        onChange={(e) => setIF("profit_margin", e.target.value)}
                        className="input"
                    />
                </div>

                <div>
                    <label className="label">Costo unitario (calc.)</label>
                    <div
                        className={`input bg-surface-3 dark:bg-surface-dark-3 ${calc.unit_cost
                                ? "text-info"
                                : "text-content-muted dark:text-content-dark-muted"
                            }`}
                    >
                        {calc.unit_cost ? `$${fmt2(calc.unit_cost)}` : "—"}
                    </div>
                </div>

                <div>
                    <label className="label">Precio de venta (calc.)</label>
                    <div
                        className={`input bg-surface-3 dark:bg-surface-dark-3 font-bold ${calc.sale_price
                                ? "text-success"
                                : "text-content-muted dark:text-content-dark-muted"
                            }`}
                    >
                        {calc.sale_price ? `$${fmt2(calc.sale_price)}` : "—"}
                    </div>
                </div>

                <div>
                    <label className="label">Total unidades (calc.)</label>
                    <div
                        className={`input bg-surface-3 dark:bg-surface-dark-3 ${calc.total_units
                                ? "text-warning"
                                : "text-content-muted dark:text-content-dark-muted"
                            }`}
                    >
                        {calc.total_units ? calc.total_units : "—"}
                    </div>
                </div>
            </div>

            {/* CHECKBOX */}
            <div className="flex items-center gap-2.5 mb-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs">
                    <input
                        type="checkbox"
                        checked={itemForm.update_price}
                        onChange={(e) => setIF("update_price", e.target.checked)}
                        className="w-3.5 h-3.5 accent-warning"
                    />
                    <span className="text-content dark:text-content-dark">
                        Actualizar precio de venta del producto al guardar
                    </span>

                    {calc.sale_price > 0 && (
                        <span className="text-success text-[11px]">
                            → quedará en ${fmt2(calc.sale_price)}
                        </span>
                    )}
                </label>
            </div>
        </>
    );
}
