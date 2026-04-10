export const fmt2 = (n) => Number(n).toFixed(2);

export const calcItem = (item) => {
    if (!item) return {};

    const packageSize = parseFloat(item.package_size) || 0;
    const packageQty = parseFloat(item.package_qty) || 0;
    const packagePrice = parseFloat(item.package_price) || 0;
    const profitMargin = parseFloat(item.profit_margin) || 0;

    const totalUnits = packageSize * packageQty;
    const unitCost = totalUnits > 0 ? packagePrice / totalUnits : 0;
    const salePrice = unitCost + (unitCost * profitMargin) / 100;
    const subtotal = packagePrice * packageQty;

    return {
        total_units: totalUnits,
        unit_cost: unitCost,
        sale_price: salePrice,
        subtotal,
    };
};
