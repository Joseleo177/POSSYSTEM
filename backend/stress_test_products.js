const { sequelize, Product, Category, ProductStock } = require('./src/models');

async function stressTest() {
  try {
    console.log("🚀 Iniciando prueba de estrés: Generando 2000 productos...");
    
    // 1. Crear o buscar categoría de prueba
    const [category] = await Category.findOrCreate({
      where: { name: 'PRUEBA DE ESTRÉS' },
      defaults: { description: 'Categoría para pruebas de rendimiento' }
    });

    const productsToCreate = [];
    const prefix = ["Bio", "Eco", "Natural", "Gluten-Free", "Light", "Zero", "Xtra", "Power", "Soft", "Hard"];
    const type = ["Agua", "Pasta", "Arroz", "Aceite", "Vinagre", "Sal", "Azúcar", "Harina", "Avena", "Cereal"];
    const flavor = ["Coco", "Almendra", "Nuez", "Canela", "Miel", "Sésamo", "Oliva", "Girasol", "Maíz", "Soya"];

    for (let i = 10001; i <= 18000; i++) {
        const p = prefix[Math.floor(Math.random() * prefix.length)];
        const t = type[Math.floor(Math.random() * type.length)];
        const f = flavor[Math.floor(Math.random() * flavor.length)];
        
        productsToCreate.push({
            name: `${p} ${t} ${f} #${i}`,
            price: (Math.random() * (50 - 1) + 1).toFixed(2),
            cost_price: (Math.random() * (20 - 0.5) + 0.5).toFixed(2),
            stock: Math.floor(Math.random() * 500) + 1,
            unit: 'unidad',
            category_id: category.id,
            is_service: false,
            active: true
        });
    }

    // 2. Inserción masiva (Bulk Create)
    console.log("📦 Insertando productos en la base de datos...");
    const createdProducts = await Product.bulkCreate(productsToCreate);
    
    // 3. Opcional: Asignar stock al almacén principal (ID 1 por defecto)
    console.log("🔗 Vinculando stock a almacén principal...");
    const stocks = createdProducts.map(p => ({
        warehouse_id: 1,
        product_id: p.id,
        qty: p.stock
    }));
    await ProductStock.bulkCreate(stocks);

    console.log(`✅ ¡ÉXITO! Se han inyectado ${createdProducts.length} productos correctamente.`);
    process.exit(0);
  } catch (err) {
    console.error("❌ FALLO EN LA PRUEBA DE ESTRÉS:", err.message);
    process.exit(1);
  }
}

stressTest();
