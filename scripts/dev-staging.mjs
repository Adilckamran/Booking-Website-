import 'node:process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// 1. Resolve and load staging environment variables natively in Node 24+
const stagingEnvPath = resolve(process.cwd(), '.env.staging.local');
if (existsSync(stagingEnvPath)) {
  process.loadEnvFile(stagingEnvPath);
  console.log('[Power Padel Staging] Loaded environment variables from .env.staging.local');
} else {
  console.error('[Power Padel Staging] Error: .env.staging.local not found in project root.');
  process.exit(1);
}

// 2. Prepare CLI arguments for Next.js dev server
// Using programmatic launch keeps process.execArgv clean, avoiding NODE_OPTIONS errors in child workers.
const extraArgs = process.argv.slice(2);
process.argv = [process.argv[0], 'next', 'dev', ...extraArgs];

// 3. Launch Next.js dev server
import('next/dist/bin/next');
