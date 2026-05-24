# OmniReserve: Multi-Warehouse Inventory Reservation System

OmniReserve is a production-grade, highly concurrent multi-warehouse inventory reservation system built for a technical engineering assessment. The core system guarantees race-condition-safe inventory holds using **PostgreSQL row-level locking (`SELECT FOR UPDATE`)** inside isolated database transactions.

---

## 🚀 Architectural & Concurrency Strategy (Crucial Evaluation)

### Why "SELECT FOR UPDATE" Prevents Overselling
In multi-node, serverless, or multi-instance systems (like Vercel deployments), multiple HTTP threads run concurrently. Under high traffic, naive check-and-update logic suffers from **race conditions** (the "double-spend" problem) because the database reads are separated from the writes:

1. **Client A** reads available stock for Headphones in SV Warehouse: `1` unit.
2. **Client B** (at the exact same millisecond) reads available stock for the same item: `1` unit.
3. Both clients' service threads calculate `1 >= 1` and decide there is enough stock.
4. **Client A** updates reserved stock to `1` and creates reservation. (Succeeds)
5. **Client B** updates reserved stock to `2` and creates reservation. (Succeeds)
6. ❌ **Oversold error**: The warehouse had only 1 unit, but 2 units are now reserved.

#### The Solution: Serialized Row Locking
To make the system bulletproof, we implement a **PostgreSQL Row-Level Lock** inside a strict database transaction. When Client A executes a reservation, we query the row using `FOR UPDATE`:

```sql
SELECT id, "productId", "warehouseId", "totalStock", "reservedStock"
FROM "Inventory"
WHERE "productId" = $1 AND "warehouseId" = $2
LIMIT 1
FOR UPDATE;
```

- **Blocking Behavior**: When PostgreSQL executes `FOR UPDATE`, it acquires an exclusive write-lock on that specific `Inventory` row.
- **Serialization**: If Client B tries to query, update, or acquire a lock on the *same* inventory row, PostgreSQL forces Client B's query to **block** (wait) until Client A's transaction either `COMMITS` or `ROLLBACKS`.
- **Accurate Reads**: Once Client A's transaction commits (incrementing `reservedStock` to 1), Client B's block is released. Client B then reads the updated state where available stock is `0` and immediately fails with a clean `409 Conflict` ("Insufficient stock available").

This strategy is highly scalable, requires zero in-memory locking (which fails across multiple server instances), and relies entirely on database engine ACID properties.

---

## ⏰ Expiry Mechanism (10-Minute Holds)

When a user proceeds to checkout, the stock is temporarily allocated to them with a `PENDING` reservation status and an `expiresAt` timestamp set to exactly `now + 10 minutes`.

1. **Successful Payment**: When the user pays, we execute a transaction that:
   - Permanently deducts the quantity from `totalStock`.
   - Decrements the quantity from `reservedStock`.
   - Marks the status as `CONFIRMED`.
2. **Cancellation or Expiration**:
   - **Manual Cancel**: If a user cancels, we decrement `reservedStock` and mark the status `RELEASED`.
   - **Cron Cleanup**: We expose a secure endpoint `POST /api/cron/release-expired` designed to be triggered by a Vercel Cron or server schedule. The cron finds all `PENDING` reservations where `expiresAt < NOW()`.
   - **Isolated Transactions**: To prevent table-wide locks and database deadlocks, the cron loops through expired reservations and releases them **one-by-one inside individual, isolated transactions**. If one release fails, others still proceed cleanly.

---

## 🛠️ Technology Stack
- **Framework**: Next.js 15 (App Router, Server Actions, Client Components)
- **Language**: TypeScript (Strict typing enabled)
- **Database ORM**: Prisma ORM v6
- **Database**: PostgreSQL (Fully compatible with Neon, Supabase, or native local setups)
- **Validation**: Zod (Runtime API payload validation)
- **State Management & Caching**: SWR (For real-time dashboard stock updates and receipt polling)
- **Styling**: Tailwind CSS & Lucide Icons (Premium Glassmorphic Dark UI)

---

## 📂 Project Structure

```text
├── app/
│   ├── api/
│   │   ├── cron/
│   │   │   └── release-expired/route.ts   # Auto-expiry cron API
│   │   ├── products/route.ts              # Fetch catalog & stock list
│   │   ├── warehouses/route.ts            # Fetch warehouses
│   │   └── reservations/
│   │       ├── route.ts                   # Create reservation (SELECT FOR UPDATE)
│   │       └── [id]/
│   │           ├── route.ts               # GET individual reservation details
│   │           ├── confirm/route.ts       # Confirm reservation (410 handling)
│   │           └── release/route.ts       # Voluntary cancel reservation
│   ├── products/
│   │   └── page.tsx                       # Real-time catalog & hold selector UI
│   ├── reservations/
│   │   └── [id]/
│   │       └── page.tsx                   # Checkout page with live countdown timer
│   └── page.tsx                           # Redirects traffic to /products
├── lib/
│   ├── prisma.ts                          # Prisma Client Singleton
│   ├── inventory-service.ts               # Inventory service layers
│   └── reservation-service.ts             # Transaction & locking service layers
├── prisma/
│   ├── schema.prisma                      # Prisma schema with 5 core models
│   └── seed.ts                            # Diverse seeding configuration
└── scripts/
    └── test-concurrency.ts                # Concurrency stress tester
```

