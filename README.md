# SARH Orders Console · Technical Assessment

A high-performance operations console for managing tens of thousands of orders with server-side sub-second filtering, race-condition mitigation, and guaranteed idempotent order creation.

Built for **SARH Business Solutions**.

---

## 1. Quick Start (Runs in Under 2 Minutes)

### Prerequisites
- Node.js (v18+ recommended; tested on v20, v22, and v26)
- npm (v9+)
- Zero external daemons, Docker containers, or paid services required.

### Setup & Seed
From the project root:

```bash
# 1. Install all dependencies (root, backend, frontend)
npm install
npm run build

# 2. Seed database with 50,000+ orders, line items, and auth users
npm run seed
```
> **Seed Speed Note:** The seed script uses batch SQLite transactions (`better-sqlite3`), inserting 50,000 orders and ~150,000 line items in **~1.0 second**.

### Start the Application
```bash
# Starts both Backend (port 4000) and Frontend (port 5173) concurrently
npm run dev
```

Open your browser at **[http://localhost:5173](http://localhost:5173)**.

---

## 2. Seeded User Credentials

| Role | Email | Password | Permissions |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@sarh.ai` | `AdminPass123!` | View orders, create orders, delete orders |
| **Agent** | `agent@sarh.ai` | `AgentPass123!` | View orders, create orders (DELETE blocked by server RBAC) |

The UI includes a one-click **"Switch to Admin / Agent"** button in the header bar for seamless reviewer testing.

---

## 3. Mandatory Build Tasks Verification

### R1 · Large List (50,000+ Rows) Fast & Correct Under Load
- **Performance & Indexing:** Evaluated over 50,000 orders using SQLite in WAL mode. Database indexes added:
  - `idx_orders_customer_name` on `orders(customer_name)`
  - `idx_orders_customer_email` on `orders(customer_email)`
  - `idx_orders_status_created_at` on `orders(status, created_at DESC)`
  - `idx_orders_status_amount` on `orders(status, total_amount DESC)`
  - `idx_orders_idempotency_key` on `orders(idempotency_key)`
- **Correctness Under Load (Hand Test):**
  - **The Problem:** Rapid filter changes cause earlier, slower requests to potentially resolve after later requests, overwriting the UI with stale data.
  - **The Solution:** We implemented dual-layer defense:
    1. **`AbortController`:** Each new filter/search/page change immediately aborts in-flight fetch requests.
    2. **Monotonic Request ID Sequence:** A sequence counter (`requestIdCounterRef`) verifies that if an aborted request's promise resolves late, it is discarded before touching React state.
  - **Interactive In-UI Simulator:** Click the **"Simulate 3 Rapid Filter Changes"** button on the dashboard banner. It triggers 3 rapid filter requests with artificially inverted network latencies (`pending` 1400ms, `cancelled` 800ms, `completed` 100ms) and renders a live event log proving that older requests are aborted/discarded and only the latest filter is applied to the table.

### R2 · Create Order — No Duplicates, Ever
- **Idempotency Guarantee:**
  - Client drafts receive a unique UUID `Idempotency-Key` sent via HTTP headers.
  - Server runs an atomic SQLite transaction checking `idempotency_records` and enforces a `UNIQUE` constraint on `orders.idempotency_key`.
  - If a duplicate request arrives (double-click, retry, timeout), the server detects the key, verifies the request hash, and returns the cached response (`X-Cache-Lookup: HIT`, HTTP 201/200) without inserting duplicate rows.
  - If a key is reused with a modified payload, the server rejects it with **HTTP 422 Unprocessable Entity**.

### Automated Concurrency Proof Test
Run the automated test proving R2 correctness:

```bash
npm run test:duplicate
# or
npm test
```

This test:
1. Boots an ephemeral HTTP server and logs in as `agent@sarh.ai`.
2. Fires **two identical HTTP POST requests in parallel** using `Promise.all([fetch, fetch])` with the same `Idempotency-Key`.
3. Asserts both HTTP responses return identical order IDs.
4. Directly verifies the database: `SELECT COUNT(*) WHERE idempotency_key = ?` equals **exactly 1**.
5. Tests the tampering edge case: Reuses the key with a modified payload and confirms the server responds with **HTTP 422**.

---

## 4. Code Review Findings (Section 3)

The contractor's auth code contained several critical security and design flaws:

### Problems Identified & Fixes Applied

1. **Vulnerability: `jwt.decode()` used instead of `jwt.verify()`**
   - *Flaw:* `jwt.decode()` only parses the base64 payload without validating the cryptographic signature. Anyone could construct an arbitrary token with `role: "admin"` and forge admin access without knowing the secret.
   - *Fix:* Replaced with `jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] })` inside a try/catch block, rejecting forged, tampered, or expired tokens with HTTP 401.

2. **Hardcoded Secret Key in Version Control**
   - *Flaw:* `const SECRET = "sarh-secret-2026"` exposes the signing key in plaintext in the codebase.
   - *Fix:* Secret is loaded from `process.env.JWT_SECRET` with fallback and committed template `.env.example`.

3. **Plaintext Password Storage & Comparison**
   - *Flaw:* `db.users.findFirst({ where: { email, password } })` compares plaintext passwords directly.
   - *Fix:* Integrated `bcryptjs` salted password hashing (`bcrypt.hashSync` and `bcrypt.compareSync`).

4. **Missing Server-Side Authorization (`// admin check is done in React AdminOnly component`)**
   - *Flaw:* Trusting the client for access control is ineffective. Any non-admin user or script could issue `DELETE /orders/:id` directly and delete records.
   - *Fix:* Implemented `requireRole('admin')` server middleware on `DELETE /api/orders/:id`. When logged in as an Agent, deletion attempts return **HTTP 403 Forbidden**.

