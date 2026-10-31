import { createDemoBackend } from './demoBackend'
import { createSupabaseBackend } from './supabaseBackend'
import type { Backend } from './types'

const env = import.meta.env
const url = env.VITE_SUPABASE_URL as string | undefined
const key = env.VITE_SUPABASE_ANON_KEY as string | undefined
export const isDemo = env.VITE_DEMO_MODE === 'true' || !url || !key || key.startsWith('paste-')

export const api: Backend = isDemo ? createDemoBackend() : createSupabaseBackend(url!, key!)
