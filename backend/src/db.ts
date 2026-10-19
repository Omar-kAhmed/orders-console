import Database from 'better-sqlite3';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const dbPath = process.env.DATABASE_URL || path.join(__dirname, '../orders.db');
export const db = new Database(dbPath);

// Enable WAL mode and optimizations for high concurrency and speed
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');
db.pragma('cache_size = -64000'); // 64 MB cache
db.pragma('temp_store = MEMORY');

export function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'agent')),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT UNIQUE NOT NULL,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending', 'processing', 'completed', 'cancelled')),
      total_amount REAL NOT NULL,
      created_at TEXT NOT NULL,
      idempotency_key TEXT UNIQUE
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      item_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      total_price REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS idempotency_records (
      idempotency_key TEXT PRIMARY KEY,
      request_hash TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('IN_PROGRESS', 'COMPLETED', 'FAILED')),
      status_code INTEGER,
      response_body TEXT,
      order_id INTEGER REFERENCES orders(id),
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    -- Indexes required for sub-second search, status filtering, and sorting over 50,000+ orders
    CREATE INDEX IF NOT EXISTS idx_orders_customer_name ON orders(customer_name);
    CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON orders(customer_email);
    CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_orders_total_amount ON orders(total_amount DESC);
    CREATE INDEX IF NOT EXISTS idx_orders_status_created_at ON orders(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_orders_status_amount ON orders(status, total_amount DESC);
    CREATE INDEX IF NOT EXISTS idx_orders_idempotency_key ON orders(idempotency_key);
    CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  `);
}

// Auto initialize on module load
initializeDatabase();
