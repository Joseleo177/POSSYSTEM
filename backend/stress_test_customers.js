const { Customer } = require('./src/models');

async function stressTestCustomers() {
    console.log('--- INICIANDO INYECCIÓN MASIVA DE CLIENTES (10,000) ---');
    const totalToCreate = 10000;
    const batchSize = 500;
    
    for (let i = 0; i < totalToCreate; i += batchSize) {
        const batch = [];
        for (let j = 0; j < batchSize; j++) {
            const index = i + j;
            batch.push({
                type: 'cliente',
                name: `CLIENTE DE PRUEBA #${index}`,
                phone: `555-${index.toString().padStart(6, '0')}`,
                email: `cliente${index}@stresstest.com`,
                address: `Dirección ficticia de prueba nº ${index}`,
                rif: `V-${(10000000 + index).toString()}`,
                notes: 'Generado automáticamente para prueba de estrés de paginación.'
            });
        }
        
        try {
            await Customer.bulkCreate(batch);
            console.log(`[✓] Creados ${i + batchSize} / ${totalToCreate} clientes...`);
        } catch (error) {
            console.error(`[X] Error en el lote ${i}:`, error.message);
        }
    }
    
    console.log('--- PROCESO FINALIZADO ---');
    process.exit(0);
}

stressTestCustomers();
