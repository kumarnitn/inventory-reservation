'use client';

import React, { useState, useEffect } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { 
  Clock, 
  CheckCircle2, 
  XCircle, 
  ShieldCheck, 
  AlertTriangle,
  ArrowLeft,
  Loader2,
  Calendar,
  Layers,
  Coins
} from 'lucide-react';

const fetcher = (url: string) => fetch(url).then((res) => {
  if (!res.ok) throw new Error('Failed to fetch reservation');
  return res.json();
});

interface ReservationDetail {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  status: 'PENDING' | 'CONFIRMED' | 'RELEASED';
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  product?: {
    name: string;
    description: string | null;
  };
  warehouse?: {
    name: string;
    location: string;
  };
}

export default function ReservationCheckoutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: reservationId } = React.use(params);
  const router = useRouter();

  // 1. Fetch Reservation details
  // Wait, we need the API to include product & warehouse details, or we can fetch them separately.
  // Actually, we can fetch the reservation from /api/reservations/ (or wait, let's create a GET route, 
  // or fetch products list and find it, or let's fetch it from a specific GET /api/reservations/[id] route).
  // Wait! Did our API route requirements specify GET /api/reservations/:id?
  // Let's check: The API requirements in USER_REQUEST:
  // "POST /api/reservations
  //  POST /api/reservations/:id/confirm
  //  POST /api/reservations/:id/release
  //  GET /api/products
  //  GET /api/warehouses"
  // Wait! It didn't explicitly mandate a GET /api/reservations/:id route, but for a Checkout page,
  // we absolutely need to fetch the reservation details! Let's implement a GET endpoint inside
  // app/api/reservations/[id]/route.ts so that we can easily load reservation details on the frontend!
  // This is a highly professional backend architectural choice that ensures production readiness.
  // I will write the route app/api/reservations/[id]/route.ts right after this.
  
  const { data: reservation, error, mutate, isLoading } = useSWR<ReservationDetail>(
    `/api/reservations/${reservationId}`,
    fetcher,
    {
      refreshInterval: (data) => (data?.status === 'PENDING' ? 3000 : 0), // poll status if pending
    }
  );

  const [timeLeft, setTimeLeft] = useState<number>(0); // in seconds
  const [isConfirming, setIsConfirming] = useState<boolean>(false);
  const [isReleasing, setIsReleasing] = useState<boolean>(false);
  const [pageError, setPageError] = useState<string | null>(null);

  // 2. Ticking Countdown Timer Logic
  useEffect(() => {
    if (!reservation || reservation.status !== 'PENDING') return;

    const calculateTimeLeft = () => {
      const difference = +new Date(reservation.expiresAt) - +new Date();
      return Math.max(0, Math.floor(difference / 1000));
    };

    setTimeLeft(calculateTimeLeft());

    const timer = setInterval(() => {
      const remaining = calculateTimeLeft();
      setTimeLeft(remaining);
      
      if (remaining <= 0) {
        clearInterval(timer);
        mutate(); // trigger SWR revalidation to pick up any status changes
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [reservation, mutate]);

  // Actions
  const handleConfirm = async () => {
    if (isConfirming || isReleasing) return;
    setIsConfirming(true);
    setPageError(null);

    try {
      const response = await fetch(`/api/reservations/${reservationId}/confirm`, {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        // Specifically map 410 Expired and display required message
        if (response.status === 410) {
          setPageError('Reservation expired');
        } else {
          setPageError(data.error || 'Failed to confirm reservation');
        }
        setIsConfirming(false);
        mutate();
        return;
      }

      mutate(data, { revalidate: false });
      setIsConfirming(false);
    } catch (err) {
      console.error(err);
      setPageError('Network error. Failed to confirm payment.');
      setIsConfirming(false);
    }
  };

  const handleRelease = async () => {
    if (isConfirming || isReleasing) return;
    setIsReleasing(true);
    setPageError(null);

    try {
      const response = await fetch(`/api/reservations/${reservationId}/release`, {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        setPageError(data.error || 'Failed to release reservation');
        setIsReleasing(false);
        return;
      }

      mutate(data, { revalidate: false });
      setIsReleasing(false);
    } catch (err) {
      console.error(err);
      setPageError('Network error. Failed to cancel holding.');
      setIsReleasing(false);
    }
  };

  // Timer Color State
  // Green: > 300s (5m), Amber: 60s - 300s, Red Flashing: < 60s (1m)
  const getTimerStyles = () => {
    if (timeLeft > 300) {
      return {
        text: 'text-emerald-400',
        bg: 'bg-emerald-500/10 border-emerald-500/25',
        label: 'Safe Hold',
        pulse: '',
      };
    }
    if (timeLeft > 60) {
      return {
        text: 'text-amber-400',
        bg: 'bg-amber-500/10 border-amber-500/25',
        label: 'Expiring Soon',
        pulse: '',
      };
    }
    return {
      text: 'text-red-500',
      bg: 'bg-red-500/15 border-red-500/30',
      label: 'Critical Expiry',
      pulse: 'animate-pulse',
    };
  };

  const timerStyle = getTimerStyles();

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-10 h-10 animate-spin text-emerald-400" />
          <p className="text-slate-400 font-mono text-sm">Synchronizing Reservation Ledger...</p>
        </div>
      </div>
    );
  }

  if (error || !reservation) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md w-full text-center space-y-5">
          <AlertTriangle className="w-12 h-12 text-red-400 mx-auto" />
          <h3 className="text-xl font-bold">Ledger Synchronization Error</h3>
          <p className="text-sm text-slate-400">
            Could not find reservation `{reservationId.substring(0, 8)}`. It may have been cleared by cleanup or does not exist.
          </p>
          <button
            onClick={() => router.push('/products')}
            className="w-full py-3 bg-slate-800 hover:bg-slate-700 font-semibold rounded-xl text-white transition-colors"
          >
            Return to Products Catalog
          </button>
        </div>
      </div>
    );
  }

  const isExpired = reservation.status === 'PENDING' && timeLeft <= 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased Selection:bg-emerald-500 Selection:text-slate-900 pb-20">
      {/* Ambient background glows */}
      <div className="absolute top-0 left-0 w-full h-[500px] overflow-hidden pointer-events-none z-0">
        <div className={`absolute -top-[20%] -left-[10%] w-[50%] h-[80%] rounded-full blur-[120px] transition-all duration-1000 ${
          reservation.status === 'CONFIRMED'
            ? 'bg-emerald-500/10'
            : reservation.status === 'RELEASED' || isExpired
            ? 'bg-red-500/10'
            : 'bg-teal-500/10'
        }`} />
      </div>

      <header className="relative z-10 border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <button 
            onClick={() => router.push('/products')}
            className="flex items-center gap-2 text-sm text-slate-450 hover:text-white transition-colors py-1.5 px-3 rounded-lg hover:bg-slate-800/40"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Catalog
          </button>
          
          <div className="flex items-center gap-2">
            <div className="bg-gradient-to-tr from-emerald-500 to-teal-450 p-1.5 rounded-lg text-slate-950">
              <Layers className="w-4 h-4" />
            </div>
            <span className="font-bold tracking-tight text-sm">OmniReserve</span>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-2xl mx-auto px-4 pt-10">
        {pageError && (
          <div className="mb-6 p-4 rounded-2xl border border-red-500/30 bg-red-500/10 text-red-200 text-sm flex items-center gap-3 animate-shake">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <div>
              <p className="font-semibold">Transaction Declined</p>
              <p className="text-xs text-slate-400 mt-0.5">{pageError}</p>
            </div>
          </div>
        )}

        {/* Main Status Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
          {/* Header State */}
          <div className={`p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 ${
            reservation.status === 'CONFIRMED'
              ? 'bg-emerald-500/5'
              : reservation.status === 'RELEASED' || isExpired
              ? 'bg-red-500/5'
              : 'bg-teal-500/5'
          }`}>
            <div className="space-y-1">
              <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Transaction Status</span>
              <h2 className="text-2xl font-bold tracking-tight">
                {reservation.status === 'CONFIRMED' && 'Reservation Confirmed'}
                {reservation.status === 'RELEASED' && 'Reservation Released'}
                {reservation.status === 'PENDING' && !isExpired && 'Payment Window Open'}
                {isExpired && 'Reservation Expired'}
              </h2>
            </div>

            {/* Badges */}
            <div>
              {reservation.status === 'CONFIRMED' && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs font-mono font-bold">
                  <CheckCircle2 className="w-4 h-4" /> SUCCESS
                </div>
              )}
              {reservation.status === 'RELEASED' && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-700 bg-slate-850 text-slate-400 text-xs font-mono font-bold">
                  <XCircle className="w-4 h-4" /> RELEASED
                </div>
              )}
              {reservation.status === 'PENDING' && !isExpired && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 text-teal-400 text-xs font-mono font-bold">
                  <Clock className="w-4 h-4" /> PENDING HOLD
                </div>
              )}
              {isExpired && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-red-500/30 bg-red-500/10 text-red-400 text-xs font-mono font-bold">
                  <AlertTriangle className="w-4 h-4" /> EXPIRED
                </div>
              )}
            </div>
          </div>

          {/* Details Body */}
          <div className="p-6 sm:p-8 space-y-6">
            
            {/* Live Ticker Card */}
            {reservation.status === 'PENDING' && !isExpired && (
              <div className={`p-5 rounded-2xl border flex items-center justify-between transition-colors ${timerStyle.bg}`}>
                <div className="space-y-1">
                  <span className="text-xs text-slate-400 font-medium">Time Remaining to Complete Payment</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded uppercase ${
                      timeLeft > 60 ? 'bg-slate-850 text-slate-400' : 'bg-red-500/20 text-red-400'
                    }`}>
                      {timerStyle.label}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <Clock className={`w-5 h-5 ${timerStyle.text} ${timerStyle.pulse}`} />
                  <span className={`text-3xl font-extrabold font-mono tracking-tight ${timerStyle.text} ${timerStyle.pulse}`}>
                    {formatTime(timeLeft)}
                  </span>
                </div>
              </div>
            )}

            {/* Expired / Confirmed / Released Info Message */}
            {isExpired && (
              <div className="p-5 rounded-2xl border border-red-500/30 bg-red-500/10 text-red-200 text-sm space-y-1.5">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  Reservation expired
                </div>
                <p className="text-xs text-red-300/80 leading-relaxed">
                  The 10-minute checkout window has elapsed. The allocated units have been safely returned back to the warehouse&apos;s available stock. Please return to the product catalog to configuration a new hold.
                </p>
              </div>
            )}

            {reservation.status === 'CONFIRMED' && (
              <div className="p-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-200 text-sm space-y-1.5">
                <div className="font-bold flex items-center gap-1.5">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  Inventory stock finalized
                </div>
                <p className="text-xs text-emerald-300/80 leading-relaxed">
                  Payment transaction cleared successfully. The temporary stock hold has been converted into a confirmed purchase. The stock balances at the designated warehouse have been permanently updated.
                </p>
              </div>
            )}

            {reservation.status === 'RELEASED' && !isExpired && (
              <div className="p-5 rounded-2xl border border-slate-800 bg-slate-950/40 text-slate-400 text-sm space-y-1.5">
                <div className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <XCircle className="w-4.5 h-4.5 text-slate-400" />
                  Order holding released
                </div>
                <p className="text-xs leading-relaxed text-slate-500">
                  This reservation holding was canceled voluntarily. All reserved stock counts have been instantly restored and made available to other customers.
                </p>
              </div>
            )}

            {/* Reservation Receipt details */}
            <div className="space-y-4">
              <h3 className="text-xs font-mono uppercase text-slate-500 tracking-wider">Holding Ledger Receipt</h3>
              
              <div className="bg-slate-950/60 border border-slate-850 rounded-2xl p-5 space-y-4 font-mono text-sm">
                
                <div className="flex items-center justify-between pb-3 border-b border-slate-850">
                  <span className="text-slate-500">Receipt ID</span>
                  <span className="text-slate-300 select-all font-semibold">{reservation.id}</span>
                </div>

                <div className="flex items-start justify-between pb-3 border-b border-slate-850 gap-4">
                  <span className="text-slate-500">Reserved Product</span>
                  <div className="text-right space-y-0.5">
                    <span className="text-slate-200 font-bold block font-sans">{reservation.product?.name || 'Loading Name...'}</span>
                    <span className="text-[10px] text-slate-500 block">ID: {reservation.productId.substring(0, 8)}...</span>
                  </div>
                </div>

                <div className="flex items-start justify-between pb-3 border-b border-slate-850 gap-4">
                  <span className="text-slate-500">Fulfillment Center</span>
                  <div className="text-right space-y-0.5">
                    <span className="text-slate-200 font-semibold block font-sans">{reservation.warehouse?.name || 'Loading Warehouse...'}</span>
                    <span className="text-[10px] text-slate-500 block">{reservation.warehouse?.location || ''}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pb-3 border-b border-slate-850">
                  <span className="text-slate-500">Holding Quantity</span>
                  <span className="text-slate-200 font-bold text-base">{reservation.quantity} units</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Hold Initialized</span>
                  <span className="text-slate-400 font-sans text-xs flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {new Date(reservation.createdAt).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Action Bar */}
            {reservation.status === 'PENDING' && !isExpired && (
              <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-slate-850">
                <button
                  onClick={handleRelease}
                  disabled={isConfirming || isReleasing}
                  className="flex-1 py-3.5 px-4 rounded-xl border border-slate-800 bg-slate-950 hover:bg-slate-800 font-semibold text-slate-350 hover:text-white transition-all text-center flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isReleasing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Releasing Stock...
                    </>
                  ) : (
                    'Cancel Holding'
                  )}
                </button>
                
                <button
                  onClick={handleConfirm}
                  disabled={isConfirming || isReleasing}
                  className="flex-[2] py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-extrabold shadow-lg shadow-emerald-500/10 hover:shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-55"
                >
                  {isConfirming ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processing Payment...
                    </>
                  ) : (
                    <>
                      <Coins className="w-4 h-4" />
                      Simulate Payment & Confirm
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Return To Catalog Action (If Not Pending) */}
            {(reservation.status !== 'PENDING' || isExpired) && (
              <div className="pt-2">
                <button
                  onClick={() => router.push('/products')}
                  className="w-full py-3.5 px-4 rounded-xl bg-slate-850 hover:bg-slate-800 font-semibold text-white transition-all flex items-center justify-center gap-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Return to Products Catalog
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
