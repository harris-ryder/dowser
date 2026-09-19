import type { NextFunction, Request, Response } from 'express';
import { RATE_LIMIT_PER_MINUTE } from '../config.js';

// Per-instance sliding window. Good enough for a read-only public API; on serverless each
// warm instance keeps its own window, so the effective limit is approximate.
const buckets = new Map<string, number[]>();
const WINDOW_MS = 60_000;

function keyFor(req: Request): string {
  const auth = req.header('authorization');
  if (auth) return `k:${auth.slice(-16)}`;
  return `ip:${req.ip ?? 'unknown'}`;
}

export function rateLimit(req: Request, res: Response, next: NextFunction): void {
  if (RATE_LIMIT_PER_MINUTE <= 0) return next();
  const now = Date.now();
  const key = keyFor(req);
  const arr = (buckets.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (arr.length >= RATE_LIMIT_PER_MINUTE) {
    res.setHeader('Retry-After', '60');
    res.status(429).json({ error: 'rate_limited', message: `Limit is ${RATE_LIMIT_PER_MINUTE} requests per minute.` });
    return;
  }
  arr.push(now);
  buckets.set(key, arr);
  if (buckets.size > 5000) {
    // Drop stale keys occasionally so memory stays bounded.
    for (const [k, v] of buckets) if (v.every((t) => now - t >= WINDOW_MS)) buckets.delete(k);
  }
  next();
}
