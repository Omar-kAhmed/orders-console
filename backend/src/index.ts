import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { requireAuth, requireRole, handleLogin } from './auth';
import { getOrders, getOrderById, createOrder, deleteOrder, getOrderStats } from './orders';
import './db'; // Ensures DB schema and WAL mode are initialized

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Standard middlewares
app.use(cors({
  origin: '*', // Allows local dev frontend at localhost:5173
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'x-simulate-delay']
}));
app.use(express.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Authentication endpoints
app.post('/api/auth/login', handleLogin);
app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// Orders endpoints
app.get('/api/orders', getOrders);
app.get('/api/orders/stats', getOrderStats);
app.get('/api/orders/:id', getOrderById);

// Create order requires authentication and an Idempotency-Key
app.post('/api/orders', requireAuth, createOrder);

// Admin-only deletion endpoint (replaces contractor insecure route)
app.delete('/api/orders/:id', requireAuth, requireRole('admin'), deleteOrder);

// Global 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: 'Internal server error', details: err.message });
});

app.listen(PORT, () => {
  console.log(`✓ Orders Console Backend listening on http://localhost:${PORT}`);
  console.log(`✓ Database: SQLite (WAL mode enabled)`);
});

export default app;
