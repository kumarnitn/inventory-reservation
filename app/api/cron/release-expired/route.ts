import { NextResponse } from 'next/server';
import { releaseExpiredReservations } from '@/lib/reservation-service';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const result = await releaseExpiredReservations();
    return NextResponse.json({
      success: true,
      message: `Released ${result.releasedCount} expired reservations.`,
      ...result,
    });
  } catch (error) {
    console.error('Failed to run automatic release cron:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Support GET for testing convenience, though POST is preferred
export async function GET() {
  return POST();
}
