import { PrismaClient } from '@prisma/client';
import { reserveStock, ReservationError } from '../lib/reservation-service';

const prisma = new PrismaClient();

async function runConcurrencyTest() {
  console.log('=== STARTING CONCURRENCY STRESS TEST ===\n');

  // 1. Find the test product and warehouse seeded in Bengaluru
  const product = await prisma.product.findFirst({
    where: { name: 'Ultra Wireless Headphones' },
  });

  const warehouse = await prisma.warehouse.findFirst({
    where: { name: 'Bengaluru Tech Fulfillment' },
  });

  if (!product || !warehouse) {
    console.error('Error: Seed data not found. Please run "npx prisma db seed" first.');
    process.exit(1);
  }

  console.log(`Product: "${product.name}" (${product.id})`);
  console.log(`Warehouse: "${warehouse.name}" (${warehouse.id})`);

  // 2. Reset stock to exactly 2 and clean up existing reservations for this product/warehouse
  console.log('\nResetting inventory to exactly 2 units, and clearing old reservations...');
  
  await prisma.reservation.deleteMany({
    where: { productId: product.id, warehouseId: warehouse.id },
  });

  await prisma.inventory.update({
    where: {
      productId_warehouseId: {
        productId: product.id,
        warehouseId: warehouse.id,
      },
    },
    data: {
      totalStock: 2,
      reservedStock: 0,
    },
  });

  const startInventory = await prisma.inventory.findUnique({
    where: {
      productId_warehouseId: {
        productId: product.id,
        warehouseId: warehouse.id,
      },
    },
  });

  console.log(`Initial stock levels:`);
  console.log(`- Total Stock: ${startInventory?.totalStock}`);
  console.log(`- Reserved Stock: ${startInventory?.reservedStock}`);
  console.log(`- Available Stock: ${(startInventory?.totalStock ?? 0) - (startInventory?.reservedStock ?? 0)}`);

  // 3. Fire 5 concurrent reservation requests for 1 unit each in parallel
  console.log('\nFiring 5 concurrent reservation requests (quantity = 1 each) in parallel...');
  
  const requests = Array.from({ length: 5 }).map((_, index) => {
    return reserveStock(product.id, warehouse.id, 1)
      .then((res) => {
        return { index: index + 1, success: true, reservationId: res.id, error: null };
      })
      .catch((err) => {
        return { index: index + 1, success: false, reservationId: null, error: err };
      });
  });

  const results = await Promise.all(requests);

  // 4. Analyze results
  console.log('\n=== RESULTS OF CONCURRENT REQUESTS ===');
  
  let successCount = 0;
  let failCount = 0;
  let insufficientStockCount = 0;

  for (const res of results) {
    if (res.success) {
      successCount++;
      console.log(`[Request #${res.index}] SUCCESS - Reservation ID: ${res.reservationId}`);
    } else {
      failCount++;
      const err = res.error;
      const isInsufficientStock = err instanceof ReservationError && err.code === 'INSUFFICIENT_STOCK';
      if (isInsufficientStock) insufficientStockCount++;
      
      console.log(
        `[Request #${res.index}] FAILED - Code: ${err instanceof ReservationError ? err.code : 'UNKNOWN'}, Message: ${err.message}`
      );
    }
  }

  // 5. Fetch final inventory state
  const finalInventory = await prisma.inventory.findUnique({
    where: {
      productId_warehouseId: {
        productId: product.id,
        warehouseId: warehouse.id,
      },
    },
  });

  const activeReservations = await prisma.reservation.count({
    where: {
      productId: product.id,
      warehouseId: warehouse.id,
      status: 'PENDING',
    },
  });

  console.log('\n=== FINAL DATABASE STATE ===');
  console.log(`- Total Stock in DB: ${finalInventory?.totalStock}`);
  console.log(`- Reserved Stock in DB: ${finalInventory?.reservedStock}`);
  console.log(`- Available Stock in DB: ${(finalInventory?.totalStock ?? 0) - (finalInventory?.reservedStock ?? 0)}`);
  console.log(`- Active Reservations in DB: ${activeReservations}`);

  // 6. Assertions for correctness
  console.log('\n=== CONCURRENCY SAFETY VERIFICATION ===');
  
  const matchesSuccessCount = successCount === 2;
  const matchesInsufficientCount = insufficientStockCount === 3;
  const matchesReservedStock = finalInventory?.reservedStock === 2;

  if (matchesSuccessCount && matchesInsufficientCount && matchesReservedStock) {
    console.log('✅ TEST PASSED! Concurrency safety is fully guaranteed.');
    console.log('   - Exactly 2 concurrent requests succeeded.');
    console.log('   - Exactly 3 concurrent requests failed with INSUFFICIENT_STOCK.');
    console.log('   - Database reserved stock is exactly 2. Overselling was PREVENTED.');
  } else {
    console.error('❌ TEST FAILED!');
    if (!matchesSuccessCount) console.error(`   - Expected exactly 2 successful reservations, but got ${successCount}`);
    if (!matchesInsufficientCount) console.error(`   - Expected exactly 3 INSUFFICIENT_STOCK errors, but got ${insufficientStockCount}`);
    if (!matchesReservedStock) console.error(`   - Expected reserved stock to be 2, but got ${finalInventory?.reservedStock}`);
  }
}

runConcurrencyTest()
  .catch((e) => {
    console.error('Test execution error:', e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
