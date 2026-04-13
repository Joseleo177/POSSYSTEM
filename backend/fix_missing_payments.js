const { sequelize, Sale, Payment, PaymentMethod, Currency } = require('./src/models');

async function fixPayments() {
    try {
        console.log("🔍 Buscando ventas sin registros de pago...");

        // 1. Obtener moneda y método de pago por defecto
        const currency = await Currency.findOne() || { id: 1, exchange_rate: 1 };
        
        // 2. Buscar ventas pagadas que no están en la tabla de pagos
        const salesToFix = await Sale.findAll({
            where: {
                status: 'pagado'
            },
            include: [{
                model: Payment,
                required: false
            }]
        });

        const missing = salesToFix.filter(s => !s.Payments || s.Payments.length === 0);
        console.log(`💡 Se encontraron ${missing.length} ventas que requieren sincronización de pagos.`);

        if (missing.length === 0) {
            console.log("✅ Todo está al día.");
            process.exit(0);
        }

        const batchSize = 100;
        for (let i = 0; i < missing.length; i += batchSize) {
            const batch = missing.slice(i, i + batchSize);
            
            await sequelize.transaction(async (t) => {
                for (const sale of batch) {
                    await Payment.create({
                        sale_id: sale.id,
                        customer_id: sale.customer_id,
                        amount: sale.total,
                        currency_id: sale.currency_id || currency.id,
                        exchange_rate: sale.exchange_rate || 1,
                        payment_journal_id: sale.payment_journal_id || 1, // Diario de efectivo por defecto
                        employee_id: sale.employee_id || 1,
                        reference_date: sale.created_at,
                        notes: 'Pago generado retroactivamente por prueba de estrés',
                        created_at: sale.created_at
                    }, { transaction: t });
                }
            });
            console.log(`[✓] Sincronizados ${Math.min(i + batchSize, missing.length)} / ${missing.length} pagos...`);
        }

        console.log("✅ ¡ÉXITO! Todos los pagos han sido generados localmente.");
        process.exit(0);
    } catch (err) {
        console.error("❌ ERROR EN FIX PAYMENTS:", err.message);
        process.exit(1);
    }
}

fixPayments();
