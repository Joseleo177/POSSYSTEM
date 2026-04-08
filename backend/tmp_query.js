const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const products = await prisma.product.findMany({
    where: { is_combo: true },
    include: { comboItems: true }
  });
  console.dir(products, { depth: null });
  process.exit();
}
main();
