import { fmt2 } from "../../utils/purchaseUtils";
import { fmtQty, toNameCase } from "../../helpers";
import { fmtDateShort } from "../../helpers/dates";
import { isIntegerUnit, fmtQtyUnit } from "../../helpers/unitFormatter";
import EditablePriceInput from "../ui/EditablePriceInput";

// Líneas de una compra. Las cifras van en tinta: antes cada columna tenía su color (costo
// azul, precio verde, subtotal naranja, unidades cian) y la tabla se leía como un semáforo
// sin que ningún color avisara de nada. Aquí el color queda para lo que pide atención: una
// línea a medio recibir o un lote por vencer.
export default function PurchaseItemsTable({
    items = [],
    orderStatus = "recibido",
    onUpdate,
    onDelete,
    onEdit,
    invoiceRate = 1,
    invoiceSym = "Ref.",
    // Con el modo recepción prendido la orden puede seguir en borrador y aun así estar
    // metiendo mercancía: ahí el lote sí se está cargando y la columna tiene que verse.
    forceLots = false,
}) {
    // 'parcial' es una orden abierta con mercancía ya adentro: se sigue editando, con el
    // límite de que una línea no puede bajar de lo que ya entró (lo valida el backend).
    const isEditing = ["borrador", "pendiente", "parcial"].includes(orderStatus);
    const showLots = (orderStatus !== "borrador" || forceLots) && (isEditing || items.some(i => i.lot_number || i.expiration_date));
    const showActions = isEditing;
    // Con el modo recepción una línea puede estar a medio entrar. Solo se muestra la columna
    // cuando de verdad hay algo recibido y no todo: en una compra normal sería ruido.
    const showRecibido = items.some(i => parseFloat(i.received_units || 0) > 0)
        && (isEditing || items.some(i => parseFloat(i.received_units || 0) < parseFloat(i.total_units || 0) - 1e-6));
    const enMoneda = invoiceRate > 1;

    // Campo editable con caja, como cualquier input de la app. Antes eran cifras sueltas con
    // una raya debajo y no se distinguía qué se podía escribir y qué era un dato calculado.
    const FIELD = "w-full h-9 px-2.5 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-right text-[13px] font-semibold tabular-nums text-content dark:text-white focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:opacity-40 transition-colors";
    const Prefijo = ({ children }) => (
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] text-content-subtle pointer-events-none">{children}</span>
    );

    const totalSubtotal = items.reduce((s, i) => s + (parseFloat(i.subtotal) || 0), 0);
    const unidadComun = items.length && items.every(i => (i.unit ?? i.product?.unit ?? "") === (items[0].unit ?? items[0].product?.unit ?? ""))
        ? (items[0].unit ?? items[0].product?.unit) : null;
    const totalUnidades = items.reduce((s, i) => s + (parseFloat(i.total_units) || 0), 0);

    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const diasPara = (d) => d ? Math.round((new Date(`${d}T00:00:00`) - hoy) / 86400000) : null;

    return (
        <>
        {/* Teléfono, compra cerrada: una tarjeta por línea. La tabla de ocho columnas se
            salía de la pantalla y obligaba a desplazarse de lado para ver el subtotal.
            Al editar se mantiene la tabla: los campos necesitan sus columnas. */}
        {!isEditing && (
            <div className="md:hidden border-t border-border/60 dark:border-white/[0.06] divide-y divide-border/50 dark:divide-white/[0.04]">
                {items.map(item => {
                    const itemUnit = item.unit ?? item.product?.unit;
                    const margen = parseFloat(item.profit_margin);
                    return (
                        <div key={item.id ?? item.key} className="px-5 py-3">
                            <div className="flex items-baseline justify-between gap-3">
                                <span className="text-[14px] font-semibold text-content dark:text-white truncate">{item.product_name}</span>
                                <span className="text-[14px] font-semibold text-content dark:text-white tabular-nums whitespace-nowrap">
                                    {enMoneda ? `${invoiceSym} ${fmt2(parseFloat(item.subtotal) * invoiceRate)}` : `Ref. ${fmt2(item.subtotal)}`}
                                </span>
                            </div>
                            <div className="text-[12px] text-content-subtle mt-0.5">
                                {fmtQty(item.package_qty)} × {toNameCase(item.package_unit || "unidad")} de {fmtQty(item.package_size)}
                                {parseFloat(item.total_units) > 0 && <> · {fmtQtyUnit(item.total_units, itemUnit).toLowerCase()}</>}
                            </div>
                            <div className="text-[12px] text-content-subtle tabular-nums mt-0.5">
                                Costo Ref. {fmt2(item.package_price)} · unitario Ref. {fmt2(item.unit_cost)}
                                {item.sale_price > 0 && item.update_price !== false && <> · venta Ref. {fmt2(item.sale_price)}{!isNaN(margen) ? ` (${margen.toFixed(0)} %)` : ""}</>}
                            </div>
                            {(item.lot_number || item.expiration_date) && (
                                <div className="text-[12px] text-content-subtle mt-0.5">
                                    Lote {item.lot_number || "sin número"}{item.expiration_date ? ` · vence ${fmtDateShort(item.expiration_date)}` : ""}
                                </div>
                            )}
                        </div>
                    );
                })}
                <div className="px-5 py-3 flex items-center justify-between bg-surface-2 dark:bg-white/[0.02]">
                    <span className="text-[13px] text-content-subtle">Total</span>
                    <span className="text-[15px] font-bold text-content dark:text-white tabular-nums">
                        {enMoneda ? `${invoiceSym} ${fmt2(totalSubtotal * invoiceRate)}` : `Ref. ${fmt2(totalSubtotal)}`}
                    </span>
                </div>
            </div>
        )}
        {/* Teléfono, orden editable: tarjeta por línea con sus campos en dos columnas. La
            tabla de ocho columnas obligaba a desplazarse de lado para llegar al costo. */}
        {isEditing && (
            <div className="md:hidden border-t border-border/60 dark:border-white/[0.06] divide-y divide-border/50 dark:divide-white/[0.04]">
                {items.map(item => {
                    const itemUnit = item.unit ?? item.product?.unit;
                    const qtyIsInteger = isIntegerUnit(itemUnit);
                    const insumo = item.product?.sellable === false || item.sellable === false;
                    const actualiza = item.update_price !== false;
                    const margen = parseFloat(item.profit_margin);
                    const uid = item.id ?? item.key;
                    return (
                        <div key={uid} className="px-4 py-3.5 space-y-3">
                            <div className="flex items-start gap-2">
                                <div className="min-w-0 flex-1">
                                    <div className="text-[14px] font-semibold text-content dark:text-white truncate">{item.product_name}</div>
                                    <div className="text-[12px] text-content-subtle">
                                        {toNameCase(item.package_unit || "unidad")} de {fmtQty(item.package_size)}
                                        {parseFloat(item.total_units) > 0 && <> · {fmtQtyUnit(item.total_units, itemUnit).toLowerCase()}</>}
                                    </div>
                                </div>
                                <button onClick={() => onEdit?.(uid)} className="row-icon" title="Editar línea" aria-label="Editar línea">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                </button>
                                <button onClick={() => onDelete?.(uid)} className="row-icon hover:!text-red-600 hover:!bg-red-500/10 dark:hover:!text-red-400" title="Quitar línea" aria-label="Quitar línea">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                            </div>
                            <div className="grid grid-cols-2 gap-2.5">
                                <label className="block">
                                    <span className="block text-[12px] text-content-subtle mb-1">Cantidad</span>
                                    <EditablePriceInput
                                        value={parseFloat(item.package_qty) || 0}
                                        decimals={qtyIsInteger ? 0 : 3}
                                        integer={qtyIsInteger}
                                        onChange={raw => onUpdate?.(uid, { package_qty: raw })}
                                        className={`${FIELD} !h-10`}
                                    />
                                </label>
                                <label className="block">
                                    <span className="block text-[12px] text-content-subtle mb-1">Costo por {toNameCase(item.package_unit || "unidad").toLowerCase()}</span>
                                    <div className="relative">
                                        <Prefijo>{enMoneda ? invoiceSym : "Ref."}</Prefijo>
                                        <EditablePriceInput
                                            value={enMoneda ? parseFloat(item.package_price || 0) * invoiceRate : parseFloat(item.package_price || 0)}
                                            decimals={enMoneda ? 2 : 5}
                                            onChange={raw => {
                                                const num = parseFloat(raw) || 0;
                                                onUpdate?.(uid, { package_price: enMoneda ? num / invoiceRate : raw });
                                            }}
                                            className={`${FIELD} !h-10 pl-10`}
                                        />
                                    </div>
                                </label>
                            </div>
                            <div className="flex items-end justify-between gap-3">
                                {!insumo && item.unit_cost > 0 ? (
                                    <div className="min-w-0">
                                        <span className="block text-[12px] text-content-subtle mb-1">Precio de venta</span>
                                        <div className="relative w-36">
                                            <Prefijo>{enMoneda ? invoiceSym : "Ref."}</Prefijo>
                                            <EditablePriceInput
                                                disabled={!actualiza}
                                                value={enMoneda ? parseFloat(item.sale_price || 0) * invoiceRate : parseFloat(item.sale_price || 0)}
                                                decimals={enMoneda ? 2 : 5}
                                                onChange={raw => {
                                                    const num = parseFloat(raw) || 0;
                                                    const newPrice = enMoneda ? num / invoiceRate : num;
                                                    const cost = parseFloat(item.unit_cost) || 0;
                                                    if (cost > 0 && newPrice >= 0) onUpdate?.(uid, { profit_margin: ((newPrice / cost) - 1) * 100 });
                                                }}
                                                className={`${FIELD} !h-10 pl-10`}
                                            />
                                        </div>
                                        <button type="button" onClick={() => onUpdate?.(uid, { update_price: !actualiza })} aria-pressed={actualiza}
                                            className="mt-1.5 inline-flex items-center gap-1.5 text-[12px] text-content-subtle">
                                            <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${actualiza ? "bg-brand-500 border-brand-500 text-white" : "border-border dark:border-white/25"}`}>
                                                {actualiza && <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" /></svg>}
                                            </span>
                                            {actualiza ? `Actualiza · margen ${(margen || 0).toLocaleString("es-VE", { maximumFractionDigits: 1 })} %` : "No cambia el precio"}
                                        </button>
                                    </div>
                                ) : <span className="text-[12px] text-content-subtle">{insumo ? "Insumo: sin precio de venta" : ""}</span>}
                                <div className="text-right shrink-0">
                                    <span className="block text-[12px] text-content-subtle">Subtotal</span>
                                    <span className="text-[15px] font-semibold text-content dark:text-white tabular-nums">
                                        {enMoneda ? `${invoiceSym} ${fmt2(parseFloat(item.subtotal) * invoiceRate)}` : `Ref. ${fmt2(item.subtotal)}`}
                                    </span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        )}
        <div className="overflow-x-auto hidden md:block">
            <table className={`table-ledger ${isEditing ? "min-w-[920px]" : "min-w-[760px]"}`}>
                <thead>
                    <tr>
                        <th className="pl-5">Producto</th>
                        {showLots && <th className="w-[150px]">Lote</th>}
                        {/* Aquí el rótulo no puede nombrar la presentación —cada línea puede traer
                            una distinta—, así que dice de qué es la cantidad. */}
                        <th className="text-right w-[110px]">Cantidad</th>
                        {showRecibido && <th className="text-center w-[120px]">En stock</th>}
                        <th className={`text-right whitespace-nowrap ${isEditing ? "w-36" : "w-[130px]"}`} title="Costo de cada presentación (bulto, caja…)">
                            Costo{enMoneda ? ` (${invoiceSym})` : ""}
                        </th>
                        <th className="text-right whitespace-nowrap w-[110px]">Unitario</th>
                        <th className={`text-right whitespace-nowrap ${isEditing ? "w-40" : "w-[130px]"}`}>Precio venta</th>
                        <th className={`text-right w-[130px] ${showActions ? "" : "pr-5"}`}>Subtotal</th>
                        {showActions && <th className="w-[84px] pr-5"></th>}
                    </tr>
                </thead>
                <tbody>
                    {items.map((item) => {
                        // El unit puede venir plano (backend) o anidado en .product (ítem agregado en esta sesión, aún sin guardar)
                        const itemUnit = item.unit ?? item.product?.unit;
                        const qtyIsInteger = isIntegerUnit(itemUnit);
                        const insumo = item.product?.sellable === false || item.sellable === false;
                        const margen = parseFloat(item.profit_margin);
                        const dias = diasPara(item.expiration_date);
                        return (
                        <tr key={item.id ?? item.key} className={isEditing ? "[&>td]:!align-top [&>td]:!h-auto [&>td]:!py-3" : undefined}>

                            {/* Producto + empaque */}
                            <td className={`pl-5 max-w-0 ${isEditing ? "!pt-[19px]" : ""}`}>
                                <div className="text-[13px] font-semibold text-content dark:text-white truncate" title={item.product_name}>
                                    {item.product_name}
                                </div>
                                <div className="text-[12px] text-content-subtle truncate">
                                    {toNameCase(item.package_unit || "unidad")} de {fmtQty(item.package_size)}
                                    {!isEditing && parseFloat(item.total_units) > 0 && <> · {fmtQtyUnit(item.total_units, itemUnit).toLowerCase()}</>}
                                </div>
                            </td>

                            {/* Lote / vence: el color solo si está vencido o por vencer. */}
                            {showLots && (
                                <td>
                                    {item.lot_number || item.expiration_date ? (
                                        <>
                                            <div className="text-[13px] text-content dark:text-white truncate">{item.lot_number || "Sin número"}</div>
                                            <div className={`text-[12px] tabular-nums ${dias != null && dias < 0 ? "text-red-600 dark:text-red-400 font-medium"
                                                : dias != null && dias <= 30 ? "text-amber-700 dark:text-amber-400 font-medium" : "text-content-subtle"}`}>
                                                {item.expiration_date ? `Vence ${fmtDateShort(item.expiration_date)}` : "Sin vencimiento"}
                                            </div>
                                        </>
                                    ) : (
                                        <span className="text-[12px] text-content-subtle">Sin lote</span>
                                    )}
                                </td>
                            )}

                            {/* Cantidad */}
                            <td className="text-right">
                                {isEditing ? (
                                    <div className="flex flex-col items-end gap-1">
                                        <div className="w-20">
                                            <EditablePriceInput
                                                value={parseFloat(item.package_qty) || 0}
                                                decimals={qtyIsInteger ? 0 : 3}
                                                integer={qtyIsInteger}
                                                onChange={raw => onUpdate?.(item.id ?? item.key, { package_qty: raw })}
                                                className={FIELD}
                                            />
                                        </div>
                                        {/* Lo que suma al stock: 2 bultos de 24 son 48 unidades. */}
                                        <span className="text-[12px] text-content-subtle whitespace-nowrap tabular-nums">
                                            {parseFloat(item.total_units) > 0 ? `= ${fmtQtyUnit(item.total_units, itemUnit).toLowerCase()}` : " "}
                                        </span>
                                    </div>
                                ) : (
                                    <span className="text-[13px] font-semibold tabular-nums text-content dark:text-white">{fmtQty(item.package_qty)}</span>
                                )}
                            </td>

                            {/* Cuánto de esta línea ya entró al inventario. Se compara contra el
                                total de unidades, no contra las presentaciones: es lo que de
                                verdad se sumó al stock. */}
                            {showRecibido && (() => {
                                const entraron = parseFloat(item.received_units || 0);
                                const pedidas  = parseFloat(item.total_units || 0);
                                const completa = entraron >= pedidas - 1e-6 && pedidas > 0;
                                return (
                                    <td className="text-center whitespace-nowrap">
                                        {completa ? (
                                            <span className="inline-flex items-center gap-1 text-[12px] text-content-subtle">
                                                <svg className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                                Completa
                                            </span>
                                        ) : entraron > 0 ? (
                                            <span className="text-[12px] font-semibold tabular-nums text-amber-700 dark:text-amber-400">{fmtQty(entraron)} de {fmtQty(pedidas)}</span>
                                        ) : (
                                            <span className="text-[12px] text-content-subtle">Sin recibir</span>
                                        )}
                                    </td>
                                );
                            })()}

                            {/* Costo por presentación */}
                            <td className="text-right">
                                {isEditing ? (
                                    <div className="flex flex-col items-end gap-1">
                                        <div className="relative w-32">
                                            <Prefijo>{enMoneda ? invoiceSym : "Ref."}</Prefijo>
                                            <EditablePriceInput
                                                value={enMoneda ? parseFloat(item.package_price || 0) * invoiceRate : parseFloat(item.package_price || 0)}
                                                decimals={enMoneda ? 2 : 5}
                                                onChange={raw => {
                                                    const num = parseFloat(raw) || 0;
                                                    onUpdate?.(item.id ?? item.key, { package_price: enMoneda ? num / invoiceRate : raw });
                                                }}
                                                className={`${FIELD} pl-10`}
                                            />
                                        </div>
                                        {enMoneda && parseFloat(item.package_price) > 0 && (
                                            <span className="text-[12px] text-content-subtle tabular-nums">≈ Ref. {fmt2(item.package_price)}</span>
                                        )}
                                    </div>
                                ) : enMoneda ? (
                                    // Orden ya confirmada: el costo se muestra en la moneda con que se
                                    // compró. Es el dato que se va a buscar aquí —a cómo salió en la
                                    // factura del proveedor— y la columna ya se rotula en esa moneda.
                                    <div className="flex flex-col items-end gap-0.5">
                                        <span className="text-[13px] tabular-nums text-content dark:text-white">{invoiceSym} {fmt2(parseFloat(item.package_price) * invoiceRate)}</span>
                                        <span className="text-[12px] text-content-subtle tabular-nums">≈ Ref. {fmt2(item.package_price)}</span>
                                    </div>
                                ) : (
                                    <span className="text-[13px] tabular-nums text-content dark:text-white">Ref. {fmt2(item.package_price)}</span>
                                )}
                            </td>

                            {/* Costo unitario (siempre calculado) */}
                            <td className={`text-right text-[13px] tabular-nums text-content-muted dark:text-white/70 ${isEditing ? "!leading-9" : ""}`}>
                                {item.unit_cost > 0 ? `Ref. ${fmt2(item.unit_cost)}` : "—"}
                            </td>

                            {/* Precio de venta — editable + interruptor para actualizar el PVP al recibir */}
                            <td className="text-right">
                                {/* Un insumo no tiene precio de venta: ni se muestra ni se ofrece
                                    el interruptor, que aquí no cambiaría nada. */}
                                {insumo ? (
                                    <span className="text-[12px] text-content-subtle">Insumo</span>
                                ) : isEditing && item.unit_cost > 0 ? (() => {
                                    const actualiza = item.update_price !== false;
                                    return (
                                        <div className="flex flex-col items-end gap-1">
                                            <div className="relative w-32">
                                                <Prefijo>{enMoneda ? invoiceSym : "Ref."}</Prefijo>
                                                <EditablePriceInput
                                                    disabled={!actualiza}
                                                    value={enMoneda ? parseFloat(item.sale_price || 0) * invoiceRate : parseFloat(item.sale_price || 0)}
                                                    decimals={enMoneda ? 2 : 5}
                                                    onChange={raw => {
                                                        const num = parseFloat(raw) || 0;
                                                        const newPrice = enMoneda ? num / invoiceRate : num;
                                                        const cost = parseFloat(item.unit_cost) || 0;
                                                        if (cost > 0 && newPrice >= 0) {
                                                            onUpdate?.(item.id ?? item.key, { profit_margin: ((newPrice / cost) - 1) * 100 });
                                                        }
                                                    }}
                                                    className={`${FIELD} pl-10`}
                                                />
                                            </div>
                                            {/* Casilla con su texto en vez de un interruptor suelto: se lee qué
                                                hace sin tener que pasar el mouse por encima. */}
                                            <button
                                                type="button"
                                                onClick={() => onUpdate?.(item.id ?? item.key, { update_price: !actualiza })}
                                                aria-pressed={actualiza}
                                                title={actualiza ? "Al recibir, el producto pasa a venderse a este precio" : "El precio de venta del producto no se toca"}
                                                className="inline-flex items-center gap-1.5 text-[12px] text-content-subtle hover:text-content dark:hover:text-white whitespace-nowrap"
                                            >
                                                <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors ${actualiza ? "bg-brand-500 border-brand-500 text-white" : "border-border dark:border-white/25"}`}>
                                                    {actualiza && <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" /></svg>}
                                                </span>
                                                {actualiza
                                                    ? <span className="tabular-nums">Actualiza · margen {(margen || 0).toLocaleString("es-VE", { maximumFractionDigits: 1 })} %</span>
                                                    : "No cambia el precio"}
                                            </button>
                                            {enMoneda && actualiza && parseFloat(item.sale_price) > 0 && (
                                                <span className="text-[12px] text-content-subtle tabular-nums">≈ Ref. {fmt2(item.sale_price)}</span>
                                            )}
                                        </div>
                                    );
                                })() : (
                                    <div className="flex flex-col items-end gap-0.5">
                                        <span className="text-[13px] tabular-nums text-content dark:text-white">
                                            {item.sale_price > 0 ? `Ref. ${fmt2(item.sale_price)}` : "—"}
                                        </span>
                                        <span className="text-[12px] text-content-subtle tabular-nums">
                                            {item.update_price === false ? "No cambió el precio" : !isNaN(margen) && item.sale_price > 0 ? `margen ${margen.toFixed(1)} %` : ""}
                                        </span>
                                    </div>
                                )}
                            </td>

                            {/* Subtotal */}
                            <td className={`text-right ${showActions ? "" : "pr-5"} ${isEditing ? "!leading-9" : ""}`}>
                                {enMoneda ? (
                                    <div className="flex flex-col items-end gap-0.5">
                                        <span className="text-[14px] font-semibold text-content dark:text-white tabular-nums">{invoiceSym} {fmt2(parseFloat(item.subtotal) * invoiceRate)}</span>
                                        <span className="text-[12px] text-content-subtle tabular-nums">≈ Ref. {fmt2(item.subtotal)}</span>
                                    </div>
                                ) : (
                                    <span className="text-[14px] font-semibold text-content dark:text-white tabular-nums">Ref. {fmt2(item.subtotal)}</span>
                                )}
                            </td>

                            {/* Acciones: siempre visibles, en tablet no hay hover. */}
                            {showActions && (
                                <td className="pr-5">
                                    <div className="h-9 flex items-center justify-end gap-0.5">
                                        <button onClick={() => onEdit?.(item.id ?? item.key)} className="row-icon" title="Editar línea" aria-label="Editar línea">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                            </svg>
                                        </button>
                                        <button onClick={() => onDelete?.(item.id ?? item.key)} className="row-icon hover:!text-red-600 hover:!bg-red-500/10 dark:hover:!text-red-400" title="Quitar línea" aria-label="Quitar línea">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        </button>
                                    </div>
                                </td>
                            )}
                        </tr>
                        );
                    })}
                </tbody>
                {/* Pie con el total de la compra (solo la orden cerrada; al editar, el total vive
                    en el pie de la sección, junto al guardado). */}
                {!isEditing && items.length > 0 && (
                    <tfoot>
                        <tr>
                            <td className="pl-5 text-[13px] text-content-subtle" colSpan={1 + (showLots ? 1 : 0)}>
                                {items.length} {items.length === 1 ? "producto" : "productos"}
                                {unidadComun && totalUnidades > 0 && <> · {fmtQtyUnit(totalUnidades, unidadComun).toLowerCase()}</>}
                            </td>
                            <td colSpan={3 + (showRecibido ? 1 : 0)} />
                            <td className="text-right text-[13px] text-content-subtle">Total</td>
                            <td className="text-right pr-5">
                                {enMoneda ? (
                                    <div className="flex flex-col items-end">
                                        <span className="text-[15px] font-bold text-content dark:text-white tabular-nums">{invoiceSym} {fmt2(totalSubtotal * invoiceRate)}</span>
                                        <span className="text-[12px] text-content-subtle tabular-nums">≈ Ref. {fmt2(totalSubtotal)}</span>
                                    </div>
                                ) : (
                                    <span className="text-[15px] font-bold text-content dark:text-white tabular-nums">Ref. {fmt2(totalSubtotal)}</span>
                                )}
                            </td>
                        </tr>
                    </tfoot>
                )}
            </table>
        </div>
        </>
    );
}
