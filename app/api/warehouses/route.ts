import { NextResponse } from 'next/server';
import { getWarehouses } from '@/lib/inventory-service';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const warehouses = await getWarehouses();
    return NextResponse.json(warehouses);
  } catch (error) {
    console.error('Error fetching warehouses:', error);
    return NextResponse.json({ error: 'Failed to fetch warehouses' }, { status: 500 });
  }
}
