import prisma from './prisma';
import { Reservation, ReservationStatus, Inventory } from '@prisma/client';

export class ReservationError extends Error {
  code: 'INSUFFICIENT_STOCK' | 'NOT_FOUND' | 'EXPIRED' | 'INVALID_STATUS' | 'DATABASE_ERROR';

  constructor(code: 'INSUFFICIENT_STOCK' | 'NOT_FOUND' | 'EXPIRED' | 'INVALID_STATUS' | 'DATABASE_ERROR', message: string) {
    super(message);
    this.name = 'ReservationError';
    this.code = code;
  }
}

/**
 * Creates a temporary inventory reservation (valid for 10 minutes).
 * Employs row-level locking (SELECT FOR UPDATE) inside a transaction
 * to guarantee concurrency safety and prevent overselling.
 */
export async function reserveStock(
  productId: string,
  warehouseId: string,
  quantity: number
): Promise<Reservation> {
  if (quantity <= 0) {
    throw new ReservationError('INVALID_STATUS', 'Quantity must be greater than zero.');
  }

  return prisma.$transaction(async (tx) => {
    // 1. Lock the specific inventory row using SELECT FOR UPDATE
    // This blocks any concurrent transactions trying to lock or update this row.
    const inventories = await tx.$queryRaw<Inventory[]>`
      SELECT id, "productId", "warehouseId", "totalStock", "reservedStock"
      FROM "Inventory"
      WHERE "productId" = ${productId} AND "warehouseId" = ${warehouseId}
      LIMIT 1
      FOR UPDATE
    `;

    if (!inventories || inventories.length === 0) {
      throw new ReservationError('NOT_FOUND', 'No inventory mapping found for the given product and warehouse.');
    }

    const inventory = inventories[0];

    // 2. Compute the available stock
    const availableStock = inventory.totalStock - inventory.reservedStock;

    // 3. If there is insufficient stock, roll back the transaction and throw an error
    if (availableStock < quantity) {
      throw new ReservationError(
        'INSUFFICIENT_STOCK',
        `Insufficient stock available. Requested: ${quantity}, Available: ${availableStock}`
      );
    }

    // 4. Update the reserved stock on the locked inventory row
    await tx.inventory.update({
      where: { id: inventory.id },
      data: {
        reservedStock: {
          increment: quantity,
        },
      },
    });

    // 5. Create the PENDING reservation with a 10-minute expiry
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const reservation = await tx.reservation.create({
      data: {
        productId,
        warehouseId,
        quantity,
        status: ReservationStatus.PENDING,
        expiresAt,
      },
    });

    return reservation;
  }, {
    // Make sure we have a reasonable timeout so we don't hold locks forever under extreme deadlock conditions
    timeout: 10000, 
  });
}

/**
 * Confirms a temporary reservation, permanently decrementing both total stock and reserved stock.
 * Fails with a 410 (EXPIRED) if the reservation is past its expiration date.
 */
export async function confirmReservation(reservationId: string): Promise<Reservation> {
  return prisma.$transaction(async (tx) => {
    // 1. Fetch the reservation
    const reservation = await tx.reservation.findUnique({
      where: { id: reservationId },
    });

    if (!reservation) {
      throw new ReservationError('NOT_FOUND', 'Reservation not found.');
    }

    if (reservation.status !== ReservationStatus.PENDING) {
      throw new ReservationError(
        'INVALID_STATUS',
        `Reservation cannot be confirmed because its status is ${reservation.status}.`
      );
    }

    // 2. Check if the reservation is expired
    if (new Date() > reservation.expiresAt) {
      throw new ReservationError('EXPIRED', 'Reservation has expired and cannot be confirmed.');
    }

    // 3. Lock the associated inventory row using SELECT FOR UPDATE
    const inventories = await tx.$queryRaw<Inventory[]>`
      SELECT id, "productId", "warehouseId", "totalStock", "reservedStock"
      FROM "Inventory"
      WHERE "productId" = ${reservation.productId} AND "warehouseId" = ${reservation.warehouseId}
      LIMIT 1
      FOR UPDATE
    `;

    if (!inventories || inventories.length === 0) {
      throw new ReservationError('NOT_FOUND', 'Associated inventory row not found.');
    }

    const inventory = inventories[0];

    // 4. Deduct quantity from both totalStock and reservedStock
    await tx.inventory.update({
      where: { id: inventory.id },
      data: {
        totalStock: { decrement: reservation.quantity },
        reservedStock: { decrement: reservation.quantity },
      },
    });

    // 5. Mark the reservation as CONFIRMED
    const updatedReservation = await tx.reservation.update({
      where: { id: reservationId },
      data: {
        status: ReservationStatus.CONFIRMED,
      },
    });

    return updatedReservation;
  });
}

/**
 * Releases a pending reservation, returning the reserved stock back to the available pool.
 */
export async function releaseReservation(reservationId: string): Promise<Reservation> {
  return prisma.$transaction(async (tx) => {
    // 1. Fetch the reservation
    const reservation = await tx.reservation.findUnique({
      where: { id: reservationId },
    });

    if (!reservation) {
      throw new ReservationError('NOT_FOUND', 'Reservation not found.');
    }

    if (reservation.status !== ReservationStatus.PENDING) {
      throw new ReservationError(
        'INVALID_STATUS',
        `Reservation cannot be released because its status is ${reservation.status}.`
      );
    }

    // 2. Lock the associated inventory row
    const inventories = await tx.$queryRaw<Inventory[]>`
      SELECT id, "productId", "warehouseId", "totalStock", "reservedStock"
      FROM "Inventory"
      WHERE "productId" = ${reservation.productId} AND "warehouseId" = ${reservation.warehouseId}
      LIMIT 1
      FOR UPDATE
    `;

    if (!inventories || inventories.length === 0) {
      throw new ReservationError('NOT_FOUND', 'Associated inventory row not found.');
    }

    const inventory = inventories[0];

    // 3. Decrement reservedStock by the reservation quantity
    // (Note: We do not modify totalStock because the purchase was canceled/released)
    await tx.inventory.update({
      where: { id: inventory.id },
      data: {
        reservedStock: {
          decrement: Math.min(inventory.reservedStock, reservation.quantity),
        },
      },
    });

    // 4. Mark the reservation as RELEASED
    const updatedReservation = await tx.reservation.update({
      where: { id: reservationId },
      data: {
        status: ReservationStatus.RELEASED,
      },
    });

    return updatedReservation;
  });
}

/**
 * Automatically releases all pending reservations that have expired.
 * Each reservation is processed in a separate transaction to avoid long-lived database locks
 * and ensure that failures in one cleanup do not affect others.
 */
export async function releaseExpiredReservations(): Promise<{ releasedCount: number }> {
  // 1. Find all expired pending reservations
  const expiredPending = await prisma.reservation.findMany({
    where: {
      status: ReservationStatus.PENDING,
      expiresAt: {
        lt: new Date(),
      },
    },
  });

  let releasedCount = 0;

  // 2. Release each one in isolated transactions
  for (const res of expiredPending) {
    try {
      await releaseReservation(res.id);
      releasedCount++;
    } catch (err) {
      console.error(`Failed to automatically release expired reservation ${res.id}:`, err);
    }
  }

  return { releasedCount };
}
