import { NextResponse } from 'next/server';
import { z } from 'zod';
import { reserveStock, ReservationError } from '@/lib/reservation-service';

const createReservationSchema = z.object({
  productId: z.string().min(1, 'Product ID is required'),
  warehouseId: z.string().min(1, 'Warehouse ID is required'),
  quantity: z.number().int().positive('Quantity must be a positive integer'),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = createReservationSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: result.error.format() },
        { status: 400 }
      );
    }

    const { productId, warehouseId, quantity } = result.data;
    const reservation = await reserveStock(productId, warehouseId, quantity);

    return NextResponse.json(reservation, { status: 201 });
  } catch (error) {
    if (error instanceof ReservationError) {
      if (error.code === 'INSUFFICIENT_STOCK') {
        return NextResponse.json({ error: 'Insufficient stock available' }, { status: 409 });
      }
      if (error.code === 'NOT_FOUND') {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error('Failed to create reservation:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
