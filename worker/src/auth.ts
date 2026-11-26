import type { MiddlewareHandler } from 'hono';
import { AppEnv, AuthUser, fullName, loadAuthUserById, unixNow } from './utils';

const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_SECONDS = 24 * 60 * 60;
const PBKDF2_ITERATIONS = 100000;

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(b64u: string): Uint8Array {
  let b64 = b64u.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4 !== 0) b64 += '=';
  return base64ToBytes(b64);
}

function strToBase64Url(str: string): string {
  return bytesToBase64Url(new TextEncoder().encode(str));
}

function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key,
    256
  );
  return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(new Uint8Array(derived))}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2_sha256') return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 10000 || iterations > 500000) return false;
  try {
    const salt = base64ToBytes(parts[2]);
    const expected = base64ToBytes(parts[3]);
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const derived = new Uint8Array(
      await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, expected.length * 8)
    );
    return timingSafeEqualBytes(derived, expected);
  } catch {
    return false;
  }
}

export function validatePasswordComplexity(
  password: string,
  context?: { username?: string; email?: string; first_name?: string; last_name?: string }
): string[] {
  const errors: string[] = [];
  if (!password || password.length < 8) {
    errors.push('Password must be at least 8 characters long.');
  }
  if (/^\d+$/.test(password || '')) {
    errors.push('Password cannot be entirely numeric.');
  }
  const common = new Set(['password', '12345678', 'qwerty123', 'admin123', 'letmein1', 'welcome1', 'password123']);
  if (common.has((password || '').toLowerCase())) {
    errors.push('This password is too common.');
  }
  if (context?.username && password.toLowerCase().includes(context.username.toLowerCase()) && context.username.length >= 3) {
    errors.push('Password is too similar to the username.');
  }
  return errors;
}

export interface JwtClaims {
  token_type: 'access' | 'refresh';
  user_id: number;
  username: string;
  role: string;
  name: string;
  email: string;
  jti: string;
  iat: number;
  exp: number;
}

async function getHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function signJwt(claims: JwtClaims, secret: string): Promise<string> {
  const header = strToBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = strToBase64Url(JSON.stringify(claims));
  const data = `${header}.${payload}`;
  const key = await getHmacKey(secret);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)));
  return `${data}.${bytesToBase64Url(sig)}`;
}

export async function verifyJwt(token: string, secret: string): Promise<JwtClaims | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const data = `${parts[0]}.${parts[1]}`;
    const sig = base64UrlToBytes(parts[2]);
    const key = await getHmacKey(secret);
    const valid = await crypto.subtle.verify('HMAC', key, sig, new TextEncoder().encode(data));
    if (!valid) return null;
    const claimsJson = new TextDecoder().decode(base64UrlToBytes(parts[1]));
    const claims = JSON.parse(claimsJson) as JwtClaims;
    if (!claims.exp || claims.exp <= unixNow()) return null;
    return claims;
  } catch {
    return null;
  }
}

export async function isTokenBlacklisted(db: D1Database, jti: string): Promise<boolean> {
  const row = await db.prepare('SELECT jti FROM token_blacklist WHERE jti = ?').bind(jti).first();
  return Boolean(row);
}

export async function blacklistToken(db: D1Database, jti: string, expiresAt: number): Promise<void> {
  await db
    .prepare('INSERT OR IGNORE INTO token_blacklist (jti, expires_at) VALUES (?, ?)')
    .bind(jti, expiresAt)
    .run();
}

export async function issueTokenPair(user: AuthUser, secret: string): Promise<{ access: string; refresh: string }> {
  const now = unixNow();
  const base = {
    user_id: user.id,
    username: user.username,
    role: user.role,
    name: fullName(user.first_name, user.last_name, user.username),
    email: user.email,
    iat: now,
  };
  const access = await signJwt(
    { ...base, token_type: 'access', jti: crypto.randomUUID(), exp: now + ACCESS_TTL_SECONDS },
    secret
  );
  const refresh = await signJwt(
    { ...base, token_type: 'refresh', jti: crypto.randomUUID(), exp: now + REFRESH_TTL_SECONDS },
    secret
  );
  return { access, refresh };
}

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const authHeader = c.req.header('Authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return c.json({ detail: 'Authentication credentials were not provided.' }, 401);
  }
  const secret = c.env.JWT_SECRET;
  if (!secret) {
    console.error(JSON.stringify({ message: 'JWT_SECRET not configured' }));
    return c.json({ detail: 'Authentication service misconfigured.' }, 500);
  }
  const claims = await verifyJwt(match[1].trim(), secret);
  if (!claims || claims.token_type !== 'access') {
    return c.json({ detail: 'Given token not valid for any token type', code: 'token_not_valid' }, 401);
  }
  if (await isTokenBlacklisted(c.env.DB, claims.jti)) {
    return c.json({ detail: 'Token is blacklisted', code: 'token_not_valid' }, 401);
  }
  const user = await loadAuthUserById(c.env.DB, claims.user_id);
  if (!user) {
    return c.json({ detail: 'User not found or inactive.' }, 401);
  }
  c.set('user', user);
  c.set('jti', claims.jti);
  await next();
};
