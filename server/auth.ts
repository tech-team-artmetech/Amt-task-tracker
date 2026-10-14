import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { User, Role } from './types.ts';
import { getUserById, getUserByEmail } from './db.ts';

// Tokens are signed with JWT_SECRET only. There is deliberately no built-in fallback secret:
// a publicly known default would let anyone forge a login for any account.
function getJwtSecret(): string {
  const secret = (process.env.JWT_SECRET || '').trim();
  if (secret.length >= 16) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set to a random string of at least 16 characters in production.');
  }
  console.warn('[Auth] JWT_SECRET is not set; using an insecure development-only secret.');
  return 'dev-only-insecure-secret-do-not-use-in-production';
}

// Fail fast at startup instead of on the first login attempt.
export function assertAuthConfigured(): void {
  getJwtSecret();
}

export interface AuthenticatedRequest extends Request {
  user?: User;
}

export function generateToken(user: User): string {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
    getJwtSecret(),
    { expiresIn: '7d' }
  );
}

export function verifyToken(token: string): { id: string; name: string; email: string; role: Role } | null {
  if (!token || typeof token !== 'string') return null;
  try {
    const payload = jwt.verify(token, getJwtSecret()) as { id: string; name: string; email: string; role: Role };
    if (payload && (payload.id || payload.email)) {
      return payload;
    }
  } catch {
    // Invalid or expired token
  }
  return null;
}

export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  // A token in the URL ends up in server logs, so it is accepted only for the
  // notification stream (the browser's EventSource cannot send headers).
  const allowQueryToken = req.path === '/api/notifications/stream';
  const queryToken =
    allowQueryToken && typeof req.query?.token === 'string' ? req.query.token.trim() : null;

  let token: string | null = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (queryToken) {
    token = queryToken;
  }

  if (!token) {
    res.status(401).json({ error: 'Authentication required. Please log in.' });
    return;
  }

  let user: User | null = null;

  const payload = verifyToken(token);
  if (payload) {
    if (payload.id) {
      user = await getUserById(payload.id);
    }
    if (!user && payload.email) {
      const raw = await getUserByEmail(payload.email);
      if (raw) {
        user = {
          id: raw.id,
          name: raw.name,
          email: raw.email,
          role: raw.role,
          active: raw.active,
        };
      }
    }
  }

  if (!user || !user.active) {
    res.status(401).json({ error: 'User account not found or deactivated. Please log in again.' });
    return;
  }

  req.user = user;
  next();
}

/**
 * Backend role enforcement middleware
 */
export function requireRole(allowedRoles: Role[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const rawUserRole = (req.user.role || '').trim();
    const userRoleLower = rawUserRole.toLowerCase();
    const normalizedAllowed = allowedRoles.map((r) => (r || '').trim().toLowerCase());

    const isMemberRole = userRoleLower !== 'admin' && userRoleLower !== 'manager';
    const allowsAnyMember = normalizedAllowed.includes('employee') || normalizedAllowed.some(r => ['editors', 'designers', 'cinematographers'].includes(r));

    if (normalizedAllowed.includes(userRoleLower) || (isMemberRole && allowsAnyMember)) {
      next();
      return;
    }

    res.status(403).json({
      error: `Access forbidden: ${rawUserRole} does not have required permissions for this action.`,
    });
  };
}
