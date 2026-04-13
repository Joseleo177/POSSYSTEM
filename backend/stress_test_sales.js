const { sequelize, Sale, SaleItem, Product, ProductStock, Customer, Warehouse, Currency, PaymentMethod } = require('./src/models');

async function stressTestSales() {
    try {
        console.log("🚀 Iniciando generación de 1,000 ventas locales...");
        
        // 1. Obtener recursos necesarios
        const customers = await Customer.findAll({ where: { type: 'cliente' }, limit: 500 });
        const products = await Product.findAll({ where: { is_service: false }, limit: 500 });
        const warehouse = await Warehouse.findOne() || await Warehouse.create({ name: 'ALMACÉN PRINCIPAL' });
        const currency = await Currency.findOne() || { id: 1, exchange_rate: 1 };
        const payMethod = await PaymentMethod.findOne() || { id: 1, name: 'Efectivo' };

        if (customers.length === 0 || products.length === 0) {
            throw new Error("No hay suficientes clientes o productos para generar ventas.");
        }

        const totalSales = 1000;
        const batchSize = 100;

        for (let i = 0; i < totalSales; i += batchSize) {
            await sequelize.transaction(async (t) => {
                for (let j = 0; j < batchSize; j++) {
                    const customer = customers[Math.floor(Math.random() * customers.length)];
                    const saleDate = new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000);

                    const sale = await Sale.create({
                        customer_id: customer.id,
                        warehouse_id: warehouse.id,
                        currency_id: currency.id,
                        exchange_rate: currency.exchange_rate || 1,
                        payment_method: 'efectivo',
                        payment_method_id: payMethod.id,
                        status: 'pagado',
                        total: 0,
                        paid: 0,
                        change: 0,
                        created_at: saleDate
                    }, { transaction: t });

                    let currentTotal = 0;
                    const itemsCount = Math.floor(Math.random() * 4) + 1; // 1 a 4 productos
                    for (let k = 0; k < itemsCount; k++) {
                        const product = products[Math.floor(Math.random() * products.length)];
                        const qty = Math.floor(Math.random() * 3) + 1;
                        const price = parseFloat(product.price || 0);
                        const subtotal = qty * price;
                        currentTotal += subtotal;

                        await SaleItem.create({
                            sale_id: sale.id,
                            product_id: product.id,
                            name: product.name,
                            quantity: qty,
                            price: price,
                        }, { transaction: t });

                        // Asegurar stock para que no falle el constraint
                        const [stock] = await ProductStock.findOrCreate({
                            where: { product_id: product.id, warehouse_id: warehouse.id },
                            defaults: { qty: 0 },
                            transaction: t
                        });
                        await stock.increment('qty', { by: 100, transaction: t }); // Inyección preventiva
                        await stock.decrement('qty', { by: qty, transaction: t });
                    }

                    await sale.update({ 
                        total: currentTotal,
                        paid: currentTotal 
                    }, { transaction: t });
                }
            });
            console.log(`[✓] Procesadas ${i + batchSize} / ${totalSales} ventas...`);
        }

        console.log("✅ ¡ÉXITO! 1,000 ventas generadas localmente.");
        process.exit(0);
    } catch (err) {
        console.error("❌ ERROR EN STRESS TEST VENTAS:", err.message);
        process.exit(1);
    }
}

stressTestSales();
