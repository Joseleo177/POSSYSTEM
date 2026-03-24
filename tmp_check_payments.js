const { Product } = require('./backend/src/models');

async function check() {
  try {
    const products = await Product.findAll({
      attributes: ['id', 'name', 'stock', 'min_stock'],
      limit: 20
    });
    console.log('--- PRODUCTS STOCK ---');
    console.log(JSON.stringify(products, null, 2));
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
check();
