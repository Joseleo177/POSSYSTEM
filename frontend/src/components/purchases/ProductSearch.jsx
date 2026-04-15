import { fmt2 } from "../../helpers";
import { PKG_UNITS } from "../../constants/pkg";

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
        <div className="card overflow-visible card-md mb-3">
            <div className="text-[11px] font-bold text-content-muted dark:text-content-dark-muted tracking-wide mb-2">
                + AGREGAR PRODUCTO AL RECIBO
            </div>

            {/* Buscador */}
            <div className="mb-2 relative z-[40]">
                <label className="label">Buscar producto</label>

                {itemForm.product ? (
                    <div className="flex items-center gap-2 bg-info/10 border border-info/30 rounded-lg p-3">
                        <div className="flex-1">
                            <div className="text-sm font-bold text-info">
                                {itemForm.product.name}
                            </div>
                            <div className="text-[11px] text-info/80 font-bold tracking-wider uppercase mt-1">
                                Stock actual: {itemForm.product.stock} {itemForm.product.unit}
                            </div>
                        </div>

                        <button
                            onClick={() => setIF("product", null)}
                            className="btn-sm btn-danger rounded-lg px-4"
                        >
                            ✕ Quitar
                        </button>
                    </div>
                ) : (
                    <>
                        <input
                            spellCheck={false}
                            autoComplete="off"
                            value={productSearch}
                            onChange={e => setProductSearch(e.target.value)}
                            placeholder="Escribe para buscar un producto..."
                            className="input"
                        />

                        {searching && (
                            <div className="text-[11px] text-content-muted dark:text-content-dark-muted mt-2 ml-1">
                                Buscando productos...
                            </div>
                        )}

                        {productSearch.trim().length > 0 && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-surface-2 dark:bg-surface-dark-2 border border-border dark:border-border-dark rounded-lg z-20 shadow-2xl max-h-48 overflow-y-auto">

                                {productResults.map(p => (
                                    <div
                                        key={p.id}
                                        onClick={() => selectProduct(p)}
                                        className="px-4 py-3 cursor-pointer border-b border-border/50 dark:border-border-dark/50 text-sm hover:bg-surface-3 dark:hover:bg-surface-dark-3 transition-colors"
                                    >
                                        <div className="font-bold text-content dark:text-content-dark">
                                            {p.name}
                                        </div>

                                        <div className="text-[11px] text-content-muted dark:text-content-dark-muted mt-0.5">
                                            Stock: {p.stock} {p.unit}
                                            {p.package_unit && ` · Paquete: ${p.package_unit} x${p.package_size}`}
                                            {p.cost_price && ` · Costo: $${fmt2(p.cost_price)}`}
                                        </div>
                                    </div>
                                ))}

                                <div
                                    onClick={() => openCreateProduct(productSearch)}
                                    className={`px-4 py-3 cursor-pointer text-sm font-bold text-warning flex items-center gap-2 hover:bg-surface-3 dark:hover:bg-surface-dark-3 transition-colors ${productResults.length > 0
                                        ? "border-t border-border dark:border-border-dark"
                                        : ""
                                        }`}
                                >
                                    <span className="text-lg bg-warning/10 text-warning w-6 h-6 flex items-center justify-center rounded-md">
                                        +
                                    </span>
                                    Crear "{productSearch}"
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Campos del item */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
                <div>
                    <label className="label">Tipo de paquete</label>
                    <input
                        list="pkg-list"
                        value={itemForm.package_unit}
                        onChange={e => setIF("package_unit", e.target.value)}
                        placeholder="caja, bulto..."
                        className="input"
                    />
                    <datalist id="pkg-list">
                        {PKG_UNITS.map(u => (
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
                        onChange={e => setIF("package_size", e.target.value)}
                        disabled={itemForm.package_unit?.toLowerCase() === "unidad"}
                        placeholder={
                            itemForm.package_unit?.toLowerCase() === "unidad" ? "1" : "ej. 12"
                        }
                        className={`input text-center transition-all ${itemForm.package_unit?.toLowerCase() === "unidad"
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
                        onChange={e => setIF("package_qty", e.target.value)}
                        className="input text-center"
                    />
                </div>

                <div>
                    <label className="label">Precio por paquete ($)</label>
                    <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={itemForm.package_price}
                        onChange={e => setIF("package_price", e.target.value)}
                        placeholder="0.00"
                        className="input text-center"
                    />
                </div>
            </div>

            {/* Cálculos */}

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
                <div className="flex flex-col justify-center">
                    <label className="label">Margen de ganancia (%)</label>
                    <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={itemForm.profit_margin}
                        onChange={e => setIF("profit_margin", e.target.value)}
                        className="input text-center items-center justify-center"
                    />
                </div>

                <div className="flex flex-col justify-center">
                    <label className="label">Costo unitario (calc.)</label>
                    <div
                        className={`input text-center flex items-center justify-center bg-surface-3 dark:bg-surface-dark-3 ${calc?.unit_cost
                            ? "text-info"
                            : "text-content-muted dark:text-content-dark-muted"
                            }`}
                    >
                        {calc?.unit_cost ? `$${fmt2(calc.unit_cost)}` : "—"}
                    </div>
                </div>

                <div className="flex flex-col justify-center">
                    <label className="label">Precio de venta (calc.)</label>
                    <div
                        className={`input text-center flex items-center justify-center bg-surface-3 dark:bg-surface-dark-3 font-bold ${calc?.sale_price
                            ? "text-success"
                            : "text-content-muted dark:text-content-dark-muted"
                            }`}
                    >
                        {calc?.sale_price ? `$${fmt2(calc.sale_price)}` : "—"}
                    </div>
                </div>

                <div className="flex flex-col justify-center">
                    <label className="label">Total unidades (calc.)</label>
                    <div
                        className={`input text-center flex items-center justify-center bg-surface-3 dark:bg-surface-dark-3 ${calc?.total_units
                            ? "text-warning"
                            : "text-content-muted dark:text-content-dark-muted"
                            }`}
                    >
                        {calc?.total_units ? calc.total_units : "—"}
                    </div>
                </div>
            </div>

            {/* Lotes y Vencimiento */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                        <label className="label">Número de lote</label>
                        <span className="text-[10px] font-black uppercase text-warning tracking-widest">requerido</span>
                    </div>
                    <input
                        type="text"
                        value={itemForm.lot_number || ""}
                        onChange={e => setIF("lot_number", e.target.value)}
                        placeholder="Ej. L-2024-001"
                        className="input"
                    />
                </div>
                <div className="space-y-2">
                    <label className="label">Fecha de vencimiento</label>
                    <input
                        type="date"
                        value={itemForm.expiration_date || ""}
                        onChange={e => setIF("expiration_date", e.target.value)}
                        className="input"
                    />
                </div>
            </div>

            {/* Acciones */}
            <div className="border-t border-border dark:border-border-dark pt-4 mb-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <label className="flex items-center gap-2 cursor-pointer text-xs">
                        <input
                            type="checkbox"
                            checked={itemForm.update_price}
                            onChange={e => setIF("update_price", e.target.checked)}
                            className="w-3.5 h-3.5 accent-warning"
                        />
                        <span className="text-content dark:text-content-dark">
                            Actualizar precio de venta del producto al guardar
                        </span>
                        {calc?.sale_price > 0 && (
                            <span className="text-success text-[11px]">
                                → quedará en ${fmt2(calc.sale_price)}
                            </span>
                        )}
                    </label>
                    <button onClick={addItem} className="btn-sm btn-success w-full sm:w-auto">
                        + Agregar al recibo
                    </button>
                </div>
            </div>

            {/* Lista de items */}
            {items.length > 0 && (
                <div className="card card-md mb-3">
                    <div className="text-[11px] font-bold text-content-muted dark:text-content-dark-muted tracking-wide mb-3">
                        PRODUCTOS EN ESTE RECIBO
                    </div>

                    <table className="table-pos text-xs">
                        <thead>
                            <tr>
                                {[
                                    "Producto",
                                    "Lote / Vence",
                                    "Paquete",
                                    "Cant.",
                                    "P.Venta",
                                    "Total uds.",
                                    "Subtotal",
                                    "",
                                ].map(h => (
                                    <th key={h}>{h}</th>
                                ))}
                            </tr>
                        </thead>

                        <tbody>
                            {items.map(item => (
                                <tr key={item.key}>
                                    <td className="font-bold text-content dark:text-content-dark">
                                        {item.product?.name}
                                    </td>

                                    <td className="text-[10px] font-black uppercase tracking-tight">
                                        <div className="text-warning">L: {item.lot_number || "S/L"}</div>
                                        <div className="opacity-50">{item.expiration_date || "S/V"}</div>
                                    </td>

                                    <td className="text-content-muted dark:text-content-dark-muted">
                                        {item.package_unit} ×{" "}
                                        {item.package_unit?.toLowerCase() === "unidad"
                                            ? "1"
                                            : item.package_size}
                                    </td>

                                    <td className="text-content dark:text-content-dark">
                                        {item.package_qty}
                                    </td>

                                    <td className="text-success font-bold">
                                        ${fmt2(item.sale_price)}
                                    </td>

                                    <td className="text-content dark:text-content-dark">
                                        {item.total_units}
                                    </td>

                                    <td className="text-warning font-bold">
                                        ${fmt2(item.subtotal)}
                                    </td>

                                    <td>
                                        <button
                                            onClick={() => removeItem(item.key)}
                                            className="btn-sm btn-danger"
                                        >
                                            ✕
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {/* Totales */}
                    <div className="flex justify-end items-center gap-3 mt-4 pt-3 border-t border-border dark:border-border-dark">
                        <div>
                            <span className="text-[11px] text-content-muted dark:text-content-dark-muted tracking-wide">
                                TOTAL COMPRA:{" "}
                            </span>
                            <span className="text-xl font-bold text-warning">
                                ${fmt2(grandTotal)}
                            </span>
                        </div>

                        <button
                            onClick={savePurchase}
                            disabled={loading || !selectedWarehouseId}
                            className={`btn-md ${loading || !selectedWarehouseId
                                ? "btn-secondary opacity-60 cursor-not-allowed"
                                : "btn-primary"
                                }`}
                        >
                            {loading
                                ? "Guardando..."
                                : !selectedWarehouseId
                                    ? "Selecciona almacén"
                                    : "Guardar recibo de compra"}
                        </button>
                    </div>
                </div>
            )}

            {items.length === 0 && (
                <div className="text-center py-8 text-xs text-content-muted dark:text-content-dark-muted">
                    Agrega al menos un producto al recibo para poder guardarlo.
                </div>
            )}
        </div>
    );
}