import { fmt2 } from "../../utils/purchaseUtils";

export default function PurchaseItemsList({ state }) {
    const {
        items,
        removeItem,
        grandTotal,
        savePurchase,
        loading,
        selectedWarehouseId,
    } = state;

    if (items.length === 0) {
        return (
            <div className="text-center py-8 text-xs text-content-muted dark:text-content-dark-muted">
                Agrega al menos un producto al recibo para poder guardarlo.
            </div>
        );
    }

    return (
        <div className="card card-md mb-3">
            <div className="text-[11px] font-bold text-content-muted dark:text-content-dark-muted tracking-wide mb-3">
                PRODUCTOS EN ESTE RECIBO
            </div>

            <table className="table-pos text-xs">
                <thead>
                    <tr>
                        {[
                            "Producto",
                            "Paquete",
                            "Cant.",
                            "Precio/paq.",
                            "Costo unit.",
                            "Margen",
                            "P. venta",
                            "Total uds.",
                            "Subtotal",
                            "",
                        ].map((h) => (
                            <th key={h}>{h}</th>
                        ))}
                    </tr>
                </thead>

                <tbody>
                    {items.map((item) => (
                        <tr key={item.key}>
                            <td className="font-bold text-content dark:text-content-dark">
                                {item.product?.name}
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

                            <td className="text-info">${fmt2(item.package_price)}</td>

                            <td className="text-content-muted dark:text-content-dark-muted">
                                ${fmt2(item.unit_cost)}
                            </td>

                            <td className="text-content-muted dark:text-content-dark-muted">
                                {item.profit_margin}%
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

            {/* TOTAL */}
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
    );
}
