'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { 
  Package, 
  Warehouse as WarehouseIcon, 
  Layers, 
  AlertTriangle, 
  Clock, 
  CheckCircle2, 
  ArrowRight,
  TrendingUp,
  Loader2,
  RefreshCw
} from 'lucide-react';

const fetcher = (url: string) => fetch(url).then((res) => {
  if (!res.ok) throw new Error('Failed to fetch');
  return res.json();
});

interface WarehouseStock {
  inventoryId: string;
  warehouseId: string;
  warehouseName: string;
  location: string;
  totalStock: number;
  reservedStock: number;
  availableStock: number;
}

interface Product {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  warehouses: WarehouseStock[];
}

export default function ProductsPage() {
  const { data: products, error, isLoading, mutate } = useSWR<Product[]>('/api/products', fetcher, {
    refreshInterval: 5000, // auto-refresh every 5 seconds for semi-live updates
  });

  const router = useRouter();
  
  // Reservation Modal / Panel State
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedWarehouse = selectedProduct?.warehouses.find(
    (w) => w.warehouseId === selectedWarehouseId
  );

  const maxAvailable = selectedWarehouse ? selectedWarehouse.availableStock : 0;

  const handleOpenReserve = (product: Product) => {
    setSelectedProduct(product);
    // Auto-select first warehouse with stock, or just first one
    const firstWarehouse = product.warehouses[0];
    setSelectedWarehouseId(firstWarehouse?.warehouseId ?? '');
    setQuantity(1);
    setErrorMessage(null);
  };

  const handleCloseReserve = () => {
    setSelectedProduct(null);
    setSelectedWarehouseId('');
    setQuantity(1);
    setErrorMessage(null);
  };

  const handleReserveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || !selectedWarehouseId) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/reservations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productId: selectedProduct.id,
          warehouseId: selectedWarehouseId,
          quantity: Number(quantity),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Specifically map 409 Insufficient Stock and display required message
        if (response.status === 409) {
          setErrorMessage('Insufficient stock available');
        } else {
          setErrorMessage(data.error || 'Failed to create reservation');
        }
        setIsSubmitting(false);
        return;
      }

      // Success: Mutate SWR cache and redirect to checkout page
      mutate();
      router.push(`/reservations/${data.id}`);
    } catch (err) {
      console.error(err);
      setErrorMessage('Network error. Please try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased Selection:bg-emerald-500 Selection:text-slate-900 pb-20">
      {/* Dynamic Ambient Background Gradients */}
      <div className="absolute top-0 left-0 w-full h-[500px] overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[80%] rounded-full bg-emerald-500/10 blur-[120px]" />
        <div className="absolute -top-[10%] -right-[10%] w-[40%] h-[70%] rounded-full bg-teal-500/10 blur-[120px]" />
      </div>

      <header className="relative z-10 border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-tr from-emerald-500 to-teal-400 p-2 rounded-xl text-slate-950 shadow-lg shadow-emerald-500/20">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
                OmniReserve
              </h1>
              <p className="text-[10px] text-slate-400 font-mono tracking-widest uppercase">Multi-Warehouse Inventory</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button 
              onClick={() => mutate()} 
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/50 transition-colors flex items-center gap-2 text-sm border border-slate-800 bg-slate-950/40"
              title="Refresh stock levels"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Sync Stock</span>
            </button>
            <div className="h-4 w-[1px] bg-slate-800" />
            <div className="flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              System Live
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        {/* Dashboard Title Card */}
        <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-6 sm:p-8 backdrop-blur-sm mb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 text-xs font-mono border border-slate-700">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> Real-time Dashboard
            </div>
            <h2 className="text-3xl font-extrabold tracking-tight">Stock Control Catalog</h2>
            <p className="text-slate-400 max-w-xl">
              Monitor active product levels, check real-time warehouse distributions, and reserve stock securely. Reservations hold items for 10 minutes.
            </p>
          </div>
          
          <div className="grid grid-cols-2 gap-4 w-full md:w-auto">
            <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 text-center">
              <div className="text-2xl font-bold font-mono text-emerald-400">
                {products ? products.length : '0'}
              </div>
              <div className="text-xs text-slate-500">Tracked Products</div>
            </div>
            <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 text-center">
              <div className="text-2xl font-bold font-mono text-teal-400">3</div>
              <div className="text-xs text-slate-500">Warehouses</div>
            </div>
          </div>
        </div>

        {/* Error State Banner */}
        {error && (
          <div className="mb-8 p-4 rounded-2xl border border-red-500/30 bg-red-500/10 text-red-200 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <p className="text-sm">Failed to connect to the backend system. Please verify database migrations are complete and try refreshing.</p>
          </div>
        )}

        {/* Loading Skeleton */}
        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="bg-slate-900/30 border border-slate-850 rounded-2xl p-6 h-80 animate-pulse space-y-4">
                <div className="h-6 w-2/3 bg-slate-800 rounded-md" />
                <div className="h-4 w-full bg-slate-800 rounded-md" />
                <div className="h-4 w-5/6 bg-slate-800 rounded-md" />
                <div className="space-y-2 pt-4">
                  <div className="h-10 w-full bg-slate-800 rounded-xl" />
                  <div className="h-10 w-full bg-slate-800 rounded-xl" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Product Cards Grid */}
        {!isLoading && products && (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {products.map((product) => (
              <div 
                key={product.id} 
                className="group relative bg-slate-900/30 hover:bg-slate-900/50 border border-slate-800 hover:border-slate-700 rounded-3xl p-6 transition-all duration-300 flex flex-col justify-between backdrop-blur-sm"
              >
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="bg-slate-800 p-2.5 rounded-2xl text-slate-300 group-hover:text-emerald-400 group-hover:bg-emerald-500/10 transition-colors">
                      <Package className="w-6 h-6" />
                    </div>
                    <div className="text-[10px] font-mono text-slate-500 bg-slate-950 px-2.5 py-1 rounded-full border border-slate-850">
                      ID: {product.id.substring(0, 8)}...
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="text-xl font-bold tracking-tight text-white group-hover:text-emerald-300 transition-colors">
                      {product.name}
                    </h3>
                    <p className="text-sm text-slate-400 mt-2 line-clamp-2 leading-relaxed">
                      {product.description || 'No product description provided.'}
                    </p>
                  </div>

                  {/* Warehouses stock table */}
                  <div className="pt-4 border-t border-slate-850 space-y-3">
                    <h4 className="text-xs font-mono uppercase text-slate-500 tracking-wider">Warehouse Distribution</h4>
                    
                    <div className="space-y-2">
                      {product.warehouses.map((wh) => (
                        <div 
                          key={wh.warehouseId} 
                          className={`p-3 rounded-xl border flex items-center justify-between transition-colors ${
                            wh.availableStock > 0 
                              ? 'border-slate-800 bg-slate-950/40 hover:bg-slate-950/80' 
                              : 'border-red-950/30 bg-red-950/10 opacity-70'
                          }`}
                        >
                          <div className="space-y-0.5 max-w-[50%]">
                            <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-200">
                              <WarehouseIcon className="w-3.5 h-3.5 text-slate-400" />
                              <span className="truncate">{wh.warehouseName}</span>
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono">{wh.location}</div>
                          </div>

                          <div className="flex items-center gap-4 text-right">
                            <div className="space-y-0.5">
                              <div className="text-xs text-slate-500">Available</div>
                              <div className={`font-mono text-sm font-bold ${
                                wh.availableStock > 5
                                  ? 'text-emerald-400'
                                  : wh.availableStock > 0
                                  ? 'text-amber-400'
                                  : 'text-red-500'
                              }`}>
                                {wh.availableStock} <span className="text-[10px] font-normal text-slate-500">/ {wh.totalStock}</span>
                              </div>
                            </div>

                            {wh.reservedStock > 0 && (
                              <div className="space-y-0.5">
                                <div className="text-xs text-slate-500">Held</div>
                                <div className="text-xs text-teal-400 font-mono font-semibold">
                                  {wh.reservedStock}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="pt-6 mt-6 border-t border-slate-850">
                  <button
                    onClick={() => handleOpenReserve(product)}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md shadow-emerald-500/10 hover:shadow-emerald-500/25 transition-all duration-300 active:scale-[0.98]"
                  >
                    Configure Reservation <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty Catalog State */}
        {!isLoading && products?.length === 0 && (
          <div className="text-center py-20 bg-slate-900/20 border border-slate-800 rounded-3xl max-w-md mx-auto space-y-4">
            <Package className="w-12 h-12 text-slate-500 mx-auto" />
            <h3 className="text-lg font-bold">No Products Seeded</h3>
            <p className="text-slate-400 text-sm">
              The product database appears to be empty. Run the migrations and database seeder script to initialize the project catalog.
            </p>
          </div>
        )}
      </main>

      {/* Reservation Drawer / Modal Overlay */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-3xl shadow-2xl p-6 sm:p-8 space-y-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-[6px] bg-gradient-to-r from-emerald-500 to-teal-400" />
            
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <span className="text-[10px] font-mono text-emerald-400 font-bold tracking-wider uppercase">Temporary Reservation</span>
                <h3 className="text-xl font-bold tracking-tight">{selectedProduct.name}</h3>
              </div>
              <button 
                onClick={handleCloseReserve}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors text-xs font-mono"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleReserveSubmit} className="space-y-5">
              {errorMessage && (
                <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-200 text-sm flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
                  <p>{errorMessage}</p>
                </div>
              )}

              {/* Warehouse selector */}
              <div className="space-y-2">
                <label className="block text-xs font-mono text-slate-450 uppercase">Select Target Warehouse</label>
                <select
                  value={selectedWarehouseId}
                  onChange={(e) => {
                    setSelectedWarehouseId(e.target.value);
                    setQuantity(1);
                    setErrorMessage(null);
                  }}
                  className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl py-3 px-4 focus:outline-none focus:border-emerald-500 transition-colors font-semibold"
                  required
                >
                  {selectedProduct.warehouses.map((wh) => (
                    <option 
                      key={wh.warehouseId} 
                      value={wh.warehouseId}
                      disabled={wh.availableStock <= 0}
                    >
                      {wh.warehouseName} ({wh.location}) — Available: {wh.availableStock}
                    </option>
                  ))}
                </select>
              </div>

              {/* Stock display */}
              {selectedWarehouse && (
                <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-850 flex items-center justify-between text-sm">
                  <div className="space-y-0.5">
                    <span className="text-slate-500 block text-xs font-mono uppercase">Warehouse Stock Available</span>
                    <span className="font-bold text-white text-base">{selectedWarehouse.availableStock} units</span>
                  </div>
                  <div className="text-xs font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-full flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" /> 10-Min Hold Limit
                  </div>
                </div>
              )}

              {/* Quantity Selector */}
              <div className="space-y-2">
                <label className="block text-xs font-mono text-slate-450 uppercase">Select Quantity</label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    disabled={quantity <= 1 || maxAvailable <= 0}
                    className="w-12 h-12 rounded-xl border border-slate-800 bg-slate-950 hover:bg-slate-800 disabled:opacity-40 transition-colors flex items-center justify-center text-lg font-bold font-mono"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min="1"
                    max={maxAvailable > 0 ? maxAvailable : 1}
                    value={quantity}
                    onChange={(e) => setQuantity(Math.min(maxAvailable, Math.max(1, parseInt(e.target.value) || 1)))}
                    className="h-12 flex-1 bg-slate-950 border border-slate-800 text-center text-white rounded-xl text-lg font-bold font-mono focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    disabled={maxAvailable <= 0}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.min(maxAvailable, q + 1))}
                    disabled={quantity >= maxAvailable || maxAvailable <= 0}
                    className="w-12 h-12 rounded-xl border border-slate-800 bg-slate-950 hover:bg-slate-800 disabled:opacity-40 transition-colors flex items-center justify-center text-lg font-bold font-mono"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="bg-slate-950/20 p-4 rounded-xl text-xs text-slate-400 space-y-1 bg-slate-950/40 border border-slate-850">
                <span className="font-semibold text-slate-300 block mb-1 flex items-center gap-1.5 text-slate-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Transaction Row-Lock System
                </span>
                Our checkout locks the row via <code className="bg-slate-800 text-emerald-300 px-1 py-0.5 rounded font-mono">SELECT FOR UPDATE</code>. If another client acquires the last unit at the same millisecond, exactly one succeeds and the other fails safely.
              </div>

              {/* Action buttons */}
              <div className="flex gap-4 pt-2">
                <button
                  type="button"
                  onClick={handleCloseReserve}
                  className="flex-1 py-3 px-4 rounded-xl border border-slate-800 bg-slate-950 hover:bg-slate-800 hover:text-white font-semibold text-slate-350 transition-all text-center"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-[2] py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold shadow-md transition-all flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-55"
                  disabled={isSubmitting || maxAvailable <= 0}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Reserving Stock...
                    </>
                  ) : (
                    'Confirm Temporary Hold'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