---

## ⚙️ Setup & Local Installation

### 1. Prerequisites
- Node.js v18.x or later
- Local PostgreSQL installed and running (or a Supabase / Neon connection string)

### 2. Configure Environment Variables
Create a `.env` file in the root directory:

```env
DATABASE_URL="postgresql://USERNAME:PASSWORD@localhost:5432/DATABASE_NAME?schema=public"
```

*Note: For macOS users running PostgreSQL via Homebrew, the default URL is typically:*
`DATABASE_URL="postgresql://localhost:5432/inventory_reservation_db?schema=public"`

### 3. Install Dependencies
```bash
npm install
```

### 4. Create Database and Run Migrations
This will create all tables, indexes, and generate the Prisma Client types:
```bash
npx prisma migrate dev --name init
```

### 5. Seed the Catalog Data
Seeds 5 products, 3 warehouses, and maps varying stock limits (including low and zero stock edge cases):
```bash
npx prisma db seed
```

### 6. Start the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser to view the application.

---

## 🧪 Automated Concurrency & Race Condition Testing

We have built a dedicated **concurrency stress-tester** located in `scripts/test-concurrency.ts`. 

The script tests the system under load by:
1. Locating the seeded "Ultra Wireless Headphones" in Silicon Valley which has **exactly 2 units in stock**.
2. Resetting the inventory state.
3. Launching **5 parallel database transactions concurrently** (via `Promise.all`), trying to acquire `1` unit each.
4. Assisting that **exactly 2 succeed** and **exactly 3 fail with an `INSUFFICIENT_STOCK` error**.

### To Run the Concurrency Test:
```bash
npx tsx scripts/test-concurrency.ts
```

#### Example Test Output:
```text
=== STARTING CONCURRENCY STRESS TEST ===
Initial stock levels:
- Total Stock: 2
- Reserved Stock: 0
- Available Stock: 2

Firing 5 concurrent reservation requests (quantity = 1 each) in parallel...

=== RESULTS OF CONCURRENT REQUESTS ===
[Request #1] FAILED - Code: INSUFFICIENT_STOCK, Message: Insufficient stock available.
[Request #2] SUCCESS - Reservation ID: 6624277e-c1c2-46ea-9643-5435ad518d87
[Request #3] SUCCESS - Reservation ID: ff63e98c-927d-40bb-a892-8fe0fc83c246
[Request #4] FAILED - Code: INSUFFICIENT_STOCK, Message: Insufficient stock available.
[Request #5] FAILED - Code: INSUFFICIENT_STOCK, Message: Insufficient stock available.

=== FINAL DATABASE STATE ===
- Total Stock in DB: 2
- Reserved Stock in DB: 2
- Available Stock in DB: 0
- Active Reservations in DB: 2

=== CONCURRENCY SAFETY VERIFICATION ===
✅ TEST PASSED! Concurrency safety is fully guaranteed.
```

---

## 📐 Tradeoffs & Future Improvements

### Tradeoffs Made
1. **Pessimistic Database Locking vs. Redis Distributed Locks**:
   - *Tradeoff*: Pessimistic row locking on PostgreSQL is simple, robust, and maintains high ACID guarantees. Under extreme scale (10,000+ contested checkouts per second), keeping open database connections blocked on locks can exhaust pool connections.
   - *Alternative*: For massive hyper-scale, a Redis-based distributed lock (e.g. Redlock / Upstash) or token bucket rate-limiting can shield the primary database from load, checking stock in memory before issuing database writes.
2. **Lazy Cleanup vs. Dedicated Cron**:
   - *Tradeoff*: We implement a dedicated cron endpoint for cleaning up expired reservations. A lazy cleanup (releasing expired stock on product fetch) is a useful backup, but a cron ensures stock availability is returned instantly to the global pool in the background without slowing down other user read requests.

### Future Improvements
1. **Idempotency Key Verification**: Add a middleware check to inspect the `IdempotencyKey` table for repeat POST requests to `/api/reservations` within 10 seconds, returning cached responses and preventing duplicate submissions.
2. **Queueing System**: For highly demanded product launches, instead of rejecting contested requests immediately, route reservations into a message queue (e.g. BullMQ, SQS) to process them sequentially.