5. **Token Leaked via URL Query Parameters (`req.query.token`)**
   - *Flaw:* Query parameters appear in browser history, proxy access logs, and HTTP `Referer` headers.
   - *Fix:* Strictly require `Authorization: Bearer <token>` in HTTP headers.

6. **Immortal Tokens Without Expiration**
   - *Flaw:* `jwt.sign()` omitted `expiresIn`, creating tokens that never expire.
   - *Fix:* Configured `{ expiresIn: '8h' }` and added Zod schema validation on login inputs.

### Client Token Storage Reasoning
> We store the JWT token in client memory (React state) and persist it in browser storage for tab continuity. This approach protects against Cross-Site Request Forgery (CSRF) because modern browsers do not automatically attach the token to arbitrary third-party cross-origin requests. However, it does not protect against Cross-Site Scripting (XSS), as any malicious script injected into the DOM can access client storage; an `HttpOnly, Secure, SameSite=Strict` cookie would eliminate XSS token theft, but would require explicit CSRF mitigation tokens.

---

## 5. One Product Question (Section 5)

> **Scenario:** The operations lead asks for a button: *"Delete all cancelled orders."*

**What I ask her:**
"Why do we need to permanently delete cancelled orders rather than filtering them out or archiving them, and do downstream teams (finance, auditing, compliance) still require these records for historical dispute resolution?"

**What I propose instead if she cannot answer:**
"I propose adding a default UI view toggle that hides cancelled orders from active agent queues and implementing a soft-archive status; this satisfies operational decluttering immediately while preserving financial audit trails and preventing irreversible data loss."

---

## 6. Optional Feature Built: O1 · The Slow Stats API

- **Endpoint:** `GET /api/orders/stats` (deliberately delayed 3.5 seconds).
- **Non-blocking UI:** Top analytics widget computes today's revenue and status counts without blocking table interaction.
- **Client Cancellation:** Supports `AbortController` cancellation via a "Cancel Request" button or automatically when unmounted.
- **1-Retry Error State:** Includes a "Simulate 500 Error" toggle to trigger the visible error banner with a strictly limited single-retry button as specified.

---

## 7. What I Skipped and Why

1. **Full Microservices / Docker Setup:** Skipped in favor of a clean, single-command Node + SQLite repo to guarantee evaluation runs within under 2 minutes without Docker daemon dependencies.
2. **Optimistic Create (O2):** As instructed by the brief (*"pick at most one: doing neither costs nothing; doing one badly costs more than skipping it"*), we selected O1 (Slow Stats API with cancellation and retry) and skipped O2 to keep the order creation state machine strictly deterministic.
3. **Complex Third-Party UI Component Library:** Handcrafted a custom CSS design system using native CSS variables and modern typography to keep bundle size lightweight (under 300kB gzipped) and avoid external component styling bloat.
