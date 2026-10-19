import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from './db';

const JWT_SECRET = process.env.JWT_SECRET || 'sarh-production-secret-replace-me-in-prod-2026';

export interface AuthUser {
  sub: number;
  email: string;
  name: string;
  role: 'admin' | 'agent';
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Robust authentication middleware replacing contractor code.
 * Fixes:
 * 1. Uses jwt.verify() instead of jwt.decode() to verify cryptographic signature and expiration.
 * 2. Strictly extracts token from 'Authorization: Bearer <token>' header, rejecting query parameter token leaks.
 * 3. Secret is read from environment variables (process.env.JWT_SECRET) with fallback.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const payload = (jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as unknown) as AuthUser;
    req.user = payload;
    next();
  } catch (err: any) {
    return res.status(401).json({ error: 'Invalid or expired token', details: err.message });
  }
}

/**
 * Server-side Role-Based Access Control (RBAC) middleware.
 * Fixes:
 * - Solves contractor flaw of trusting client-side AdminOnly component.
 * - Enforces role authorization strictly on the backend before executing privileged actions.
 */
export function requireRole(...allowedRoles: Array<'admin' | 'agent'>) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Forbidden: role '${req.user.role}' is not authorized. Required: ${allowedRoles.join(', ')}`
      });
    }

    next();
  };
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

/**
 * Secure login handler.
 * Fixes:
 * 1. Uses bcrypt.compareSync to check salted password hash against DB instead of plaintext comparison.
 * 2. Validates inputs using Zod schema.
 * 3. Issues signed JWT with standard claims (sub, email, role, name) and 8-hour expiration.
 */
export function handleLogin(req: Request, res: Response) {
  const validation = loginSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: 'Invalid email or password format', issues: validation.error.format() });
  }

  const { email, password } = validation.data;
  const user = db.prepare('SELECT id, email, password_hash, name, role FROM users WHERE email = ?').get(email) as any;

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const payload: AuthUser = {
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h', algorithm: 'HS256' });

  return res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role
    }
  });
}
