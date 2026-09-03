import { fmtBase, resolveImageUrl, imgRetryOnError } from "../../helpers";
import { useApp } from "../../context/AppContext";

export default function ProductTable({
    products, canEditProducts, canDeleteProducts, openEditProduct, setDeleteProductDialog,
    selectedProducts = [], onToggleSelect, onSelectAll, isSelectionMode = false,
    priceCurrency = "base", localCurrency = null, onToggleVisible, catalogEnabled = false
}) {
    const { baseCurrency } = useApp();
    const fmtPrice = (n) => {
        if (priceCurrency === "local" && localCurrency) {
            return fmtBase(parseFloat(n) * parseFloat(localCurrency.exchange_rate), localCurrency);
        }
        return fmtBase(n, baseCurrency);
    };

    const allSelected = products.length > 0 && products.every(p => selectedProducts.includes(p.id));

    return (
        <table className="table-pos min-w-[720px]">
            <thead>
                <tr>
                    {isSelectionMode && (
                        <th className="w-10">
                            <input
                                type="checkbox"
                                checked={allSelected}
                                onChange={onSelectAll}
                                className="w-4 h-4 rounded border-border/40 bg-white/5 text-brand-500 focus:ring-brand-500/20"
                            />
                        </th>
                    )}
                    <th className="w-12" />
                    <th className="text-left">Producto</th>
                    <th className="text-left">Categoría</th>
                    <th className="text-center">Stock</th>
                    <th className="text-right">Precio</th>
                    {canEditProducts && catalogEnabled && <th className="text-center w-[90px]">Público</th>}
                    <th className="text-right w-[140px] pr-6">Acciones</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-border/10 dark:divide-white/5">
                {products.map(p => (
                    <tr key={p.id} className="group transition-all hover:bg-brand-500/[0.02]">
                        {isSelectionMode && (
                            <td className="text-center">
                                <input
                                    type="checkbox"
                                    checked={selectedProducts.includes(p.id)}
                                    onChange={() => onToggleSelect(p.id)}
                                    className="w-4 h-4 rounded border-border/40 bg-white/5 text-brand-500 focus:ring-brand-500/20"
                                />
                            </td>
                        )}
                        <td>
                            <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center text-[11px] font-black border border-white/5 overflow-hidden">
                                {p.image_url
                                    ? <img src={resolveImageUrl(p.image_url)} className="w-full h-full object-cover" onError={imgRetryOnError} />
                                    : p.name.charAt(0)}
                            </div>
                        </td>
                        <td>
                            <div className="flex items-center gap-2">
                                <div className="text-xs font-bold text-content dark:text-white uppercase tracking-tight group-hover:text-brand-500 transition-colors">
                                    {p.name}
                                </div>
                                {p.is_combo && (
                                    <span className="text-[9px] bg-brand-500/10 text-brand-500 border border-brand-500/20 px-1.5 py-0.5 rounded uppercase font-bold tracking-wide whitespace-nowrap">
                                        Combo
                                    </span>
                                )}
                                {p.is_service && (
                                    <span className="text-[9px] bg-blue-500/10 text-blue-500 border border-blue-500/20 px-1.5 py-0.5 rounded uppercase font-bold tracking-wide whitespace-nowrap">
                                        Servicio
                                    </span>
                                )}
                            </div>
                        </td>
                        <td>
                            <span className="text-[10px] font-bold text-content-subtle uppercase tracking-wide">
                                {p.category_name || "General"}
                            </span>
                        </td>
                        <td className="text-center">
                            {p.is_service ? (
                                <span className="text-xs font-bold text-content-subtle">—</span>
                            ) : (
                                <>
                                    <span className={`text-xs font-bold tabular-nums ${
                                        parseFloat(p.warehouse_stock ?? p.stock) <= 0
                                            ? "text-danger"
                                            : parseFloat(p.warehouse_stock ?? p.stock) <= 5
                                            ? "text-warning"
                                            : "text-success"
                                    }`}>
                                        {p.warehouse_stock ?? p.stock}
                                    </span>
                                    <span className="ml-1 text-[9px] font-bold text-content-subtle uppercase">{p.unit || "uds"}</span>
                                </>
                            )}
                        </td>
                        <td className="text-right">
                            {/* Mismo criterio que en las tarjetas: el insumo no tiene precio
                                de venta, así que se muestra su costo en vez de un 0. */}
                            {p.sellable === false ? (
                                <span className="text-xs font-bold text-content-subtle dark:text-white/40 tabular-nums tracking-tighter">
                                    {parseFloat(p.cost_price) > 0 ? <>Costo {fmtPrice(p.cost_price)}</> : "—"}
                                </span>
                            ) : (
                                <span className="text-xs font-bold text-brand-500 tabular-nums tracking-tighter">
                                    {fmtPrice(p.price)}
                                </span>
                            )}
                        </td>
                        {/* Visibilidad en el catálogo público: interruptor directo en la
                            fila. Repasar qué se publica y qué no es una pasada sobre la
                            lista completa, no una visita al modal de cada producto. */}
                        {canEditProducts && catalogEnabled && (
                            <td className="text-center">
                                {/* Un insumo no se publica, así que en vez del interruptor
                                    —que el servidor rechazaría— la fila dice por qué. */}
                                {p.sellable === false ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-warning/15 text-warning border border-warning/30 text-[9px] font-black uppercase tracking-wide"
                                        title="Insumo: no se vende en caja ni se publica">
                                        Insumo
                                    </span>
                                ) : (
                                    <label className="relative inline-flex items-center cursor-pointer align-middle"
                                        title={p.visible_in_catalog ? "Visible en el catálogo público" : "Oculto del catálogo público"}>
                                        <input
                                            type="checkbox"
                                            className="sr-only peer"
                                            checked={!!p.visible_in_catalog}
                                            onChange={() => onToggleVisible?.(p)}
                                        />
                                        <div className="w-9 h-5 bg-border/50 dark:bg-white/10 rounded-full peer peer-focus:outline-none peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-500" />
                                    </label>
                                )}
                            </td>
                        )}
                        <td className="text-right pr-6">
                            <div className="flex justify-end gap-1">
                                {/* Editar y eliminar son permisos distintos: quitarle a un rol
                                    la facultad de borrar no debe dejarle el botón a la vista
                                    para que el servidor se lo rechace después. */}
                                {canEditProducts && (
                                    <button onClick={() => openEditProduct(p)}
                                        className="p-2 hover:bg-warning/10 rounded-xl transition-all text-content-subtle hover:text-warning active:scale-90"
                                        title="Editar">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                    </button>
                                )}
                                {canDeleteProducts && (
                                    <button onClick={() => setDeleteProductDialog(p.id)}
                                        className="p-2 hover:bg-danger/10 rounded-xl transition-all text-content-subtle hover:text-danger active:scale-90"
                                        title="Eliminar">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    </button>
                                )}
                            </div>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}