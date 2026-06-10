import { fmt2 } from "../../utils/purchaseUtils";

export default function PurchaseItemsTable({
    items = [],
    orderStatus = "recibido",
    onUpdate,
    onDelete,
    onEdit,
    invoiceRate = 1,
    invoiceSym = "Ref.",
}) {
    const isEditing   = orderStatus === "borrador" || orderStatus === "pendiente";
    const showLots    = orderStatus !== "borrador";
    const showActions = isEditing;

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[720px]">
                <thead>
                    <tr className="border-b border-border/20 dark:border-white/[0.06] text-[10px] font-black text-content-subtle dark:text-white/30 uppercase tracking-widest">
                        <th className="px-4 py-3">Producto</th>
                        {showLots && <th className="px-4 py-3">Lote / Vence</th>}
                        <th className="px-4 py-3 text-center">Cant.</th>
                        <th className="px-4 py-3 text-right w-36">
                          Costo×Emp.{invoiceRate > 1 ? <span className="ml-1 text-brand-500/70">({invoiceSym})</span> : ""}
                        </th>
                        <th className="px-4 py-3 text-right">C.Unit</th>
                        <th className="px-4 py-3 text-right">P.Venta</th>
                        {!isEditing && <th className="px-4 py-3 text-right">Total Uds.</th>}
                        <th className="px-4 py-3 text-right">Subtotal</th>
                        {showActions && <th className="px-4 py-3 w-20"></th>}
                    </tr>
                </thead>
                <tbody className="divide-y divide-border/10 dark:divide-white/[0.04]">
                    {items.map((item) => (
                        <tr key={item.id ?? item.key} className="hover:bg-surface-2/30 dark:hover:bg-white/[0.02] transition-colors group">

                            {/* Producto + empaque */}
                            <td className="px-4 py-3">
                                <div className="text-xs font-black text-content dark:text-white uppercase tracking-tight">
                                    {item.product_name}
                                </div>
                                <div className="text-[9px] font-medium text-content-subtle dark:text-white/30 uppercase mt-0.5">
                                    {item.package_unit} × {item.package_size}
                                </div>
                            </td>

                            {/* Lote / Vence */}
                            {showLots && (
                                <td className="px-4 py-3">
                                    <div className="text-[10px] font-bold text-warning">{item.lot_number || <span className="opacity-30">S/L</span>}</div>
                                    <div className="text-[9px] text-content-subtle dark:text-white/30">{item.expiration_date || <span className="opacity-30">S/V</span>}</div>
                                </td>
                            )}

                            {/* Cant. */}
                            <td className="px-4 py-3 text-center">
                                {isEditing ? (
                                    <input
                                        type="number" min="1" step="1"
                                        value={item.package_qty}
                                        onChange={e => onUpdate?.(item.id ?? item.key, { package_qty: e.target.value })}
                                        className="w-14 text-center text-xs font-bold tabular-nums bg-transparent border-b border-border/30 dark:border-white/10 focus:border-brand-500 dark:focus:border-brand-500 focus:outline-none text-content dark:text-white [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                    />
                                ) : (
                                    <span className="text-xs font-bold tabular-nums">{item.package_qty}</span>
                                )}
                            </td>

                            {/* Costo × Empaque */}
                            <td className="px-4 py-3 text-right">
                                {isEditing ? (
                                    <div className="flex flex-col items-end gap-0.5">
                                        <input
                                            type="number" min="0" step="0.01"
                                            value={invoiceRate > 1
                                                ? fmt2(parseFloat(item.package_price || 0) * invoiceRate)
                                                : +parseFloat(item.package_price || 0).toFixed(4)}
                                            onChange={e => {
                                                const raw = parseFloat(e.target.value || 0);
                                                onUpdate?.(item.id ?? item.key, { package_price: invoiceRate > 1 ? raw / invoiceRate : e.target.value });
                                            }}
                                            className="w-full p-0 text-right text-xs font-bold tabular-nums bg-transparent border-b border-border/30 dark:border-white/10 focus:border-brand-500 dark:focus:border-brand-500 focus:outline-none text-info [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                        />
                                        {invoiceRate > 1 && parseFloat(item.package_price) > 0 && (
                                            <span className="text-[9px] text-content-subtle/40 dark:text-white/20 tabular-nums">≈ Ref. {fmt2(item.package_price)}</span>
                                        )}
                                    </div>
                                ) : (
                                    <span className="text-xs font-black text-info tabular-nums">Ref. {fmt2(item.package_price)}</span>
                                )}
                            </td>

                            {/* Costo Unitario (siempre computed) */}
                            <td className="px-4 py-3 text-right text-[11px] font-bold tabular-nums text-content-subtle dark:text-white/40">
                                {item.unit_cost > 0 ? `Ref. ${fmt2(item.unit_cost)}` : "—"}
                            </td>

                            {/* Precio Venta — editable + toggle para actualizar el PVP del producto al recibir */}
                            <td className="px-4 py-3 text-right">
                                {isEditing && item.unit_cost > 0 ? (
                                    <div className="flex items-center justify-end gap-2">
                                        <div className={`flex flex-col items-end gap-0.5 ${item.update_price === false ? "opacity-30" : ""}`}>
                                            <input
                                                type="number" min="0" step="0.01"
                                                disabled={item.update_price === false}
                                                value={invoiceRate > 1
                                                    ? fmt2(parseFloat(item.sale_price || 0) * invoiceRate)
                                                    : +parseFloat(item.sale_price || 0).toFixed(4)}
                                                onChange={e => {
                                                    const raw = parseFloat(e.target.value || 0);
                                                    const newPrice = invoiceRate > 1 ? raw / invoiceRate : raw;
                                                    const cost = parseFloat(item.unit_cost) || 0;
                                                    if (cost > 0 && newPrice >= 0) {
                                                        onUpdate?.(item.id ?? item.key, { profit_margin: ((newPrice / cost) - 1) * 100 });
                                                    }
                                                }}
                                                className="w-20 p-0 text-right text-xs font-black tabular-nums bg-transparent border-b border-border/30 dark:border-white/10 focus:border-success dark:focus:border-success focus:outline-none text-success [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                            />
                                            <span className="text-[9px] text-content-subtle/40 dark:text-white/20 tabular-nums">
                                                {invoiceRate > 1 && parseFloat(item.sale_price) > 0
                                                    ? `≈ Ref. ${fmt2(item.sale_price)} · ${(parseFloat(item.profit_margin) || 0).toFixed(1)}% mg`
                                                    : `${(parseFloat(item.profit_margin) || 0).toFixed(1)}% mg`}
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => onUpdate?.(item.id ?? item.key, { update_price: item.update_price === false })}
                                            title={item.update_price === false
                                                ? "NO actualizará el precio de venta del producto al recibir"
                                                : "Actualizará el precio de venta del producto al recibir"}
                                            className={`w-8 h-4.5 rounded-full relative transition-all shrink-0 ${item.update_price === false ? "bg-surface-3 dark:bg-white/10" : "bg-success"}`}
                                            style={{ height: "18px" }}
                                        >
                                            <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-all ${item.update_price === false ? "left-0.5" : "left-[15px]"}`} />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-end gap-0.5">
                                        <span className="text-xs font-black text-success tabular-nums">
                                            {item.sale_price > 0 ? `Ref. ${fmt2(item.sale_price)}` : "—"}
                                        </span>
                                        {item.update_price === false && (
                                            <span className="text-[8px] font-black uppercase tracking-widest text-content-subtle/40">No actualiza PVP</span>
                                        )}
                                    </div>
                                )}
                            </td>

                            {/* Total Uds. (solo no-borrador) */}
                            {!isEditing && (
                                <td className="px-4 py-3 text-right text-xs font-bold text-brand-500 tabular-nums">
                                    {item.total_units} <span className="text-[10px] opacity-40">u</span>
                                </td>
                            )}

                            {/* Subtotal */}
                            <td className="px-4 py-3 text-right">
                                {invoiceRate > 1 && isEditing ? (
                                    <div className="flex flex-col items-end gap-0.5">
                                        <span className="text-sm font-black text-warning tabular-nums">{invoiceSym} {fmt2(parseFloat(item.subtotal) * invoiceRate)}</span>
                                        <span className="text-[9px] text-content-subtle/40 dark:text-white/20 tabular-nums">≈ Ref. {fmt2(item.subtotal)}</span>
                                    </div>
                                ) : (
                                    <span className="text-sm font-black text-warning tabular-nums">Ref. {fmt2(item.subtotal)}</span>
                                )}
                            </td>

                            {/* Acciones (solo borrador) */}
                            {showActions && (
                                <td className="px-4 py-3 text-center">
                                    <div className="flex items-center justify-center gap-1">
                                        <button
                                            onClick={() => onEdit?.(item.id ?? item.key)}
                                            className="w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-brand-500/10 text-brand-500 transition-all active:scale-90"
                                            title="Editar línea"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                            </svg>
                                        </button>
                                        <button
                                            onClick={() => onDelete?.(item.id ?? item.key)}
                                            className="w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-danger/10 text-danger transition-all active:scale-90"
                                            title="Eliminar línea"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                </td>
                            )}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
