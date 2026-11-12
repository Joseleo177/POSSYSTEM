// Venta al mayor en la caja (12-11-2026). Misma cuenta que el servidor en
// backend/src/services/sales/precioMayor.js: lo que se ve en el carrito es lo que se factura. Si
// se cambia una, se cambia la otra.
//
//  - Va al mayor si el cliente es mayorista o si la línea llega a "al mayor desde" (la cantidad
//    de una variante suma todo su modelo).
//  - Promoción y precio al mayor no se acumulan: gana lo más bajo para el cliente.
//  - El descuento manual de la caja sí va sobre el precio al mayor.
//  - Lo pactado en una cotización (`pactado`) no se toca.
//
// El carrito guarda el precio DETAL en `price`. Esto devuelve las líneas con `price` = el que
// se cobra, `mayor: true` y `precio_detal` en las que van al mayor; el resto queda igual.

const round2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;

// Descuento de la promoción sobre la línea entera (mismo cálculo que promoOnlyUsd del carrito).
function descuentoPromo(promos, id, unit, qty) {
    for (const promo of promos || []) {
        if (!promo.product_ids?.includes(id)) continue;
        if (promo.type === "percentage") return unit * qty * (parseFloat(promo.discount_pct) / 100);
        if (promo.type === "buy_x_get_y") {
            const gratis = Math.floor(qty / (promo.buy_qty + promo.get_qty)) * promo.get_qty;
            return gratis * unit;
        }
    }
    return 0;
}

export function aplicarMayor(cart, { activo, mayorista, promos }) {
    if (!activo || !cart?.length) return cart;
    const grupoDe = (i) => i.parent_id ?? i.id;
    const cantidad = new Map();
    for (const i of cart) {
        const q = parseFloat(i.qty) || 0;
        if (q > 0) cantidad.set(grupoDe(i), (cantidad.get(grupoDe(i)) || 0) + q);
    }
    let cambio = false;
    const salida = cart.map((i) => {
        const q = parseFloat(i.qty) || 0;
        const wp = i.wholesale_price;
        if (i.pactado || wp == null || !(q > 0)) return i;
        const minimo = parseFloat(i.wholesale_min_qty);
        const porCantidad = minimo > 0 && cantidad.get(grupoDe(i)) >= minimo - 1e-9;
        if (!mayorista && !porCantidad) return i;
        const manual = i.ld_mode && parseFloat(i.ld_value) > 0;
        const base = round2(i.price);
        const promo = manual ? 0 : descuentoPromo(promos, i.id, base, q);
        if (round2(wp) * q > base * q - promo + 1e-9) return i;
        cambio = true;
        return { ...i, price: parseFloat(wp), mayor: true, precio_detal: parseFloat(i.price) };
    });
    return cambio ? salida : cart;
}
