import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CardsFile, FreebiesFile, ProgramsFile, RecallsFile, SettlementsFile } from '../types.js';

const cache = new Map<string, unknown>();

/** Resolve a file in /data whether we run from src (tsx), dist (node) or a Vercel bundle. */
export function dataPath(name: string): string {
  const here = fileURLToPath(new URL('.', import.meta.url));
  const candidates = [
    path.join(process.cwd(), 'data', name),
    path.resolve(here, '../../data', name), // dist/lib → root/data, src/lib → root/data
    path.resolve(here, '../data', name)
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  return candidates[0];
}

export function publicDir(): string {
  const here = fileURLToPath(new URL('.', import.meta.url));
  const candidates = [path.join(process.cwd(), 'public'), path.resolve(here, '../../public')];
  for (const c of candidates) if (existsSync(c)) return c;
  return candidates[0];
}

export function loadJson<T>(name: string): T {
  const hit = cache.get(name);
  if (hit) return hit as T;
  const file = dataPath(name);
  if (!existsSync(file)) {
    throw new Error(`Data file missing: ${file}. Run \`npm run build:data\` first.`);
  }
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as T;
  cache.set(name, parsed);
  return parsed;
}

export function clearDataCache(): void {
  cache.clear();
}

export const loadSettlements = (): SettlementsFile => loadJson<SettlementsFile>('settlements.json');
export const loadRecalls = (): RecallsFile => loadJson<RecallsFile>('recalls.json');
export const loadCards = (): CardsFile => loadJson<CardsFile>('cards.json');
export const loadPrograms = (): ProgramsFile => loadJson<ProgramsFile>('programs.json');
export const loadFreebies = (): FreebiesFile => loadJson<FreebiesFile>('freebies.json');
