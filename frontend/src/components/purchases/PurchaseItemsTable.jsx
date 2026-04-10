import { fmt2 } from "../../utils/purchaseUtils";

export default function PurchaseItemsTable({ detail }) {
    return (
        <>
            <div className="mb-3 flex items-center gap-3">
                <div className="h-0.5 flex-1 bg-gradient-to-r from-warning/30 to-transparent"></div>
                <div className="text-[11px] font-black text-warning tracking-wide uppercase">
                    Productos Recibidos
                </div>
                <div className="h-0.5 flex-1 bg-gradient-to-l from-warning/30 to-transparent"></div>
            </div>

            <div className="card-premium overflow-hidden mb-12">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-border/40 bg-surface-1 dark:bg-white/5 text-[11px] font-black text-content-subtle dark:text-content-dark-muted uppercase tracking-wide">
                            <th className="px-6 py-4">Producto</th>
                            <th className="px-6 py-4">Paquete</th>
                            <th className="px-6 py-4">Cant.</th>
                            <th className="px-6 py-4">Precio/paq.</th>
                            <th className="px-6 py-4">Costo unit.</th>
                            <th className="px-6 py-4">Margen</th>
                            <th className="px-6 py-4">P. venta</th>
                            <th className="px-6 py-4">Total uds.</th>
                            <th className="px-6 py-4 text-right">Subtotal</th>
                        </tr>
                    </thead>

                    <tbody className="divide-y divide-border/10">
                        {detail.items?.map((item) => (
                            <tr key={item.id} className="hover:bg-surface-2 dark:hover:bg-white/5 transition-colors">
                                <td className="px-6 py-4 font-black text-content dark:text-white uppercase tracking-tight text-xs">
                                    {item.product_name}
                                </td>

                                <td className="px-6 py-4 text-[11px] font-bold text-content-subtle uppercase tracking-wide">
                                    {item.package_unit} <span className="opacity-30">×</span> {item.package_size}
                                </td>

                                <td className="px-6 py-4 text-xs font-bold tabular-nums">
                                    {item.package_qty}
                                </td>

                                <td className="px-6 py-4 text-xs font-black text-info tabular-nums">
                                    ${fmt2(item.package_price)}
                                </td>

                                <td className="px-6 py-4 text-xs font-bold text-content-subtle tabular-nums">
                                    ${fmt2(item.unit_cost)}
                                </td>

                                <td className="px-6 py-4">
                                    <span className="px-2 py-0.5 rounded-lg bg-surface-2 dark:bg-white/5 border border-border/20 text-[11px] font-black text-content-subtle uppercase tabular-nums">
                                        {item.profit_margin}%
                                    </span>
                                </td>

                                <td className="px-6 py-4 text-xs font-black text-success tabular-nums">
                                    ${fmt2(item.sale_price)}
                                </td>

                                <td className="px-6 py-4 text-xs font-bold text-brand-500 tabular-nums">
                                    {item.total_units} <span className="text-[11px] opacity-40 uppercase">u</span>
                                </td>

                                <td className="px-6 py-4 text-right text-sm font-black text-warning tabular-nums font-display">
                                    ${fmt2(item.subtotal)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}
