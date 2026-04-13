const { sequelize, Purchase, PurchaseItem, Product, ProductStock, Customer, Warehouse } = require('./src/models');

async function stressTestPurchases() {
    try {
        console.log("🚀 Iniciando generación de 2,000 compras locales...");
        
        // 1. Asegurar proveedor
        const [supplier] = await Customer.findOrCreate({
            where: { name: 'PROVEEDOR MAYORISTA ESTRÉS', type: 'proveedor' },
            defaults: { rif: 'J-000000000', email: 'proveedor@test.com' }
        });

        // 2. Asegurar almacén
        const warehouse = await Warehouse.findOne() || await Warehouse.create({ name: 'ALMACÉN PRINCIPAL' });

        // 3. Obtener una muestra de 200 productos para no saturar la consulta inicial
        const products = await Product.findAll({ where: { is_service: false }, limit: 200 });
        if (products.length === 0) throw new Error("No hay productos disponibles para comprar.");

        const totalPurchases = 2000;
        const batchSize = 100;

        for (let i = 0; i < totalPurchases; i += batchSize) {
            await sequelize.transaction(async (t) => {
                for (let j = 0; j < batchSize; j++) {
                    const purchaseTotal = 0;
                    const purchase = await Purchase.create({
                        supplier_id: supplier.id,
                        supplier_name: supplier.name,
                        warehouse_id: warehouse.id,
                        total: 0,
                        notes: `Compra de estrés #${i + j}`,
                        created_at: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000) // Fecha aleatoria en últimos 30 días
                    }, { transaction: t });

                    let currentTotal = 0;
                    // Cada compra tiene 3-6 productos distintos
                    const itemsCount = Math.floor(Math.random() * 4) + 3;
                    for (let k = 0; k < itemsCount; k++) {
                        const product = products[Math.floor(Math.random() * products.length)];
                        const qty = Math.floor(Math.random() * 20) + 1;
                        const cost = parseFloat((Math.random() * 10 + 1).toFixed(2));
                        const subtotal = qty * cost;
                        currentTotal += subtotal;

                        await PurchaseItem.create({
                            purchase_id: purchase.id,
                            product_id: product.id,
                            product_name: product.name,
                            package_qty: qty,
                            package_price: cost,
                            unit_cost: cost,
                            sale_price: (cost * 1.3).toFixed(2), // 30% margen
                            total_units: qty,
                            subtotal: subtotal
                        }, { transaction: t });

                        // Actualizar Stock
                        const [stock] = await ProductStock.findOrCreate({
                            where: { product_id: product.id, warehouse_id: warehouse.id },
                            defaults: { qty: 0 },
                            transaction: t
                        });
                        await stock.increment('qty', { by: qty, transaction: t });
                        
                        // Actualizar costo en producto
                        await product.update({ cost_price: cost }, { transaction: t });
                    }

                    await purchase.update({ total: currentTotal }, { transaction: t });
                }
            });
            console.log(`[✓] Procesadas ${i + batchSize} / ${totalPurchases} compras...`);
        }

        console.log("✅ ¡ÉXITO! 2,000 compras generadas localmente.");
        process.exit(0);
    } catch (err) {
        console.error("❌ ERROR EN STRESS TEST COMPRAS:", err.message);
        process.exit(1);
    }
}

stressTestPurchases();
