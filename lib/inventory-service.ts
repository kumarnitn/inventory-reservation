import prisma from './prisma';

export interface ProductWithWarehouseStock {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  warehouses: {
    inventoryId: string;
    warehouseId: string;
    warehouseName: string;
    location: string;
    totalStock: number;
    reservedStock: number;
    availableStock: number;
  }[];
}

/**
 * Fetches all products, including their stock details in each warehouse.
 * Computes available stock dynamically as (totalStock - reservedStock).
 */
export async function getAllProducts(): Promise<ProductWithWarehouseStock[]> {
  const products = await prisma.product.findMany({
    include: {
      inventory: {
        include: {
          warehouse: true,
        },
        orderBy: {
          warehouse: {
            name: 'asc',
          },
        },
      },
    },
    orderBy: {
      name: 'asc',
    },
  });

  return products.map((product) => ({
    id: product.id,
    name: product.name,
    description: product.description,
    createdAt: product.createdAt,
    warehouses: product.inventory.map((inv) => ({
      inventoryId: inv.id,
      warehouseId: inv.warehouse.id,
      warehouseName: inv.warehouse.name,
      location: inv.warehouse.location,
      totalStock: inv.totalStock,
      reservedStock: inv.reservedStock,
      availableStock: inv.totalStock - inv.reservedStock,
    })),
  }));
}

/**
 * Fetches all available warehouses in the system.
 */
export async function getWarehouses() {
  return prisma.warehouse.findMany({
    orderBy: {
      name: 'asc',
    },
  });
}
