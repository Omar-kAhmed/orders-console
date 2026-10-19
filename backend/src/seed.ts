import { db, initializeDatabase } from './db';
import bcrypt from 'bcryptjs';

const FIRST_NAMES = [
  'Mohammed', 'Fatima', 'Omar', 'Sarah', 'Abdullah', 'Noura', 'Khalid', 'Layla',
  'Ali', 'Zainab', 'Youssef', 'Mariam', 'Ibrahim', 'Reem', 'Ahmed', 'Huda',
  'Sultan', 'Maha', 'Fahad', 'Amina', 'James', 'Elena', 'David', 'Sophia', 'Alexander'
];

const LAST_NAMES = [
  'Al-Otaibi', 'Al-Ghamdi', 'Al-Zahrani', 'Al-Harbi', 'Al-Shehri', 'Al-Dosari',
  'Al-Shammari', 'Al-Mutairi', 'Al-Qahtani', 'Al-Anazi', 'Smith', 'Johnson',
  'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez'
];

const DOMAINS = ['sarh.ai', 'example.com', 'mail.com', 'business.sa', 'enterprise.io', 'techcorp.net'];

const STATUSES = ['pending', 'processing', 'completed', 'cancelled'] as const;

const PRODUCTS = [
  { name: 'Ergonomic Desk Chair', minPrice: 180, maxPrice: 350 },
  { name: 'Ultra-wide 4K Monitor', minPrice: 400, maxPrice: 850 },
  { name: 'Wireless Mechanical Keyboard', minPrice: 75, maxPrice: 160 },
  { name: 'Precision Optical Mouse', minPrice: 35, maxPrice: 90 },
  { name: 'Noise-Cancelling Headset', minPrice: 120, maxPrice: 280 },
  { name: 'USB-C Docking Station', minPrice: 65, maxPrice: 140 },
  { name: 'Adjustable Standing Desk', minPrice: 300, maxPrice: 600 },
  { name: 'LED Desk Lamp with Wireless Charger', minPrice: 30, maxPrice: 70 },
  { name: 'Cable Management Spine', minPrice: 15, maxPrice: 35 },
  { name: 'Aluminium Laptop Stand', minPrice: 25, maxPrice: 55 }
];

function getRandomItem<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function seed() {
  console.log('--- Initializing database schema ---');
  initializeDatabase();

  console.log('--- Clearing previous seed data ---');
  db.exec(`
    DELETE FROM order_items;
    DELETE FROM idempotency_records;
    DELETE FROM orders;
    DELETE FROM users;
  `);

  console.log('--- Seeding authentication users ---');
  const insertUser = db.prepare(`
    INSERT INTO users (email, password_hash, name, role, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  const now = new Date().toISOString();
  // Passwords: AdminPass123! and AgentPass123!
  const adminHash = bcrypt.hashSync('AdminPass123!', 10);
  const agentHash = bcrypt.hashSync('AgentPass123!', 10);

  insertUser.run('admin@sarh.ai', adminHash, 'Admin Operations Lead', 'admin', now);
  insertUser.run('agent@sarh.ai', agentHash, 'Agent Support Staff', 'agent', now);
  console.log('✓ Seeded users: admin@sarh.ai and agent@sarh.ai');

  const TARGET_ORDERS = 50000;
  console.log(`--- Seeding ${TARGET_ORDERS} realistic orders with line items ---`);
  const startTime = Date.now();

  const insertOrder = db.prepare(`
    INSERT INTO orders (id, order_number, customer_name, customer_email, status, total_amount, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertOrderItem = db.prepare(`
    INSERT INTO order_items (order_id, item_name, quantity, unit_price, total_price)
    VALUES (?, ?, ?, ?, ?)
  `);

  // Spread dates over past 180 days up to now
  const nowMs = Date.now();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const BATCH_SIZE = 5000;

  const insertBatch = db.transaction((startId: number, count: number) => {
    for (let i = 0; i < count; i++) {
      const orderId = startId + i;
      const firstName = getRandomItem(FIRST_NAMES);
      const lastName = getRandomItem(LAST_NAMES);
      const customerName = `${firstName} ${lastName}`;
      const emailUsername = `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(/[^a-z0-9]/g, '')}${getRandomInt(1, 999)}`;
      const customerEmail = `${emailUsername}@${getRandomItem(DOMAINS)}`;
      const status = getRandomItem(STATUSES);

      // Random date within past 180 days
      const daysAgo = Math.random() * 180;
      const createdDate = new Date(nowMs - daysAgo * ONE_DAY_MS).toISOString();
      const orderNumber = `ORD-${String(orderId).padStart(6, '0')}`;

      // 1 to 5 line items
      const itemCount = getRandomInt(1, 5);
      let totalAmount = 0;

      const items: Array<{ name: string; qty: number; unitPrice: number; totalPrice: number }> = [];
      for (let j = 0; j < itemCount; j++) {
        const prod = getRandomItem(PRODUCTS);
        const qty = getRandomInt(1, 4);
        const unitPrice = parseFloat((Math.random() * (prod.maxPrice - prod.minPrice) + prod.minPrice).toFixed(2));
        const totalPrice = parseFloat((qty * unitPrice).toFixed(2));
        totalAmount += totalPrice;
        items.push({ name: prod.name, qty, unitPrice, totalPrice });
      }
      totalAmount = parseFloat(totalAmount.toFixed(2));

      insertOrder.run(orderId, orderNumber, customerName, customerEmail, status, totalAmount, createdDate);

      for (const item of items) {
        insertOrderItem.run(orderId, item.name, item.qty, item.unitPrice, item.totalPrice);
      }
    }
  });

  for (let current = 1; current <= TARGET_ORDERS; current += BATCH_SIZE) {
    const batchCount = Math.min(BATCH_SIZE, TARGET_ORDERS - current + 1);
    insertBatch(current, batchCount);
    process.stdout.write(`\rSeeded ${current + batchCount - 1} / ${TARGET_ORDERS} orders...`);
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n✓ Successfully seeded ${TARGET_ORDERS} orders in ${durationSec}s!`);

  const countResult = db.prepare('SELECT COUNT(*) as count FROM orders').get() as { count: number };
  const itemsResult = db.prepare('SELECT COUNT(*) as count FROM order_items').get() as { count: number };
  console.log(`Verified DB stats: ${countResult.count} orders, ${itemsResult.count} line items.`);
}

if (require.main === module) {
  seed();
}
