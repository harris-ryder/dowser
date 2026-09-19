import type { NextFunction, Request, Response } from 'express';
import { API_KEYS } from '../config.js';

/** Optional bearer-key gate. Active only when DOWSER_API_KEYS is set. */
export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  if (API_KEYS.length === 0) return next();
  const header = req.header('authorization') ?? '';
  const bearer = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  const key = bearer || req.header('x-api-key') || '';
  if (key && API_KEYS.includes(key)) return next();
  res.setHeader('WWW-Authenticate', 'Bearer realm="dowser"');
  res.status(401).json({ error: 'unauthorized', message: 'Provide a valid API key as a Bearer token or X-Api-Key header.' });
}
