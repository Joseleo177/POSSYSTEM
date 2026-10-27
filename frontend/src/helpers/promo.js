// Cuántas unidades de una línea del carrito caen gratis por una promo "compra N lleva M
// gratis" — solo las que completan un grupo entero de N+M, nunca una fracción. Misma cuenta
// que ya usa la caja (calcLineDiscount en backend/src/services/sales/createSale.js) y que el
// pedido web recalcula al confirmar (createOrder en publicCatalogService.js): las tres tienen
// que dar el mismo número, o el total que ve el cliente no coincidiría con lo que se cobra.
export function freeUnitsFor(item) {
    if (!item?.promo_buy_qty || !item?.promo_get_qty) return 0;
    const qty = parseFloat(item.qty) || 0;
    const grupo = item.promo_buy_qty + item.promo_get_qty;
    return Math.floor(qty / grupo) * item.promo_get_qty;
}

// Lo que esa línea cobra de verdad: precio × cantidad, menos el valor de las unidades gratis.
// Los adicionales con precio de un plato (extras_price, por unidad) se suman aparte: la promo
// es del plato, no de sus extras, igual que en la venta, donde cada extra es su propia línea.
export function lineTotalFor(item) {
    const qty = parseFloat(item.qty) || 0;
    const price = parseFloat(item.price) || 0;
    return price * qty - freeUnitsFor(item) * price + (parseFloat(item.extras_price) || 0) * qty;
}
