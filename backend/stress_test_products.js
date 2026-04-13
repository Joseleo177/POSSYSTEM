const { Product, Category, ProductStock, Warehouse } = require('./src/models');

async function stressTestProducts() {
    try {
        console.log("🚀 Iniciando inyección masiva en Supabase: 10,000 productos...");
        
        // 1. Asegurar categoría
        const [category] = await Category.findOrCreate({
            where: { name: 'PRUEBA DE ESTRÉS' },
            defaults: { description: 'Categoría para pruebas de rendimiento en la nube' }
        });

        // 2. Asegurar al menos un almacén
        let warehouse = await Warehouse.findOne();
        if (!warehouse) {
            warehouse = await Warehouse.create({ name: 'ALMACÉN PRINCIPAL', address: 'Sede Central' });
        }

        const totalToCreate = 10000;
        const batchSize = 1000;
        const prefix = ["Bio", "Eco", "Natural", "Gluten-Free", "Light", "Zero", "Xtra", "Power", "Soft", "Hard"];
        const type = ["Agua", "Pasta", "Arroz", "Aceite", "Vinagre", "Sal", "Azúcar", "Harina", "Avena", "Cereal"];
        const flavor = ["Coco", "Almendra", "Nuez", "Canela", "Miel", "Sésamo", "Oliva", "Girasol", "Maíz", "Soya"];

        for (let i = 0; i < totalToCreate; i += batchSize) {
            const batch = [];
            for (let j = 0; j < batchSize; j++) {
                const index = i + j;
                const p = prefix[Math.floor(Math.random() * prefix.length)];
                const t = type[Math.floor(Math.random() * type.length)];
                const f = flavor[Math.floor(Math.random() * flavor.length)];
                
                batch.push({
                    name: `${p} ${t} ${f} #${index + 20000}`, // Offset para evitar duplicados visuales
                    price: (Math.random() * (50 - 1) + 1).toFixed(2),
                    cost_price: (Math.random() * (20 - 0.5) + 0.5).toFixed(2),
                    stock: Math.floor(Math.random() * 500) + 1,
                    unit: 'unidad',
                    category_id: category.id,
                    is_service: false,
                    active: true
                });
            }

            console.log(`📦 Insertando lote de productos (${i + batchSize} / ${totalToCreate})...`);
            const createdProducts = await Product.bulkCreate(batch);
            
            const stocks = createdProducts.map(p => ({
                warehouse_id: warehouse.id,
                product_id: p.id,
                qty: p.stock
            }));
            await ProductStock.bulkCreate(stocks);
        }

        console.log(`✅ ¡ÉXITO! 10,000 productos inyectados en Supabase.`);
        process.exit(0);
    } catch (err) {
        console.error("❌ FALLO EN LA PRUEBA DE ESTRÉS:", err.message);
        process.exit(1);
    }
}

stressTestProducts();
