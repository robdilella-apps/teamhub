#!/usr/bin/env node
// Writes .env from a running local Supabase (`npx supabase start`).
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

let out
try { out = execSync('npx supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }) }
catch { console.error('Could not read Supabase status. Run `npx supabase start` first.'); process.exit(1) }
const get = (k) => (out.match(new RegExp(`^${k}="?([^"\\n]+)"?`, 'm')) || [])[1]
const url = get('API_URL'), key = get('ANON_KEY')
if (!url || !key) { console.error('API_URL / ANON_KEY not found in `supabase status` output.'); process.exit(1) }
let env = readFileSync(existsSync('.env') ? '.env' : '.env.example', 'utf8')
env = env.replace(/^VITE_SUPABASE_URL=.*$/m, `VITE_SUPABASE_URL=${url}`).replace(/^VITE_SUPABASE_ANON_KEY=.*$/m, `VITE_SUPABASE_ANON_KEY=${key}`).replace(/^VITE_DEMO_MODE=.*$/m, 'VITE_DEMO_MODE=false')
writeFileSync('.env', env)
console.log(`.env written for ${url}. Now run: npm run dev  (sign in as alex@example.com / teamhub-demo)`)
