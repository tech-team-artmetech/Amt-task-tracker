import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { User, Role } from './types.ts';
import { getUserById, getUserByEmail, getOrCreateFirebaseUser } from './db.ts';
import { adminAuth } from '../src/lib/firebase-admin.ts';

function getJwtSecrets(): string[] {
  const secrets = [
    process.env.JWT_SECRET,
    'whiteboard_jwt_secret_change_in_production',
    'secret-key123',
  ].filter(Boolean) as string[];

  return Array.from(new Set(secrets));
}

export interface AuthenticatedRequest extends Request {
  user?: User;
}

export function generateToken(user: User): string {
  const primarySecret = process.env.JWT_SECRET || 'whiteboard_jwt_secret_change_in_production';
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
    primarySecret,
    { expiresIn: '7d' }
  );
}

export function verifyToken(token: string): { id: string; name: string; email: string; role: Role } | null {
  if (!token || typeof token !== 'string') return null;

  const secrets = getJwtSecrets();
  for (const secret of secrets) {
    try {
      const payload = jwt.verify(token, secret) as { id: string; name: string; email: string; role: Role };
      if (payload && (payload.id || payload.email)) {
        return payload;
      }
    } catch {
      // Continue trying next known secret candidate
    }
  }

  return null;
}

export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  const queryToken = typeof req.query?.token === 'string' ? req.query.token.trim() : null;

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

  // 1. Check if token is a Firebase ID Token (Google OAuth / Firebase Sign-in)
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    if (decoded && (decoded.uid || decoded.email)) {
      user = await getOrCreateFirebaseUser(
        decoded.uid,
        decoded.email || '',
        decoded.name || (decoded as any).displayName
      );
    }
  } catch {
    // Not a Firebase ID token, proceed to check custom app JWT
  }

  // 2. Custom JWT verification (seed accounts, direct email/pass login)
  if (!user) {
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
