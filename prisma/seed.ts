import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Clearing existing database tables...');
  await prisma.idempotencyKey.deleteMany({});
  await prisma.reservation.deleteMany({});
  await prisma.inventory.deleteMany({});
  await prisma.warehouse.deleteMany({});
  await prisma.product.deleteMany({});

  console.log('Seeding products...');
  const products = await Promise.all([
    prisma.product.create({
      data: {
        name: 'Ultra Wireless Headphones',
        description: 'Noise-cancelling over-ear wireless headphones with premium sound quality and 40h battery life.',
      },
    }),
    prisma.product.create({
      data: {
        name: 'Pro Mechanical Keyboard',
        description: 'Tactile mechanical keyboard with customizable RGB backlighting and hot-swappable switches.',
      },
    }),
    prisma.product.create({
      data: {
        name: 'Ergonomic Office Chair',
        description: 'High-back ergonomic mesh chair with adjustable lumbar support, armrests, and headrest.',
      },
    }),
    prisma.product.create({
      data: {
        name: '4K UltraHD Monitor',
        description: '27-inch 4K IPS professional color-accurate monitor with USB-C power delivery.',
      },
    }),
    prisma.product.create({
      data: {
        name: 'USB-C Multi-Port Hub',
        description: '8-in-1 space gray aluminum adapter with 4K HDMI, Gigabit Ethernet, and Power Delivery pass-through.',
      },
    }),
  ]);

  console.log('Seeding warehouses...');
  const warehouses = await Promise.all([
    prisma.warehouse.create({
      data: {
        name: 'Bengaluru Tech Fulfillment',
        location: 'Bengaluru, Karnataka',
      },
    }),
    prisma.warehouse.create({
      data: {
        name: 'Mumbai Port Distribution Hub',
        location: 'Mumbai, Maharashtra',
      },
    }),
    prisma.warehouse.create({
      data: {
        name: 'Delhi NCR Logistics Center',
        location: 'Gurugram, Haryana',
      },
    }),
  ]);

  console.log('Seeding inventory mappings...');
  // Varying inventory levels for robust edge-case testing:
  // - Product 0 (Headphones): Bengaluru has 2 (perfect for concurrency tests), Mumbai has 10, Delhi NCR has 0 (out of stock)
  // - Product 1 (Keyboard): Bengaluru has 1 (contested single unit), Mumbai has 5, Delhi NCR has 12
  // - Product 2 (Chair): Bengaluru has 8, Mumbai has 2, Delhi NCR has 15
  // - Product 3 (Monitor): Bengaluru has 0, Mumbai has 1, Delhi NCR has 4
  // - Product 4 (Hub): Bengaluru has 25, Mumbai has 30, Delhi NCR has 20

  const inventoryStock = [
    // Product 0: Headphones
    { prodIdx: 0, whIdx: 0, total: 2 },
    { prodIdx: 0, whIdx: 1, total: 10 },
    { prodIdx: 0, whIdx: 2, total: 0 },

    // Product 1: Keyboard
    { prodIdx: 1, whIdx: 0, total: 1 },
    { prodIdx: 1, whIdx: 1, total: 5 },
    { prodIdx: 1, whIdx: 2, total: 12 },

    // Product 2: Chair
    { prodIdx: 2, whIdx: 0, total: 8 },
    { prodIdx: 2, whIdx: 1, total: 2 },
    { prodIdx: 2, whIdx: 2, total: 15 },

    // Product 3: Monitor
    { prodIdx: 3, whIdx: 0, total: 0 },
    { prodIdx: 3, whIdx: 1, total: 1 },
    { prodIdx: 3, whIdx: 2, total: 4 },

    // Product 4: Hub
    { prodIdx: 4, whIdx: 0, total: 25 },
    { prodIdx: 4, whIdx: 1, total: 30 },
    { prodIdx: 4, whIdx: 2, total: 20 },
  ];

  for (const item of inventoryStock) {
    await prisma.inventory.create({
      data: {
        productId: products[item.prodIdx].id,
        warehouseId: warehouses[item.whIdx].id,
        totalStock: item.total,
        reservedStock: 0,
      },
    });
  }

  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
