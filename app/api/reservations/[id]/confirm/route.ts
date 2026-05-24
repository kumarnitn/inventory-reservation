import { NextResponse } from 'next/server';
import { confirmReservation, ReservationError } from '@/lib/reservation-service';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const reservation = await confirmReservation(id);

    return NextResponse.json(reservation, { status: 200 });
  } catch (error) {
    if (error instanceof ReservationError) {
      if (error.code === 'EXPIRED') {
        return NextResponse.json({ error: 'Reservation expired' }, { status: 410 });
      }
      if (error.code === 'NOT_FOUND') {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error(`Failed to confirm reservation:`, error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
