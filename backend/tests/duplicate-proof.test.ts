import http from 'http';
import app from '../src/index';
import { db } from '../src/db';
import crypto from 'crypto';

async function runDuplicateProofTest() {
  console.log('====================================================');
  console.log('  R2 DUPLICATE PROOF TEST: CONCURRENCY & IDEMPOTENCY');
  console.log('====================================================\n');

  // 1. Start server on an ephemeral port
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as any;
  const baseUrl = `http://localhost:${address.port}`;
  console.log(`[Test Setup] Test server running on ${baseUrl}`);

  try {
    // 2. Authenticate as agent to obtain JWT token
    console.log('[Test Setup] Authenticating as agent@sarh.ai...');
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'agent@sarh.ai', password: 'AgentPass123!' })
    });

    if (!loginRes.ok) {
      throw new Error(`Login failed with status ${loginRes.status}: ${await loginRes.text()}`);
    }

    const { token } = await loginRes.json() as { token: string };
    console.log('[Test Setup] JWT token acquired successfully.\n');

    // 3. Prepare order payload and shared Idempotency-Key
    const sharedIdempotencyKey = `idemp-test-${crypto.randomUUID()}`;
    const orderPayload = {
      customerName: 'Concurrency Test Customer',
      customerEmail: 'concurrency.tester@sarh.ai',
      status: 'pending',
      items: [
        { name: 'Ergonomic Desk Chair', quantity: 2, unitPrice: 220.50 },
        { name: 'Wireless Mechanical Keyboard', quantity: 1, unitPrice: 85.00 }
      ]
    };

    console.log(`[Test Execution] Firing 2 parallel HTTP POST requests with identical Idempotency-Key:`);
    console.log(`  Key: ${sharedIdempotencyKey}`);
    console.log(`  Expected behavior: Exactly ONE order created in DB; both requests succeed.\n`);

    const fireRequest = async (requestId: number) => {
      const startTime = Date.now();
      const res = await fetch(`${baseUrl}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Idempotency-Key': sharedIdempotencyKey
        },
        body: JSON.stringify(orderPayload)
      });
      const data = await res.json() as any;
      const durationMs = Date.now() - startTime;
      const cacheHeader = res.headers.get('x-cache-lookup');
      return { requestId, status: res.status, data, durationMs, cacheHeader };
    };

    // 4. Fire requests simultaneously
    const [res1, res2] = await Promise.all([fireRequest(1), fireRequest(2)]);

    console.log(`[Response 1] Status: ${res1.status} | Order ID: ${res1.data.id} | Order#: ${res1.data.order_number} (${res1.durationMs}ms) [Cache: ${res1.cacheHeader || 'MISS'}]`);
    console.log(`[Response 2] Status: ${res2.status} | Order ID: ${res2.data.id} | Order#: ${res2.data.order_number} (${res2.durationMs}ms) [Cache: ${res2.cacheHeader || 'MISS'}]`);

    // 5. Assertions on HTTP responses
    if ((res1.status !== 201 && res1.status !== 200) || (res2.status !== 201 && res2.status !== 200)) {
      throw new Error(`HTTP status assertion failed: Res1=${res1.status}, Res2=${res2.status}`);
    }

    if (res1.data.id !== res2.data.id || res1.data.order_number !== res2.data.order_number) {
      throw new Error(`Mismatch in order identities: Res1 Order=${res1.data.id}, Res2 Order=${res2.data.id}`);
    }
    console.log('\n✓ Assertion 1 PASSED: Both parallel requests returned identical order identity.');

    // 6. Direct Database Assertions
    const dbOrderCount = db.prepare(
      'SELECT COUNT(*) as count FROM orders WHERE idempotency_key = ?'
    ).get(sharedIdempotencyKey) as { count: number };

    console.log(`[DB Verification] Total orders in database for idempotency key: ${dbOrderCount.count}`);
    if (dbOrderCount.count !== 1) {
      throw new Error(`CRITICAL FAILURE: Found ${dbOrderCount.count} orders in database for key ${sharedIdempotencyKey}! Expected exactly 1.`);
    }
    console.log('✓ Assertion 2 PASSED: Exactly 1 order exists in database (No duplicate created).');

    // 7. Verify line items were not duplicated
    const createdOrderId = res1.data.id;
    const dbItemCount = db.prepare(
      'SELECT COUNT(*) as count FROM order_items WHERE order_id = ?'
    ).get(createdOrderId) as { count: number };

    console.log(`[DB Verification] Total order items in database for Order #${createdOrderId}: ${dbItemCount.count}`);
    if (dbItemCount.count !== orderPayload.items.length) {
      throw new Error(`Line items mismatch: Found ${dbItemCount.count} items, expected ${orderPayload.items.length}`);
    }
    console.log('✓ Assertion 3 PASSED: Order items count strictly matches payload (no line item duplication).');

    // 8. Test Edge Case: Key reuse with tampered / different payload
    console.log('\n[Edge Case Test] Attempting to reuse the same Idempotency-Key with a different payload...');
    const tamperedPayload = {
      ...orderPayload,
      customerName: 'Tampered Hacker Name'
    };
    const tamperedRes = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Idempotency-Key': sharedIdempotencyKey
      },
      body: JSON.stringify(tamperedPayload)
    });

    console.log(`[Edge Case Response] Status: ${tamperedRes.status} (Expected 422 Unprocessable Entity)`);
    if (tamperedRes.status !== 422) {
      throw new Error(`Expected 422 Unprocessable Entity for tampered payload, got ${tamperedRes.status}`);
    }
    console.log('✓ Assertion 4 PASSED: Server safely detected and rejected key reuse with modified payload.');

    console.log('\n====================================================');
    console.log('  ALL R2 IDEMPOTENCY & CONCURRENCY TESTS PASSED!     ');
    console.log('====================================================\n');
  } finally {
    server.close();
  }
}

runDuplicateProofTest()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ TEST FAILED:', err);
    process.exit(1);
  });
