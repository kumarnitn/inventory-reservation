import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const reservation = await prisma.reservation.findUnique({
      where: { id },
      include: {
        product: {
          select: {
            name: true,
            description: true,
          },
        },
        warehouse: {
          select: {
            name: true,
            location: true,
          },
        },
      },
    });

    if (!reservation) {
      return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });
    }

    return NextResponse.json(reservation);
  } catch (error) {
    console.error(`Error fetching reservation:`, error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 555 });
  }
}
