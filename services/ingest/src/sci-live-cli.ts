import { runSciLive } from './sci-live.ts';

const databaseUrl = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
if (!databaseUrl) throw new Error('DATABASE_URL is not set');

const apply = process.argv.includes('--apply');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.slice('--limit='.length)) : 10;
if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
  throw new Error('--limit must be an integer from 1 to 50');
}

const result = await runSciLive({ databaseUrl, apply, limit });
console.log(JSON.stringify({ mode: apply ? 'apply' : 'observe-only', ...result }, null, 2));
